import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ApiError = {
  status: number;
  message: string;
};

type DecideResult = {
  id: string;
  streamer_id: string;
  requested_minutes: number;
  status: "approved" | "rejected" | "cancelled";
  decided_at: string;
};

const ADMIN_ROLES = new Set(["admin", "owner"]);

const ERROR_BY_CODE: Record<string, ApiError> = {
  REQUEST_NOT_FOUND: { status: 404, message: "Çekim talebi bulunamadı." },
  REQUEST_NOT_PENDING: { status: 409, message: "Çekim talebi beklemede değil." },
  FORBIDDEN: { status: 403, message: "Bu işlem için yetkin yok." },
  INVALID_DECISION: { status: 400, message: "Geçersiz karar." },
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

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Çekim talebi güncellenemedi." }, { status: 500 });
  }

  const authHeader = parseBearerToken(request);
  if (!authHeader) {
    return noStoreJson({ ok: false, code: "FORBIDDEN", message: ERROR_BY_CODE.FORBIDDEN.message }, { status: 403 });
  }

  const { requestId } = await context.params;
  if (!requestId) {
    return noStoreJson({ ok: false, code: "REQUEST_NOT_FOUND", message: ERROR_BY_CODE.REQUEST_NOT_FOUND.message }, { status: 404 });
  }

  let payload: { decision?: unknown; adminNote?: unknown } = {};
  try {
    payload = (await request.json()) as { decision?: unknown; adminNote?: unknown };
  } catch {
    return noStoreJson({ ok: false, code: "INVALID_DECISION", message: ERROR_BY_CODE.INVALID_DECISION.message }, { status: 400 });
  }

  const decision = payload.decision === "approved" || payload.decision === "rejected" ? payload.decision : null;
  const adminNote = typeof payload.adminNote === "string" ? payload.adminNote.trim() : null;
  if (!decision) {
    return noStoreJson({ ok: false, code: "INVALID_DECISION", message: ERROR_BY_CODE.INVALID_DECISION.message }, { status: 400 });
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
    return noStoreJson({ ok: false, code: "FORBIDDEN", message: ERROR_BY_CODE.FORBIDDEN.message }, { status: 403 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();
  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) {
    return noStoreJson({ ok: false, code: "FORBIDDEN", message: ERROR_BY_CODE.FORBIDDEN.message }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("decide_streamer_withdrawal_request", {
    p_request_id: requestId,
    p_decision: decision,
    p_admin_note: adminNote,
  });

  if (error) {
    const code = resolveErrorCode(error);
    const knownError = code ? ERROR_BY_CODE[code] : null;
    return noStoreJson(
      {
        ok: false,
        code: code ?? "UNKNOWN_ERROR",
        message: knownError?.message ?? "Çekim talebi güncellenemedi.",
      },
      { status: knownError?.status ?? 500 },
    );
  }

  const result = Array.isArray(data) ? (data[0] as DecideResult | undefined) : undefined;
  if (!result) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Çekim talebi güncellenemedi." }, { status: 500 });
  }

  return noStoreJson({
    ok: true,
    request: {
      id: result.id,
      streamerId: result.streamer_id,
      requestedMinutes: result.requested_minutes,
      status: result.status,
      decidedAt: result.decided_at,
    },
  });
}
