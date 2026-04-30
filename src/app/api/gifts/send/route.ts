import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type SendGiftRpcResult = {
  transaction_id: string;
  room_id: string;
  gift_id: string;
  gift_name: string;
  gift_emoji: string;
  amount: number;
  sender_balance: number;
  receiver_id: string;
};

type ApiError = {
  status: number;
  message: string;
};

const ERROR_BY_CODE: Record<string, ApiError> = {
  AUTH_REQUIRED: { status: 401, message: "Hediye göndermek için giriş yapmalısın." },
  ROOM_NOT_FOUND: { status: 404, message: "Oda bulunamadı." },
  ROOM_NOT_LIVE: { status: 409, message: "Yayın şu an kapalı." },
  GIFT_NOT_FOUND: { status: 404, message: "Hediye bulunamadı." },
  INSUFFICIENT_BALANCE: { status: 402, message: "Yetersiz dakika bakiyesi." },
  CANNOT_GIFT_SELF: { status: 400, message: "Kendi yayınına hediye gönderemezsin." },
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
    return noStoreJson(
      {
        ok: false,
        code: "UNKNOWN_ERROR",
        message: "Hediye gönderilemedi. Lütfen tekrar dene.",
      },
      { status: 500 },
    );
  }

  let payload: { roomId?: unknown; giftId?: unknown };
  try {
    payload = (await request.json()) as { roomId?: unknown; giftId?: unknown };
  } catch {
    return noStoreJson(
      { ok: false, code: "BAD_REQUEST", message: "Hediye gönderilemedi. Lütfen tekrar dene." },
      { status: 400 },
    );
  }

  const roomId = typeof payload.roomId === "string" ? payload.roomId : "";
  const giftId = typeof payload.giftId === "string" ? payload.giftId : "";
  if (!roomId || !giftId) {
    return noStoreJson(
      { ok: false, code: "BAD_REQUEST", message: "Hediye gönderilemedi. Lütfen tekrar dene." },
      { status: 400 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    const errorConfig = ERROR_BY_CODE.AUTH_REQUIRED;
    return noStoreJson({ ok: false, code: "AUTH_REQUIRED", message: errorConfig.message }, { status: errorConfig.status });
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

  const { data, error } = await supabase.rpc("send_room_gift", {
    p_room_id: roomId,
    p_gift_id: giftId,
  });

  if (error) {
    const knownCode = resolveErrorCode(error);
    const knownError = knownCode ? ERROR_BY_CODE[knownCode] : null;
    return noStoreJson(
      {
        ok: false,
        code: knownCode ?? "UNKNOWN_ERROR",
        message: knownError?.message ?? "Hediye gönderilemedi. Lütfen tekrar dene.",
      },
      { status: knownError?.status ?? 500 },
    );
  }

  const result = Array.isArray(data) ? (data[0] as SendGiftRpcResult | undefined) : undefined;
  if (!result) {
    return noStoreJson(
      {
        ok: false,
        code: "UNKNOWN_ERROR",
        message: "Hediye gönderilemedi. Lütfen tekrar dene.",
      },
      { status: 500 },
    );
  }

  return noStoreJson({
    ok: true,
    gift: result,
  });
}
