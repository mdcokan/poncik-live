import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ApiError = {
  status: number;
  code: string;
  message: string;
};

type DecideRequestResult = {
  id: string;
  room_id: string;
  streamer_id: string;
  viewer_id: string;
  status: string;
  decided_at: string | null;
};

const ERROR_BY_CODE: Record<string, ApiError> = {
  AUTH_REQUIRED: { status: 401, code: "AUTH_REQUIRED", message: "Giriş yapmalısın." },
  REQUEST_NOT_FOUND: { status: 404, code: "REQUEST_NOT_FOUND", message: "Talep bulunamadı." },
  REQUEST_NOT_PENDING: { status: 409, code: "REQUEST_NOT_PENDING", message: "Talep artık beklemede değil." },
  FORBIDDEN: { status: 403, code: "FORBIDDEN", message: "Bu işlem için yetkin yok." },
  INVALID_DECISION: { status: 400, code: "INVALID_DECISION", message: "Geçersiz karar." },
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
    if (key && ERROR_BY_CODE[key]) {
      return key;
    }
  }
  return null;
}

export async function POST(request: Request, context: { params: Promise<{ requestId?: string }> }) {
  const authHeader = parseBearer(request);
  if (!authHeader) {
    const authError = ERROR_BY_CODE.AUTH_REQUIRED;
    return noStoreJson({ ok: false, code: authError.code, message: authError.message }, { status: authError.status });
  }

  const params = await context.params;
  const requestId = params.requestId?.trim();
  if (!requestId) {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Talep güncellenemedi." }, { status: 400 });
  }

  let payload: { decision?: unknown; streamerNote?: unknown };
  try {
    payload = (await request.json()) as { decision?: unknown; streamerNote?: unknown };
  } catch {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Talep güncellenemedi." }, { status: 400 });
  }

  const decision = typeof payload.decision === "string" ? payload.decision.trim().toLowerCase() : "";
  const streamerNote = typeof payload.streamerNote === "string" ? payload.streamerNote.trim() : null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Talep güncellenemedi." }, { status: 500 });
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
  } = await supabase.auth.getUser();
  if (!user) {
    const authError = ERROR_BY_CODE.AUTH_REQUIRED;
    return noStoreJson({ ok: false, code: authError.code, message: authError.message }, { status: authError.status });
  }

  const { data, error } = await supabase.rpc("decide_private_room_request", {
    p_request_id: requestId,
    p_decision: decision,
    p_streamer_note: streamerNote,
  });

  if (error) {
    const code = resolveErrorCode(error);
    const known = code ? ERROR_BY_CODE[code] : null;
    return noStoreJson(
      {
        ok: false,
        code: known?.code ?? "UNKNOWN_ERROR",
        message: known?.message ?? "Talep güncellenemedi.",
      },
      { status: known?.status ?? 500 },
    );
  }

  const result = Array.isArray(data) ? (data[0] as DecideRequestResult | undefined) : undefined;
  if (!result) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Talep güncellenemedi." }, { status: 500 });
  }

  return noStoreJson({
    ok: true,
    request: {
      id: result.id,
      roomId: result.room_id,
      streamerId: result.streamer_id,
      viewerId: result.viewer_id,
      status: result.status,
      decidedAt: result.decided_at,
    },
  });
}
