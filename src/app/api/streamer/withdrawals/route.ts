import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ApiError = {
  status: number;
  message: string;
};

type WithdrawalCreateResult = {
  id: string;
  streamer_id: string;
  requested_minutes: number;
  status: string;
  created_at: string;
};

const ERROR_BY_CODE: Record<string, ApiError> = {
  AUTH_REQUIRED: { status: 401, message: "Giriş yapmalısın." },
  BANNED: { status: 403, message: "Hesabınız kısıtlanmıştır." },
  FORBIDDEN: { status: 403, message: "Bu işlem için yetkin yok." },
  INVALID_AMOUNT: { status: 400, message: "Geçersiz dakika miktarı." },
  INSUFFICIENT_EARNINGS: { status: 409, message: "Çekilebilir kazancınız yetersiz." },
  PENDING_WITHDRAWAL_EXISTS: { status: 409, message: "Bekleyen bir çekim talebiniz var." },
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

function parseBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader;
}

function resolveErrorCode(error: { message?: string | null; details?: string | null; hint?: string | null }) {
  const candidates = [error.message, error.details, error.hint];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && ERROR_BY_CODE[trimmed]) {
      return trimmed;
    }
  }
  return null;
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Çekim talebi oluşturulamadı." }, { status: 500 });
  }

  const authHeader = parseBearerToken(request);
  if (!authHeader) {
    return noStoreJson({ ok: false, code: "AUTH_REQUIRED", message: ERROR_BY_CODE.AUTH_REQUIRED.message }, { status: 401 });
  }

  let payload: { requestedMinutes?: unknown; paymentNote?: unknown } = {};
  try {
    payload = (await request.json()) as { requestedMinutes?: unknown; paymentNote?: unknown };
  } catch {
    return noStoreJson({ ok: false, code: "INVALID_AMOUNT", message: ERROR_BY_CODE.INVALID_AMOUNT.message }, { status: 400 });
  }

  const requestedMinutes = Number.parseInt(`${payload.requestedMinutes ?? ""}`, 10);
  const paymentNote = typeof payload.paymentNote === "string" ? payload.paymentNote.trim() : null;
  if (!Number.isFinite(requestedMinutes)) {
    return noStoreJson({ ok: false, code: "INVALID_AMOUNT", message: ERROR_BY_CODE.INVALID_AMOUNT.message }, { status: 400 });
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
    return noStoreJson({ ok: false, code: "AUTH_REQUIRED", message: ERROR_BY_CODE.AUTH_REQUIRED.message }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("create_streamer_withdrawal_request", {
    p_requested_minutes: requestedMinutes,
    p_payment_note: paymentNote,
  });

  if (error) {
    const code = resolveErrorCode(error);
    const knownError = code ? ERROR_BY_CODE[code] : null;
    return noStoreJson(
      {
        ok: false,
        code: code ?? "UNKNOWN_ERROR",
        message: knownError?.message ?? "Çekim talebi oluşturulamadı.",
      },
      { status: knownError?.status ?? 500 },
    );
  }

  const result = Array.isArray(data) ? (data[0] as WithdrawalCreateResult | undefined) : undefined;
  if (!result) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Çekim talebi oluşturulamadı." }, { status: 500 });
  }

  return noStoreJson({
    ok: true,
    request: {
      id: result.id,
      streamerId: result.streamer_id,
      requestedMinutes: result.requested_minutes,
      status: result.status,
      createdAt: result.created_at,
    },
  });
}
