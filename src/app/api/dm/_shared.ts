import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}

export function parseBearer(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return header;
}

export function createUserSupabase(authHeader: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: authHeader },
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

export async function requireAuthedUser(
  request: Request,
): Promise<{ user: { id: string }; supabase: SupabaseClient } | { error: Response }> {
  const authHeader = parseBearer(request);
  if (!authHeader) {
    return { error: noStoreJson({ ok: false, code: "AUTH_REQUIRED", message: "Giriş yapmalısınız." }, { status: 401 }) };
  }
  const supabase = createUserSupabase(authHeader);
  if (!supabase) {
    return { error: noStoreJson({ ok: false, code: "SERVER_CONFIG", message: "Sunucu ayarları eksik." }, { status: 500 }) };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: noStoreJson({ ok: false, code: "AUTH_REQUIRED", message: "Giriş yapmalısınız." }, { status: 401 }) };
  }
  return { user, supabase };
}

const KNOWN_DM_RPC_CODES = new Set([
  "AUTH_REQUIRED",
  "RECEIVER_NOT_FOUND",
  "CANNOT_MESSAGE_SELF",
  "BANNED",
  "RECEIVER_UNAVAILABLE",
  "EMPTY_MESSAGE",
  "MESSAGE_TOO_LONG",
  "CONVERSATION_NOT_FOUND",
]);

export function resolveRpcErrorCode(error: { message?: string | null; details?: string | null; hint?: string | null }) {
  const blob = [error.message, error.details, error.hint]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join(" ");
  for (const code of KNOWN_DM_RPC_CODES) {
    if (blob.includes(code)) {
      return code;
    }
  }
  const candidates = [error.message, error.details, error.hint];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && /^[A-Z][A-Z0-9_]+$/.test(trimmed)) {
      return trimmed;
    }
  }
  return null;
}
