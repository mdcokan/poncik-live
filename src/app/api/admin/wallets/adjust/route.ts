import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type AdjustWalletRpcResult = {
  adjustment_id: string;
  user_id: string;
  new_balance: number;
  amount: number;
  reason: string | null;
  created_at: string;
};

type ApiError = {
  status: number;
  message: string;
};

const ERROR_BY_CODE: Record<string, ApiError> = {
  AUTH_REQUIRED: { status: 401, message: "Giris gerekli." },
  FORBIDDEN: { status: 403, message: "Bu islem icin yetkin yok." },
  USER_NOT_FOUND: { status: 404, message: "Kullanici bulunamadi." },
  INVALID_AMOUNT: { status: 400, message: "Gecersiz miktar." },
  AMOUNT_TOO_LARGE: { status: 400, message: "Miktar cok buyuk." },
  INSUFFICIENT_BALANCE: { status: 409, message: "Yetersiz bakiye." },
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
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Islem su an yapilamiyor." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return noStoreJson({ ok: false, code: "AUTH_REQUIRED", message: ERROR_BY_CODE.AUTH_REQUIRED.message }, { status: 401 });
  }

  let payload: { userId?: unknown; amount?: unknown; reason?: unknown };
  try {
    payload = (await request.json()) as { userId?: unknown; amount?: unknown; reason?: unknown };
  } catch {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Gecersiz istek." }, { status: 400 });
  }

  const userId = typeof payload.userId === "string" ? payload.userId : "";
  const amount = typeof payload.amount === "number" && Number.isFinite(payload.amount) ? Math.trunc(payload.amount) : 0;
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : null;

  if (!userId || amount === 0) {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Gecersiz istek." }, { status: 400 });
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

  const { data, error } = await supabase.rpc("admin_adjust_wallet", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
  });

  if (error) {
    const code = resolveErrorCode(error);
    const knownError = code ? ERROR_BY_CODE[code] : null;
    return noStoreJson(
      {
        ok: false,
        code: code ?? "UNKNOWN_ERROR",
        message: knownError?.message ?? "Islem su an yapilamiyor.",
      },
      { status: knownError?.status ?? 500 },
    );
  }

  const result = Array.isArray(data) ? (data[0] as AdjustWalletRpcResult | undefined) : undefined;
  if (!result) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Islem su an yapilamiyor." }, { status: 500 });
  }

  return noStoreJson({
    ok: true,
    adjustment: result,
  });
}
