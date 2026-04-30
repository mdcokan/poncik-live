import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type PresenceRpcRow = {
  user_id: string;
  display_name: string | null;
  role: string | null;
  last_seen_at: string;
};

type ApiError = {
  status: number;
  code: string;
  message: string;
};

const ERROR_BY_CODE: Record<string, ApiError> = {
  AUTH_REQUIRED: { status: 401, code: "AUTH_REQUIRED", message: "Giris yapmalisin." },
  ROOM_ID_REQUIRED: { status: 400, code: "ROOM_ID_REQUIRED", message: "Oda kimligi gerekli." },
  ROOM_NOT_FOUND: { status: 404, code: "ROOM_NOT_FOUND", message: "Oda bulunamadi." },
  ROOM_NOT_LIVE: { status: 409, code: "ROOM_NOT_LIVE", message: "Yayin su an kapali." },
  FORBIDDEN: { status: 403, code: "FORBIDDEN", message: "Bu islem icin yetkin yok." },
};

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

function parseAuthHeader(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader;
}

function resolveErrorCode(error: { message?: string | null; details?: string | null; hint?: string | null }) {
  const candidates = [error.message, error.details, error.hint];
  for (const candidate of candidates) {
    const key = candidate?.trim();
    if (key && ERROR_BY_CODE[key]) {
      return key;
    }
  }
  return null;
}

export async function GET(request: Request, context: { params: Promise<{ roomId?: string }> }) {
  const params = await context.params;
  const roomId = params.roomId?.trim();
  if (!roomId) {
    const error = ERROR_BY_CODE.ROOM_ID_REQUIRED;
    return noStoreJson({ error: error.code, message: error.message }, { status: error.status });
  }

  const authHeader = parseAuthHeader(request);
  if (!authHeader) {
    const error = ERROR_BY_CODE.AUTH_REQUIRED;
    return noStoreJson({ error: error.code, message: error.message }, { status: error.status });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ error: "SERVER_CONFIG_MISSING", message: "Sunucu konfigurasyonu eksik." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    const error = ERROR_BY_CODE.AUTH_REQUIRED;
    return noStoreJson({ error: error.code, message: error.message }, { status: error.status });
  }

  const { data: room } = await supabase.from("rooms").select("id, status").eq("id", roomId).maybeSingle();
  if (!room) {
    const error = ERROR_BY_CODE.ROOM_NOT_FOUND;
    return noStoreJson({ error: error.code, message: error.message }, { status: error.status });
  }
  if (room.status !== "live") {
    const error = ERROR_BY_CODE.ROOM_NOT_LIVE;
    return noStoreJson({ error: error.code, message: error.message, users: [] }, { status: error.status });
  }

  const { data: selfProfile } = await supabase
    .from("profiles")
    .select("is_banned")
    .eq("id", user.id)
    .maybeSingle<{ is_banned: boolean }>();
  if (selfProfile?.is_banned === true) {
    const error = ERROR_BY_CODE.FORBIDDEN;
    return noStoreJson({ error: error.code, message: error.message }, { status: error.status });
  }

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? "100");
  const safeLimit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 100;

  const { data, error } = await supabase.rpc("get_room_presence", {
    p_room_id: roomId,
    p_limit: safeLimit,
  });

  if (error) {
    const knownCode = resolveErrorCode(error);
    const knownError = knownCode ? ERROR_BY_CODE[knownCode] : null;
    return noStoreJson(
      {
        error: knownError?.code ?? "UNKNOWN_ERROR",
        message: knownError?.message ?? "Odadakiler listesi alinamadi.",
      },
      { status: knownError?.status ?? 500 },
    );
  }

  const users = ((data ?? []) as PresenceRpcRow[]).map((row) => ({
    userId: row.user_id,
    displayName: row.display_name?.trim() || "Uye",
    role: row.role ?? "viewer",
    lastSeenAt: row.last_seen_at,
  }));

  return noStoreJson({ users });
}
