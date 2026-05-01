import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ApiError = {
  status: number;
  code: string;
  message: string;
};

type ReadyStateResult = {
  session_id: string;
  viewer_ready: boolean;
  streamer_ready: boolean;
  viewer_ready_at: string | null;
  streamer_ready_at: string | null;
};

const READY_ERROR_BY_CODE: Record<string, ApiError> = {
  AUTH_REQUIRED: { status: 401, code: "AUTH_REQUIRED", message: "Giriş yapmalısın." },
  SESSION_NOT_FOUND: { status: 404, code: "SESSION_NOT_FOUND", message: "Özel oda bulunamadı." },
  SESSION_NOT_ACTIVE: { status: 409, code: "SESSION_NOT_ACTIVE", message: "Özel oda aktif değil." },
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
    if (key && READY_ERROR_BY_CODE[key]) {
      return key;
    }
  }
  return null;
}

export async function POST(request: Request, context: { params: Promise<{ sessionId?: string }> }) {
  const authHeader = parseBearer(request);
  if (!authHeader) {
    const authError = READY_ERROR_BY_CODE.AUTH_REQUIRED;
    return noStoreJson({ ok: false, code: authError.code, message: authError.message }, { status: authError.status });
  }

  const params = await context.params;
  const sessionId = params.sessionId?.trim();
  if (!sessionId) {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Hazır durumu güncellenemedi." }, { status: 400 });
  }

  let payload: { ready?: unknown };
  try {
    payload = (await request.json()) as { ready?: unknown };
  } catch {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Hazır durumu güncellenemedi." }, { status: 400 });
  }

  if (typeof payload.ready !== "boolean") {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Hazır durumu güncellenemedi." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Hazır durumu güncellenemedi." }, { status: 500 });
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
    const authError = READY_ERROR_BY_CODE.AUTH_REQUIRED;
    return noStoreJson({ ok: false, code: authError.code, message: authError.message }, { status: authError.status });
  }

  const { data, error } = await supabase.rpc("set_private_room_ready", {
    p_session_id: sessionId,
    p_ready: payload.ready,
  });

  if (error) {
    const code = resolveErrorCode(error);
    const known = code ? READY_ERROR_BY_CODE[code] : null;
    return noStoreJson(
      {
        ok: false,
        code: known?.code ?? "UNKNOWN_ERROR",
        message: known?.message ?? "Hazır durumu güncellenemedi.",
      },
      { status: known?.status ?? 500 },
    );
  }

  const result = Array.isArray(data) ? (data[0] as ReadyStateResult | undefined) : undefined;
  if (!result) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Hazır durumu güncellenemedi." }, { status: 500 });
  }

  return noStoreJson({
    ok: true,
    readyState: {
      sessionId: result.session_id,
      viewerReady: result.viewer_ready,
      streamerReady: result.streamer_ready,
      viewerReadyAt: result.viewer_ready_at,
      streamerReadyAt: result.streamer_ready_at,
    },
  });
}
