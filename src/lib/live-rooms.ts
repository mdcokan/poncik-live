import { createClient } from "@supabase/supabase-js";

type RoomRow = {
  id: string;
  title: string | null;
  status: string;
  owner_id: string;
  updated_at: string | null;
  created_at: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  role: string | null;
};

export type LiveRoom = {
  id: string;
  title: string | null;
  status: string;
  ownerId: string;
  updatedAt: string | null;
  createdAt: string | null;
  streamerName: string;
  streamerRole: string | null;
};

export type LiveRoomsResult = {
  rooms: LiveRoom[];
  hasError: boolean;
};

export type PublicRoomState = {
  id: string;
  title: string | null;
  status: string;
  ownerId: string;
  streamerName: string;
  isLive: boolean;
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

function resolveStreamerName(room: Pick<RoomRow, "title">, profile: Pick<ProfileRow, "display_name"> | undefined) {
  const profileName = profile?.display_name?.trim();
  const roomTitle = room.title?.trim();
  return profileName || roomTitle || "Yayinci";
}

export async function fetchLiveRooms(limit = 24): Promise<LiveRoomsResult> {
  try {
    const supabase = getSupabaseClient();
    const safeLimit = Math.min(Math.max(limit, 1), 24);

    const { data: roomsData, error: roomsError } = await supabase
      .from("rooms")
      .select("id, title, status, owner_id, updated_at, created_at")
      .eq("status", "live")
      .order("updated_at", { ascending: false })
      .limit(safeLimit);

    if (roomsError || !roomsData?.length) {
      return { rooms: [], hasError: Boolean(roomsError) };
    }

    const liveRoomsOnly = roomsData.filter((room) => room.status === "live");
    if (!liveRoomsOnly.length) {
      return { rooms: [], hasError: false };
    }

    const ownerIds = Array.from(new Set(liveRoomsOnly.map((room) => room.owner_id)));
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name, role")
      .in("id", ownerIds);

    const profilesById = new Map<string, ProfileRow>(
      (profilesData ?? []).map((profile) => [profile.id, profile]),
    );

    const rooms: LiveRoom[] = liveRoomsOnly.map((room) => {
      const profile = profilesById.get(room.owner_id);

      return {
        id: room.id,
        title: room.title,
        status: room.status,
        ownerId: room.owner_id,
        updatedAt: room.updated_at,
        createdAt: room.created_at,
        streamerName: resolveStreamerName(room, profile),
        streamerRole: profile?.role ?? null,
      };
    });

    return {
      rooms,
      hasError: Boolean(profilesError),
    };
  } catch {
    return { rooms: [], hasError: true };
  }
}

export async function fetchPublicRoomState(roomId: string): Promise<PublicRoomState | null> {
  if (!roomId) {
    return null;
  }

  const supabase = getSupabaseClient();
  const { data: roomData, error: roomError } = await supabase
    .from("rooms")
    .select("id, title, status, owner_id")
    .eq("id", roomId)
    .maybeSingle();

  if (roomError || !roomData) {
    return null;
  }

  const { data: ownerProfileData } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", roomData.owner_id)
    .maybeSingle();

  return {
    id: roomData.id,
    title: roomData.title,
    status: roomData.status,
    ownerId: roomData.owner_id,
    streamerName: resolveStreamerName(roomData, ownerProfileData ?? undefined),
    isLive: roomData.status === "live",
  };
}

export function formatUpdatedAtShort(value: string | null) {
  if (!value) {
    return "az once aktif";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "az once aktif";
  }

  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) {
    return "simdi aktif";
  }

  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 60) {
    return `${diffMinutes} dk once aktif`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} sa once aktif`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} gun once aktif`;
}
