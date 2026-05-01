import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ApiError = {
  status: number;
  code: string;
  message: string;
};

type StartSessionResult = {
  session_id: string;
  request_id: string;
  room_id: string;
  streamer_id: string;
  viewer_id: string;
  status: string;
  started_at: string;
};

const START_ERROR_BY_CODE: Record<string, ApiError> = {
  AUTH_REQUIRED: { status: 401, code: "AUTH_REQUIRED", message: "Giriş yapmalısın." },
  REQUEST_NOT_FOUND: { status: 404, code: "REQUEST_NOT_FOUND", message: "Talep bulunamadı." },
  REQUEST_NOT_ACCEPTED: { status: 409, code: "REQUEST_NOT_ACCEPTED", message: "Talep kabul edilmemiş." },
  ROOM_NOT_LIVE: { status: 409, code: "ROOM_NOT_LIVE", message: "Yayın şu an kapalı." },
  INSUFFICIENT_MINUTES: { status: 402, code: "INSUFFICIENT_MINUTES", message: "Süreniz yeterli değil." },
  VIEWER_ALREADY_IN_PRIVATE_ROOM: {
    status: 409,
    code: "VIEWER_ALREADY_IN_PRIVATE_ROOM",
    message: "Zaten aktif bir özel odanız var.",
  },
  STREAMER_ALREADY_IN_PRIVATE_ROOM: {
    status: 409,
    code: "STREAMER_ALREADY_IN_PRIVATE_ROOM",
    message: "Yayıncının aktif bir özel odası var.",
  },
  SESSION_EXISTS: { status: 409, code: "SESSION_EXISTS", message: "Bu talep için daha önce session oluşturulmuş." },
  FORBIDDEN: { status: 403, code: "FORBIDDEN", message: "Bu işlem için yetkin yok." },
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

function parseBearer(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return header;
}

function resolveErrorCode(error: { message?: string | null; details?: string | null; hint?: string | null }) {
  const candidates = [error.message, error.details, error.hint];
  for (const candidate of candidates) {
    const key = candidate?.trim();
    if (key && START_ERROR_BY_CODE[key]) {
      return key;
    }
  }
  return null;
}

export async function POST(request: Request) {
  const authHeader = parseBearer(request);
  if (!authHeader) {
    const authError = START_ERROR_BY_CODE.AUTH_REQUIRED;
    return noStoreJson({ ok: false, code: authError.code, message: authError.message }, { status: authError.status });
  }

  let payload: { requestId?: unknown };
  try {
    payload = (await request.json()) as { requestId?: unknown };
  } catch {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Özel oda başlatılamadı." }, { status: 400 });
  }

  const requestId = typeof payload.requestId === "string" ? payload.requestId.trim() : "";
  if (!requestId) {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Özel oda başlatılamadı." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Özel oda başlatılamadı." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: authHeader },
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const authError = START_ERROR_BY_CODE.AUTH_REQUIRED;
    return noStoreJson({ ok: false, code: authError.code, message: authError.message }, { status: authError.status });
  }

  const { data, error } = await supabase.rpc("start_private_room_session", { p_request_id: requestId });
  if (error) {
    const code = resolveErrorCode(error);
    const known = code ? START_ERROR_BY_CODE[code] : null;
    if (!known) {
      console.error("start_private_room_session rpc error", {
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
    }
    return noStoreJson(
      {
        ok: false,
        code: known?.code ?? "UNKNOWN_ERROR",
        message: known?.message ?? "Özel oda başlatılamadı.",
      },
      { status: known?.status ?? 500 },
    );
  }

  const result = Array.isArray(data) ? (data[0] as StartSessionResult | undefined) : undefined;
  if (!result) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Özel oda başlatılamadı." }, { status: 500 });
  }

  return noStoreJson({
    ok: true,
    session: {
      sessionId: result.session_id,
      requestId: result.request_id,
      roomId: result.room_id,
      streamerId: result.streamer_id,
      viewerId: result.viewer_id,
      status: result.status,
      startedAt: result.started_at,
    },
  });
}
