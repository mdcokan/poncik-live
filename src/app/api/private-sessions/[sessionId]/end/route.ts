import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ApiError = {
  status: number;
  code: string;
  message: string;
};

type EndSessionResult = {
  session_id: string;
  status: string;
  duration_seconds: number;
  charged_minutes: number;
  viewer_spent_minutes: number;
  streamer_earned_minutes: number;
  platform_fee_minutes: number;
};

const END_ERROR_BY_CODE: Record<string, ApiError> = {
  AUTH_REQUIRED: { status: 401, code: "AUTH_REQUIRED", message: "Giriş yapmalısın." },
  SESSION_NOT_FOUND: { status: 404, code: "SESSION_NOT_FOUND", message: "Session bulunamadı." },
  SESSION_NOT_ACTIVE: { status: 409, code: "SESSION_NOT_ACTIVE", message: "Session artık aktif değil." },
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
    if (key && END_ERROR_BY_CODE[key]) {
      return key;
    }
  }
  return null;
}

export async function POST(request: Request, context: { params: Promise<{ sessionId?: string }> }) {
  const authHeader = parseBearer(request);
  if (!authHeader) {
    const authError = END_ERROR_BY_CODE.AUTH_REQUIRED;
    return noStoreJson({ ok: false, code: authError.code, message: authError.message }, { status: authError.status });
  }

  const params = await context.params;
  const sessionId = params.sessionId?.trim();
  if (!sessionId) {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Özel oda kapatılamadı." }, { status: 400 });
  }

  let payload: { reason?: unknown };
  try {
    payload = (await request.json()) as { reason?: unknown };
  } catch {
    payload = {};
  }
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Özel oda kapatılamadı." }, { status: 500 });
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
    const authError = END_ERROR_BY_CODE.AUTH_REQUIRED;
    return noStoreJson({ ok: false, code: authError.code, message: authError.message }, { status: authError.status });
  }

  const { data, error } = await supabase.rpc("end_private_room_session", {
    p_session_id: sessionId,
    p_end_reason: reason,
  });

  if (error) {
    const code = resolveErrorCode(error);
    const known = code ? END_ERROR_BY_CODE[code] : null;
    return noStoreJson(
      {
        ok: false,
        code: known?.code ?? "UNKNOWN_ERROR",
        message: known?.message ?? "Özel oda kapatılamadı.",
      },
      { status: known?.status ?? 500 },
    );
  }

  const result = Array.isArray(data) ? (data[0] as EndSessionResult | undefined) : undefined;
  if (!result) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Özel oda kapatılamadı." }, { status: 500 });
  }

  return noStoreJson({
    ok: true,
    session: {
      sessionId: result.session_id,
      status: result.status,
      durationSeconds: result.duration_seconds,
      chargedMinutes: result.charged_minutes,
      viewerSpentMinutes: result.viewer_spent_minutes,
      streamerEarnedMinutes: result.streamer_earned_minutes,
      platformFeeMinutes: result.platform_fee_minutes,
    },
  });
}
