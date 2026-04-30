import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const ADMIN_ROLES = new Set(["admin", "owner"]);
const LIVE_ROOMS_BROADCAST_CHANNEL = "poncik-live-rooms-broadcast";
const LIVE_ROOMS_CHANGED_EVENT = "live_rooms_changed";

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

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, message: "Canlı yayın kapatılamadı." }, { status: 500 });
  }

  const authHeader = parseBearerToken(request);
  if (!authHeader) {
    return noStoreJson({ ok: false, message: "Giriş gerekli." }, { status: 401 });
  }

  let payload: { roomId?: unknown; reason?: unknown } = {};
  try {
    payload = (await request.json()) as { roomId?: unknown; reason?: unknown };
  } catch {
    return noStoreJson({ ok: false, message: "Geçersiz istek." }, { status: 400 });
  }

  const roomId = typeof payload.roomId === "string" ? payload.roomId.trim() : "";
  if (!roomId) {
    return noStoreJson({ ok: false, message: "roomId zorunlu." }, { status: 400 });
  }

  try {
    const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
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
    } = await authSupabase.auth.getUser();
    if (userError || !user) {
      return noStoreJson({ ok: false, message: "Giriş gerekli." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await authSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single<{ role: string }>();
    if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) {
      return noStoreJson({ ok: false, message: "Bu işlem için yetkin yok." }, { status: 403 });
    }

    const { data: closedRooms, error: closeRpcError } = await authSupabase.rpc("admin_close_live_room", {
      p_room_id: roomId,
    });
    if (closeRpcError) {
      if (closeRpcError.message.includes("ROOM_NOT_LIVE")) {
        return noStoreJson({ ok: false, message: "Canlı yayın bulunamadı." }, { status: 404 });
      }
      if (closeRpcError.message.includes("FORBIDDEN")) {
        return noStoreJson({ ok: false, message: "Bu işlem için yetkin yok." }, { status: 403 });
      }
      if (closeRpcError.message.includes("AUTH_REQUIRED")) {
        return noStoreJson({ ok: false, message: "Giriş gerekli." }, { status: 401 });
      }
      return noStoreJson({ ok: false, message: "Canlı yayın kapatılamadı." }, { status: 500 });
    }

    if (!Array.isArray(closedRooms) || closedRooms.length === 0) {
      return noStoreJson({ ok: false, message: "Canlı yayın bulunamadı." }, { status: 404 });
    }

    try {
      await authSupabase.channel(LIVE_ROOMS_BROADCAST_CHANNEL).send({
        type: "broadcast",
        event: LIVE_ROOMS_CHANGED_EVENT,
        payload: {
          action: "stopped",
          roomId,
          status: "offline",
          at: Date.now(),
        },
      });
    } catch {}

    return noStoreJson({ ok: true });
  } catch {
    return noStoreJson({ ok: false, message: "Canlı yayın kapatılamadı." }, { status: 500 });
  }
}
