import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ApiError = {
  status: number;
  code: string;
  message: string;
};

type CreatePrivateRequestResult = {
  id: string;
  room_id: string;
  streamer_id: string;
  viewer_id: string;
  status: string;
  created_at: string;
};

type PrivateRequestRow = {
  id: string;
  room_id: string;
  streamer_id: string;
  viewer_id: string;
  status: string;
  viewer_note: string | null;
  streamer_note: string | null;
  created_at: string;
  decided_at: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

const CREATE_ERROR_BY_CODE: Record<string, ApiError> = {
  AUTH_REQUIRED: { status: 401, code: "AUTH_REQUIRED", message: "Giriş yapmalısın." },
  BANNED: { status: 403, code: "BANNED", message: "Hesabınız kısıtlanmıştır." },
  ROOM_NOT_LIVE: { status: 409, code: "ROOM_NOT_LIVE", message: "Yayın şu an kapalı." },
  SELF_REQUEST_NOT_ALLOWED: {
    status: 400,
    code: "SELF_REQUEST_NOT_ALLOWED",
    message: "Kendi yayınınıza özel oda talebi gönderemezsiniz.",
  },
  ROOM_BANNED: { status: 403, code: "ROOM_BANNED", message: "Bu odaya girişiniz engellenmiştir." },
  INSUFFICIENT_MINUTES: {
    status: 402,
    code: "INSUFFICIENT_MINUTES",
    message: "Süreniz yeterli değil. Özel odaya geçmek için dakika satın almalısınız.",
  },
  PENDING_REQUEST_EXISTS: {
    status: 409,
    code: "PENDING_REQUEST_EXISTS",
    message: "Bu yayıncıya bekleyen bir özel oda talebiniz var.",
  },
};

const ALLOWED_STATUSES = new Set(["pending", "accepted", "rejected", "cancelled", "expired"]);

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}

function resolveErrorCode(
  error: { message?: string | null; details?: string | null; hint?: string | null },
  knownMap: Record<string, ApiError>,
) {
  const candidates = [error.message, error.details, error.hint];
  for (const candidate of candidates) {
    const key = candidate?.trim();
    if (key && knownMap[key]) {
      return key;
    }
  }
  return null;
}

function parseBearer(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return header;
}

function createAuthedClient(authHeader: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: authHeader,
      },
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
        }),
    },
  });
}

async function readCurrentUser(authHeader: string) {
  const supabase = createAuthedClient(authHeader);
  if (!supabase) {
    return { supabase: null, userId: null };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

export async function POST(request: Request) {
  const authHeader = parseBearer(request);
  if (!authHeader) {
    const authError = CREATE_ERROR_BY_CODE.AUTH_REQUIRED;
    return noStoreJson({ ok: false, code: authError.code, message: authError.message }, { status: authError.status });
  }

  let payload: { roomId?: unknown; viewerNote?: unknown };
  try {
    payload = (await request.json()) as { roomId?: unknown; viewerNote?: unknown };
  } catch {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Özel oda talebi gönderilemedi." }, { status: 400 });
  }

  const roomId = typeof payload.roomId === "string" ? payload.roomId.trim() : "";
  const viewerNote = typeof payload.viewerNote === "string" ? payload.viewerNote.trim() : null;
  if (!roomId) {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Özel oda talebi gönderilemedi." }, { status: 400 });
  }

  const supabase = createAuthedClient(authHeader);
  if (!supabase) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Özel oda talebi gönderilemedi." }, { status: 500 });
  }

  const { data, error } = await supabase.rpc("create_private_room_request", {
    p_room_id: roomId,
    p_viewer_note: viewerNote,
  });

  if (error) {
    const code = resolveErrorCode(error, CREATE_ERROR_BY_CODE);
    const known = code ? CREATE_ERROR_BY_CODE[code] : null;
    return noStoreJson(
      {
        ok: false,
        code: known?.code ?? "UNKNOWN_ERROR",
        message: known?.message ?? "Özel oda talebi gönderilemedi.",
      },
      { status: known?.status ?? 500 },
    );
  }

  const result = Array.isArray(data) ? (data[0] as CreatePrivateRequestResult | undefined) : undefined;
  if (!result) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Özel oda talebi gönderilemedi." }, { status: 500 });
  }

  return noStoreJson({
    ok: true,
    request: {
      id: result.id,
      roomId: result.room_id,
      streamerId: result.streamer_id,
      viewerId: result.viewer_id,
      status: result.status,
      createdAt: result.created_at,
    },
  });
}

export async function GET(request: Request) {
  const authHeader = parseBearer(request);
  if (!authHeader) {
    return noStoreJson({ ok: false, code: "AUTH_REQUIRED", message: "Giriş yapmalısın." }, { status: 401 });
  }

  const { supabase, userId } = await readCurrentUser(authHeader);
  if (!supabase || !userId) {
    return noStoreJson({ ok: false, code: "AUTH_REQUIRED", message: "Giriş yapmalısın." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope");
  const statusFilter = searchParams.get("status");
  if (scope !== "viewer" && scope !== "streamer") {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Geçersiz scope." }, { status: 400 });
  }
  if (statusFilter && !ALLOWED_STATUSES.has(statusFilter)) {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Geçersiz status." }, { status: 400 });
  }

  const column = scope === "viewer" ? "viewer_id" : "streamer_id";
  let query = supabase
    .from("private_room_requests")
    .select("id, room_id, streamer_id, viewer_id, status, viewer_note, streamer_note, created_at, decided_at")
    .eq(column, userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Talepler alınamadı." }, { status: 500 });
  }

  const rows = (data ?? []) as PrivateRequestRow[];
  const profileIds = Array.from(
    new Set(
      rows
        .flatMap((row) => [row.streamer_id, row.viewer_id])
        .filter((id): id is string => Boolean(id)),
    ),
  );

  let profileMap = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", profileIds);
    profileMap = new Map(
      ((profiles ?? []) as ProfileRow[]).map((profile) => [
        profile.id,
        profile.display_name?.trim() || "Kullanıcı",
      ]),
    );
  }

  return noStoreJson({
    ok: true,
    requests: rows.map((row) => ({
      id: row.id,
      roomId: row.room_id,
      streamerId: row.streamer_id,
      streamerName: profileMap.get(row.streamer_id) ?? "Yayıncı",
      viewerId: row.viewer_id,
      viewerName: profileMap.get(row.viewer_id) ?? "Üye",
      status: row.status,
      viewerNote: row.viewer_note,
      streamerNote: row.streamer_note,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
    })),
  });
}
