import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ModerationAction = "mute" | "unmute" | "kick" | "ban" | "unban";

type ModerateRoomUserResult = {
  ok: boolean;
  action: string;
  room_id: string;
  target_user_id: string;
};

type ApiError = {
  status: number;
  code: string;
  message: string;
};

const ACTIONS = new Set<ModerationAction>(["mute", "unmute", "kick", "ban", "unban"]);

const ERROR_BY_CODE: Record<string, ApiError> = {
  AUTH_REQUIRED: { status: 401, code: "AUTH_REQUIRED", message: "Giriş yapmalısın." },
  FORBIDDEN: { status: 403, code: "FORBIDDEN", message: "Bu işlem için yetkin yok." },
  ROOM_NOT_FOUND: { status: 404, code: "ROOM_NOT_FOUND", message: "Oda bulunamadı." },
  ROOM_NOT_LIVE: { status: 409, code: "ROOM_NOT_LIVE", message: "Yayın şu an kapalı." },
  TARGET_NOT_IN_ROOM: { status: 404, code: "TARGET_NOT_IN_ROOM", message: "Kullanıcı odada değil." },
  CANNOT_MODERATE_STREAMER: {
    status: 400,
    code: "CANNOT_MODERATE_STREAMER",
    message: "Yayıncıya bu işlem uygulanamaz.",
  },
  CANNOT_MODERATE_SELF: { status: 400, code: "CANNOT_MODERATE_SELF", message: "Kendine bu işlem uygulanamaz." },
  INVALID_ACTION: { status: 400, code: "INVALID_ACTION", message: "Geçersiz işlem." },
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

export async function POST(request: Request, context: { params: Promise<{ roomId?: string }> }) {
  const isDebug = process.env.NODE_ENV !== "production";
  const params = await context.params;
  const roomId = params.roomId?.trim();
  if (!roomId) {
    return noStoreJson({ ok: false, code: "ROOM_NOT_FOUND", message: ERROR_BY_CODE.ROOM_NOT_FOUND.message }, { status: 404 });
  }

  const authHeader = parseAuthHeader(request);
  if (!authHeader) {
    const error = ERROR_BY_CODE.AUTH_REQUIRED;
    return noStoreJson({ ok: false, code: error.code, message: error.message }, { status: error.status });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Moderasyon işlemi tamamlanamadı." }, { status: 500 });
  }

  let payload: { targetUserId?: unknown; action?: unknown; reason?: unknown } = {};
  try {
    payload = (await request.json()) as { targetUserId?: unknown; action?: unknown; reason?: unknown };
  } catch {
    return noStoreJson({ ok: false, code: "INVALID_ACTION", message: ERROR_BY_CODE.INVALID_ACTION.message }, { status: 400 });
  }

  const targetUserId = typeof payload.targetUserId === "string" ? payload.targetUserId.trim() : "";
  const action = typeof payload.action === "string" ? payload.action.trim().toLowerCase() : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : null;
  if (!targetUserId || !ACTIONS.has(action as ModerationAction)) {
    const error = ERROR_BY_CODE.INVALID_ACTION;
    return noStoreJson({ ok: false, code: error.code, message: error.message }, { status: error.status });
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
    return noStoreJson({ ok: false, code: error.code, message: error.message }, { status: error.status });
  }

  const { data, error } = await supabase.rpc("moderate_room_user", {
    p_room_id: roomId,
    p_target_user_id: targetUserId,
    p_action: action,
    p_reason: reason,
  });

  if (error) {
    const knownCode = resolveErrorCode(error);
    const knownError = knownCode ? ERROR_BY_CODE[knownCode] : null;
    return noStoreJson(
      {
        ok: false,
        code: knownError?.code ?? "UNKNOWN_ERROR",
        message: knownError?.message ?? "Moderasyon işlemi tamamlanamadı.",
        ...(isDebug
          ? {
              debug: {
                message: error.message ?? null,
                details: error.details ?? null,
                hint: error.hint ?? null,
              },
            }
          : {}),
      },
      { status: knownError?.status ?? 500 },
    );
  }

  const result = Array.isArray(data) ? (data[0] as ModerateRoomUserResult | undefined) : undefined;
  if (!result) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Moderasyon işlemi tamamlanamadı." }, { status: 500 });
  }

  return noStoreJson({
    ok: Boolean(result.ok),
    action: result.action,
    roomId: result.room_id,
    targetUserId: result.target_user_id,
  });
}
