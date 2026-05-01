import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ApiError = {
  status: number;
  code: string;
  message: string;
};

const SIGNAL_ERROR_BY_CODE: Record<string, ApiError> = {
  AUTH_REQUIRED: { status: 401, code: "AUTH_REQUIRED", message: "Giriş yapmalısın." },
  SESSION_NOT_FOUND: { status: 404, code: "SESSION_NOT_FOUND", message: "Özel oda bulunamadı." },
  SESSION_NOT_ACTIVE: { status: 409, code: "SESSION_NOT_ACTIVE", message: "Özel oda aktif değil." },
  FORBIDDEN: { status: 403, code: "FORBIDDEN", message: "Bu işlem için yetkin yok." },
  INVALID_SIGNAL_TYPE: { status: 400, code: "INVALID_SIGNAL_TYPE", message: "Geçersiz sinyal tipi." },
  INVALID_PAYLOAD: { status: 400, code: "INVALID_PAYLOAD", message: "Geçersiz sinyal verisi." },
  PAYLOAD_TOO_LARGE: { status: 413, code: "PAYLOAD_TOO_LARGE", message: "Sinyal verisi çok büyük." },
};

const VALID_SIGNAL_TYPES = new Set<string>(["offer", "answer", "ice_candidate", "ready_ping", "hangup"]);

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
    if (key && SIGNAL_ERROR_BY_CODE[key]) {
      return key;
    }
  }
  return null;
}

type RpcSignalRow = {
  id: string;
  session_id: string;
  sender_id: string;
  receiver_id: string;
  signal_type: string;
  created_at: string;
};

function rpcRows<T>(data: unknown): T[] {
  if (data == null) {
    return [];
  }
  if (Array.isArray(data)) {
    return data as T[];
  }
  if (typeof data === "object") {
    return [data as T];
  }
  return [];
}

type DbSignalRow = {
  id: string;
  session_id: string;
  sender_id: string;
  receiver_id: string;
  signal_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
};

function mapSignalToClient(row: DbSignalRow) {
  return {
    id: row.id,
    sessionId: row.session_id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    signalType: row.signal_type,
    payload: row.payload,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export async function POST(request: Request, context: { params: Promise<{ sessionId?: string }> }) {
  const authHeader = parseBearer(request);
  if (!authHeader) {
    const authError = SIGNAL_ERROR_BY_CODE.AUTH_REQUIRED;
    return noStoreJson({ ok: false, code: authError.code, message: authError.message }, { status: authError.status });
  }

  const params = await context.params;
  const sessionId = params.sessionId?.trim();
  if (!sessionId) {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Sinyal gönderilemedi." }, { status: 400 });
  }

  let body: { signalType?: unknown; payload?: unknown };
  try {
    body = (await request.json()) as { signalType?: unknown; payload?: unknown };
  } catch {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Sinyal gönderilemedi." }, { status: 400 });
  }

  const signalType = typeof body.signalType === "string" ? body.signalType.trim() : "";
  if (!VALID_SIGNAL_TYPES.has(signalType)) {
    return noStoreJson(
      { ok: false, code: "INVALID_SIGNAL_TYPE", message: SIGNAL_ERROR_BY_CODE.INVALID_SIGNAL_TYPE.message },
      { status: 400 },
    );
  }

  let payload: Record<string, unknown> = {};
  if (body.payload !== undefined) {
    if (body.payload === null || typeof body.payload !== "object" || Array.isArray(body.payload)) {
      return noStoreJson(
        { ok: false, code: "INVALID_PAYLOAD", message: SIGNAL_ERROR_BY_CODE.INVALID_PAYLOAD.message },
        { status: 400 },
      );
    }
    payload = body.payload as Record<string, unknown>;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Sinyal gönderilemedi." }, { status: 500 });
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
    const authError = SIGNAL_ERROR_BY_CODE.AUTH_REQUIRED;
    return noStoreJson({ ok: false, code: authError.code, message: authError.message }, { status: authError.status });
  }

  const { data, error } = await supabase.rpc("send_private_room_signal", {
    p_session_id: sessionId,
    p_signal_type: signalType,
    p_payload: payload,
  });

  if (error) {
    const code = resolveErrorCode(error);
    const known = code ? SIGNAL_ERROR_BY_CODE[code] : null;
    if (!known) {
      console.error("send_private_room_signal rpc error", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    }
    return noStoreJson(
      {
        ok: false,
        code: known?.code ?? "UNKNOWN_ERROR",
        message: known?.message ?? "Sinyal gönderilemedi.",
      },
      { status: known?.status ?? 500 },
    );
  }

  const row = rpcRows<RpcSignalRow>(data)[0];
  if (!row) {
    console.error("send_private_room_signal empty rpc data", { data });
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Sinyal gönderilemedi." }, { status: 500 });
  }

  return noStoreJson({
    ok: true,
    signal: {
      id: row.id,
      sessionId: row.session_id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      signalType: row.signal_type,
      createdAt: row.created_at,
    },
  });
}

export async function GET(request: Request, context: { params: Promise<{ sessionId?: string }> }) {
  const authHeader = parseBearer(request);
  if (!authHeader) {
    const authError = SIGNAL_ERROR_BY_CODE.AUTH_REQUIRED;
    return noStoreJson({ ok: false, code: authError.code, message: authError.message }, { status: authError.status });
  }

  const params = await context.params;
  const sessionId = params.sessionId?.trim();
  if (!sessionId) {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Sinyaller alınamadı." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Sinyaller alınamadı." }, { status: 500 });
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
    const authError = SIGNAL_ERROR_BY_CODE.AUTH_REQUIRED;
    return noStoreJson({ ok: false, code: authError.code, message: authError.message }, { status: authError.status });
  }

  const { data, error } = await supabase
    .from("private_room_signals")
    .select("id, session_id, sender_id, receiver_id, signal_type, payload, created_at, read_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Sinyaller alınamadı." }, { status: 500 });
  }

  const rows = (data ?? []) as DbSignalRow[];
  const signals = rows.map(mapSignalToClient);

  return noStoreJson({ ok: true, signals });
}
