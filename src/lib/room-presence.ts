import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type RoomPresenceRow = {
  id: string;
  room_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  last_seen_at: string;
  profiles?:
    | {
        display_name: string | null;
      }
    | {
        display_name: string | null;
      }[]
    | null;
};

export type RoomPresenceUser = {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  role: string;
  joinedAt: string;
  lastSeenAt: string;
};

export type RoomPresenceMutationResult = {
  ok: boolean;
  errorMessage?: string;
};

const ACTIVE_PRESENCE_WINDOW_MS = 20_000;

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase ortam degiskenleri eksik.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: (input, init) => {
        return fetch(input, {
          ...init,
          cache: "no-store",
        });
      },
    },
  });
}

function mapPresenceRow(row: RoomPresenceRow): RoomPresenceUser {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    displayName: profile?.display_name?.trim() || "Uye",
    role: row.role,
    joinedAt: row.joined_at,
    lastSeenAt: row.last_seen_at,
  };
}

type ApiPresenceUser = {
  userId: string;
  displayName: string | null;
  role: string | null;
  lastSeenAt: string;
};

type ApiPresenceResponse = {
  users?: ApiPresenceUser[];
};

function normalizeSupabaseErrorMessage(message: string | undefined, fallback: string) {
  const trimmed = message?.trim();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed.length > 240) {
    return `${trimmed.slice(0, 237)}...`;
  }
  return trimmed;
}

export async function fetchRoomPresence(
  roomId: string,
  limit = 100,
  supabaseClient?: SupabaseClient,
): Promise<RoomPresenceUser[]> {
  try {
    if (!roomId) {
      return [];
    }

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const supabase = supabaseClient ?? getSupabaseClient();
    const activeSinceIso = new Date(Date.now() - ACTIVE_PRESENCE_WINDOW_MS).toISOString();
    const { data, error } = await supabase
      .from("room_presence")
      .select("id, room_id, user_id, role, joined_at, last_seen_at, profiles(display_name)")
      .eq("room_id", roomId)
      .gte("last_seen_at", activeSinceIso)
      .order("last_seen_at", { ascending: false })
      .limit(safeLimit);

    if (error || !data?.length) {
      return [];
    }

    return (data as RoomPresenceRow[]).map(mapPresenceRow);
  } catch {
    return [];
  }
}

export async function fetchRoomPresenceFromApi(
  roomId: string,
  supabaseClient: SupabaseClient,
  limit = 100,
): Promise<RoomPresenceUser[]> {
  if (!roomId) {
    return [];
  }

  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    return [];
  }

  try {
    const response = await fetch(`/api/rooms/${roomId}/presence?limit=${safeLimit}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as ApiPresenceResponse;
    const users = Array.isArray(payload.users) ? payload.users : [];

    return users.map((user) => ({
      id: user.userId,
      roomId,
      userId: user.userId,
      displayName: user.displayName?.trim() || "Uye",
      role: user.role?.trim() || "viewer",
      joinedAt: user.lastSeenAt,
      lastSeenAt: user.lastSeenAt,
    }));
  } catch {
    return [];
  }
}

export async function upsertRoomPresence(
  params: {
    roomId: string;
    userId: string;
    role: "viewer" | "streamer" | "admin";
  },
  supabaseClient: SupabaseClient,
): Promise<RoomPresenceMutationResult> {
  const { roomId, userId, role } = params;
  if (!roomId || !userId) {
    return { ok: false, errorMessage: "Presence istegi icin oda veya kullanici eksik." };
  }

  const { error } = await supabaseClient.from("room_presence").upsert(
    {
      room_id: roomId,
      user_id: userId,
      role,
      last_seen_at: new Date().toISOString(),
    },
    {
      onConflict: "room_id,user_id",
    },
  );

  if (error) {
    return {
      ok: false,
      errorMessage: normalizeSupabaseErrorMessage(
        error.message,
        "Odadakiler listesine katilim dogrulanamadi.",
      ),
    };
  }

  return { ok: true };
}

export async function removeRoomPresence(
  params: {
    roomId: string;
    userId: string;
  },
  supabaseClient: SupabaseClient,
): Promise<RoomPresenceMutationResult> {
  const { roomId, userId } = params;
  if (!roomId || !userId) {
    return { ok: false, errorMessage: "Presence silme istegi icin oda veya kullanici eksik." };
  }

  const { error } = await supabaseClient
    .from("room_presence")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", userId);

  if (error) {
    return {
      ok: false,
      errorMessage: normalizeSupabaseErrorMessage(
        error.message,
        "Odadakiler kaydi kaldirilamadi.",
      ),
    };
  }

  return { ok: true };
}
