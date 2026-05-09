import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ActiveSessionRow = {
  id: string;
  room_id: string;
  viewer_id: string;
  streamer_id: string;
  status: string;
};

type RoomRow = {
  id: string;
  status: string;
};

type ProfileRow = {
  is_banned: boolean | null;
};

type RoomBanRow = {
  id: string;
};

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

function privateSessionStateResponse(payload?: Partial<{ active: boolean; sessionId: string | null; status: "active" | null; isParticipant: boolean; isViewer: boolean; isStreamer: boolean }>) {
  return {
    ok: true,
    active: payload?.active ?? false,
    sessionId: payload?.sessionId ?? null,
    status: payload?.status ?? null,
    isParticipant: payload?.isParticipant ?? false,
    isViewer: payload?.isViewer ?? false,
    isStreamer: payload?.isStreamer ?? false,
  };
}

export async function GET(request: Request, context: { params: Promise<{ roomId?: string }> }) {
  const params = await context.params;
  const roomId = params.roomId?.trim();
  if (!roomId) {
    return noStoreJson({ ok: false, code: "ROOM_ID_REQUIRED" }, { status: 400 });
  }

  const authHeader = parseBearer(request);
  if (!authHeader) {
    return noStoreJson({ ok: false, code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, code: "SERVICE_CONFIG_MISSING" }, { status: 500 });
  }

  const authed = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: authHeader },
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });

  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user) {
    return noStoreJson({ ok: false, code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const admin = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
        },
      })
    : authed;

  const { data: room, error: roomError } = await admin.from("rooms").select("id, status").eq("id", roomId).maybeSingle<RoomRow>();
  if (roomError) {
    return noStoreJson(privateSessionStateResponse());
  }

  if (!room?.id) {
    return noStoreJson({ ok: false, code: "ROOM_NOT_FOUND" }, { status: 404 });
  }

  const [{ data: me, error: meError }, { data: roomBanRows, error: roomBanError }] = await Promise.all([
    admin.from("profiles").select("is_banned").eq("id", user.id).maybeSingle<ProfileRow>(),
    admin.from("room_bans").select("id").eq("room_id", roomId).eq("user_id", user.id).limit(1),
  ]);
  if (meError || roomBanError) {
    // Fail closed for moderation visibility to avoid leaking private-session state.
    return noStoreJson(privateSessionStateResponse());
  }

  if (me?.is_banned === true || (roomBanRows as RoomBanRow[] | null)?.length) {
    return noStoreJson(privateSessionStateResponse());
  }

  const { data: sessions, error } = await admin
    .from("private_room_sessions")
    .select("id, room_id, viewer_id, streamer_id, status")
    .eq("room_id", roomId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1);

  if (error) {
    return noStoreJson(privateSessionStateResponse());
  }

  const data = ((sessions ?? []) as ActiveSessionRow[])[0] ?? null;
  if (!data) {
    return noStoreJson(privateSessionStateResponse());
  }

  const isViewer = data.viewer_id === user.id;
  const isStreamer = data.streamer_id === user.id;
  return noStoreJson(
    privateSessionStateResponse({
      active: true,
      sessionId: data.id,
      status: "active",
      isParticipant: isViewer || isStreamer,
      isViewer,
      isStreamer,
    }),
  );
}
