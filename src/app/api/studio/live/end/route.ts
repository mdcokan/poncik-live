import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const LIVE_ROOMS_BROADCAST_CHANNEL = "poncik-live-rooms-broadcast";
const LIVE_ROOMS_CHANGED_EVENT = "live_rooms_changed";
const STREAMER_ROLES = new Set(["streamer", "admin", "owner"]);

type RoomRow = {
  id: string;
  status: string;
};

type SessionRow = {
  id: string;
  room_id: string | null;
};

function isInvalidRoomStatusEnumError(message?: string) {
  return (message ?? "").includes("invalid input value for enum room_status");
}

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

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, code: "SERVICE_CONFIG_MISSING", message: "Yayın kapatılamadı." }, { status: 500 });
  }

  const authHeader = parseBearerToken(request);
  if (!authHeader) {
    return noStoreJson({ ok: false, code: "AUTH_REQUIRED", message: "Giriş gerekli." }, { status: 401 });
  }

  let payload: { roomId?: unknown; reason?: unknown } = {};
  try {
    payload = (await request.json()) as { roomId?: unknown; reason?: unknown };
  } catch {
    payload = {};
  }
  const preferredRoomId = typeof payload.roomId === "string" ? payload.roomId.trim() : "";

  const authedSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: authHeader },
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  const adminSupabase = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
      })
    : authedSupabase;

  const {
    data: { user },
  } = await authedSupabase.auth.getUser();
  if (!user) {
    return noStoreJson({ ok: false, code: "AUTH_REQUIRED", message: "Giriş gerekli." }, { status: 401 });
  }

  const { data: profile } = await authedSupabase.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role: string }>();
  if (!profile?.role || !STREAMER_ROLES.has(profile.role)) {
    return noStoreJson({ ok: false, code: "FORBIDDEN", message: "Bu işlem için yetkin yok." }, { status: 403 });
  }

  const { data: liveOwnedRooms, error: liveOwnedRoomsError } = await adminSupabase
    .from("rooms")
    .select("id, status")
    .eq("owner_id", user.id)
    .eq("status", "live")
    .order("updated_at", { ascending: false })
    .returns<RoomRow[]>();

  if (liveOwnedRoomsError) {
    console.error("[studio/live/end] failed to list owned live rooms", {
      userId: user.id,
      message: liveOwnedRoomsError.message,
    });
  }
  let busyOwnedRooms: RoomRow[] = [];
  const { data: privateBusyRows, error: privateBusyError } = await adminSupabase
    .from("rooms")
    .select("id, status")
    .eq("owner_id", user.id)
    .eq("status", "private_busy")
    .order("updated_at", { ascending: false })
    .returns<RoomRow[]>();
  if (privateBusyError && isInvalidRoomStatusEnumError(privateBusyError.message)) {
    const { data: legacyPrivateRows, error: legacyPrivateError } = await adminSupabase
      .from("rooms")
      .select("id, status")
      .eq("owner_id", user.id)
      .eq("status", "private")
      .order("updated_at", { ascending: false })
      .returns<RoomRow[]>();
    if (legacyPrivateError) {
      console.error("[studio/live/end] failed to list legacy private rooms", {
        userId: user.id,
        message: legacyPrivateError.message,
      });
    } else {
      busyOwnedRooms = legacyPrivateRows ?? [];
    }
  } else if (privateBusyError) {
    console.error("[studio/live/end] failed to list private_busy rooms", {
      userId: user.id,
      message: privateBusyError.message,
    });
  } else {
    busyOwnedRooms = privateBusyRows ?? [];
  }
  const ownedRooms = [...(liveOwnedRooms ?? []), ...busyOwnedRooms];

  const roomIds = new Set<string>();
  if (preferredRoomId) {
    roomIds.add(preferredRoomId);
  }
  for (const room of ownedRooms ?? []) {
    if (room?.id) {
      roomIds.add(room.id);
    }
  }
  const closedRoomIds: string[] = [];
  for (const roomId of roomIds) {
    const closeWithStatus = async (statusValue: string) =>
      adminSupabase
        .from("rooms")
        .update({
          status: "offline",
          updated_at: new Date().toISOString(),
        })
        .eq("id", roomId)
        .eq("owner_id", user.id)
        .eq("status", statusValue)
        .select("id");
    let updatedRows: { id: string }[] | null = null;
    let updateError: { message?: string } | null = null;

    const liveUpdate = await closeWithStatus("live");
    updatedRows = liveUpdate.data;
    updateError = liveUpdate.error;
    if ((updatedRows?.length ?? 0) === 0) {
      const privateBusyUpdate = await closeWithStatus("private_busy");
      updatedRows = privateBusyUpdate.data;
      updateError = privateBusyUpdate.error;
      if (updateError && isInvalidRoomStatusEnumError(updateError.message)) {
        const legacyPrivateUpdate = await closeWithStatus("private");
        updatedRows = legacyPrivateUpdate.data;
        updateError = legacyPrivateUpdate.error;
      }
    }
    if (updateError) {
      console.error("[studio/live/end] failed to close room", {
        roomId,
        userId: user.id,
        message: updateError.message,
      });
      continue;
    }
    if (Array.isArray(updatedRows) && updatedRows.length > 0) {
      closedRoomIds.push(roomId);
    }
  }

  const { data: activeSessions, error: activeSessionsError } = await adminSupabase
    .from("private_room_sessions")
    .select("id, room_id")
    .eq("streamer_id", user.id)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .returns<SessionRow[]>();

  if (activeSessionsError) {
    console.error("[studio/live/end] failed to list active private sessions", {
      userId: user.id,
      message: activeSessionsError.message,
    });
  }

  const endedSessionIds: string[] = [];
  for (const session of activeSessions ?? []) {
    const { error: endSessionError } = await adminSupabase.rpc("end_private_room_session", {
      p_session_id: session.id,
      p_end_reason: "streamer_live_ended",
    });
    if (!endSessionError) {
      endedSessionIds.push(session.id);
      continue;
    }
    const message = endSessionError.message ?? "";
    if (message.includes("SESSION_NOT_FOUND") || message.includes("SESSION_NOT_ACTIVE")) {
      continue;
    }
    console.error("[studio/live/end] rpc end_private_room_session failed, trying fallback", {
      userId: user.id,
      sessionId: session.id,
      message,
    });
    const fallbackEndedAt = new Date().toISOString();
    const { data: fallbackRows, error: fallbackError } = await adminSupabase
      .from("private_room_sessions")
      .update({
        status: "ended",
        ended_at: fallbackEndedAt,
        updated_at: fallbackEndedAt,
      })
      .eq("id", session.id)
      .eq("streamer_id", user.id)
      .eq("status", "active")
      .select("id");
    if (fallbackError) {
      console.error("[studio/live/end] fallback session end failed", {
        userId: user.id,
        sessionId: session.id,
        message: fallbackError.message,
      });
      continue;
    }
    if (Array.isArray(fallbackRows) && fallbackRows.length > 0) {
      endedSessionIds.push(session.id);
    }
  }

  const presenceRoomIds = new Set<string>();
  for (const roomId of roomIds) {
    presenceRoomIds.add(roomId);
  }
  for (const session of activeSessions ?? []) {
    if (session.room_id) {
      presenceRoomIds.add(session.room_id);
    }
  }

  let presenceDeleted = 0;
  for (const roomId of presenceRoomIds) {
    const { data: deletedRows, error: deleteError } = await adminSupabase
      .from("room_presence")
      .delete()
      .eq("room_id", roomId)
      .select("room_id");
    if (deleteError) {
      console.error("[studio/live/end] failed to delete room presence by room", {
        userId: user.id,
        roomId,
        message: deleteError.message,
      });
      continue;
    }
    presenceDeleted += deletedRows?.length ?? 0;
  }
  const { data: deletedByUser, error: deleteByUserError } = await adminSupabase
    .from("room_presence")
    .delete()
    .eq("user_id", user.id)
    .select("room_id");
  if (deleteByUserError) {
    console.error("[studio/live/end] failed to delete room presence by user", {
      userId: user.id,
      message: deleteByUserError.message,
    });
  } else {
    presenceDeleted += deletedByUser?.length ?? 0;
  }

  try {
    await authedSupabase.channel(LIVE_ROOMS_BROADCAST_CHANNEL).send({
      type: "broadcast",
      event: LIVE_ROOMS_CHANGED_EVENT,
      payload: {
        action: "stopped",
        roomId: preferredRoomId || closedRoomIds[0] || null,
        status: "offline",
        at: Date.now(),
      },
    });
  } catch {}

  return noStoreJson({
    ok: true,
    closedRoomIds,
    endedSessionIds,
    presenceDeleted,
  });
}
