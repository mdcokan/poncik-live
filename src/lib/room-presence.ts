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
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : null;
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
    const { data, error } = await supabase
      .from("room_presence")
      .select("id, room_id, user_id, role, joined_at, last_seen_at, profiles(display_name)")
      .eq("room_id", roomId)
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
