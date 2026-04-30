import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ApiError = {
  status: number;
  message: string;
};

type AllowedRole = "viewer" | "streamer" | "admin";

type ManageProfileResult = {
  user_id: string;
  role: AllowedRole | "owner";
  is_banned: boolean;
};

const ADMIN_ROLES = new Set(["admin", "owner"]);
const ERROR_BY_CODE: Record<string, ApiError> = {
  AUTH_REQUIRED: { status: 401, message: "Giriş gerekli." },
  FORBIDDEN: { status: 403, message: "Bu işlem için yetkin yok." },
  USER_NOT_FOUND: { status: 404, message: "Kullanıcı bulunamadı." },
  INVALID_ACTION: { status: 400, message: "Geçersiz işlem." },
  INVALID_ROLE: { status: 400, message: "Geçersiz rol." },
  TARGET_OWNER_PROTECTED: { status: 403, message: "Owner kullanıcı üzerinde işlem yapılamaz." },
  CANNOT_BAN_SELF: { status: 400, message: "Kendi hesabını banlayamazsın." },
  CANNOT_CHANGE_SELF_ROLE: { status: 400, message: "Kendi rolünü değiştiremezsin." },
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
    return noStoreJson({ ok: false, message: "İşlem yapılamadı." }, { status: 500 });
  }

  const authHeader = parseBearerToken(request);
  if (!authHeader) {
    return noStoreJson({ ok: false, code: "AUTH_REQUIRED", message: ERROR_BY_CODE.AUTH_REQUIRED.message }, { status: 401 });
  }

  let payload: { userId?: unknown; action?: unknown; role?: unknown } = {};
  try {
    payload = (await request.json()) as { userId?: unknown; action?: unknown; role?: unknown };
  } catch {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Geçersiz istek." }, { status: 400 });
  }

  const userId = typeof payload.userId === "string" ? payload.userId : "";
  const action = payload.action === "ban" || payload.action === "unban" || payload.action === "set_role" ? payload.action : null;
  const role = payload.role === "viewer" || payload.role === "streamer" || payload.role === "admin" ? payload.role : null;

  if (!userId || !action) {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Geçersiz istek." }, { status: 400 });
  }

  if (action === "set_role" && !role) {
    return noStoreJson({ ok: false, code: "INVALID_ROLE", message: ERROR_BY_CODE.INVALID_ROLE.message }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: { Authorization: authHeader },
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return noStoreJson({ ok: false, code: "AUTH_REQUIRED", message: ERROR_BY_CODE.AUTH_REQUIRED.message }, { status: 401 });
  }

  const { data: actorProfile, error: actorProfileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();
  if (actorProfileError || !actorProfile || !ADMIN_ROLES.has(actorProfile.role)) {
    return noStoreJson({ ok: false, code: "FORBIDDEN", message: ERROR_BY_CODE.FORBIDDEN.message }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("admin_manage_profile", {
    p_user_id: userId,
    p_action: action,
    p_role: role,
  });

  if (error) {
    const code = resolveErrorCode(error);
    const knownError = code ? ERROR_BY_CODE[code] : null;
    return noStoreJson(
      { ok: false, code: code ?? "UNKNOWN_ERROR", message: knownError?.message ?? "İşlem yapılamadı." },
      { status: knownError?.status ?? 500 },
    );
  }

  const result = Array.isArray(data) ? (data[0] as ManageProfileResult | undefined) : undefined;
  if (!result) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "İşlem yapılamadı." }, { status: 500 });
  }

  return noStoreJson({
    ok: true,
    user: {
      id: result.user_id,
      role: result.role,
      isBanned: result.is_banned,
    },
  });
}
