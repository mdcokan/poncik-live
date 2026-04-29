import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type RoomMessageRow = {
  id: string;
  room_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

export type RoomMessage = {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
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

function mapRoomMessage(row: RoomMessageRow, senderNameById: Map<string, string>) {
  return {
    id: row.id,
    roomId: row.room_id,
    senderId: row.sender_id,
    senderName: senderNameById.get(row.sender_id) ?? "Uye",
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function fetchRoomMessages(
  roomId: string,
  limit = 50,
  supabaseClient?: SupabaseClient,
): Promise<RoomMessage[]> {
  try {
    if (!roomId) {
      return [];
    }

    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const supabase = supabaseClient ?? getSupabaseClient();
    const { data: messageRows, error: messagesError } = await supabase
      .from("room_messages")
      .select("id, room_id, sender_id, body, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (messagesError || !messageRows?.length) {
      return [];
    }

    const orderedRows = [...messageRows].reverse();
    const senderIds = Array.from(new Set(orderedRows.map((message) => message.sender_id)));
    const { data: profilesRows } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", senderIds);

    const senderNameById = new Map<string, string>(
      (profilesRows ?? []).map((profile: ProfileRow) => [profile.id, profile.display_name?.trim() || "Uye"]),
    );

    return orderedRows.map((row: RoomMessageRow) => mapRoomMessage(row, senderNameById));
  } catch {
    return [];
  }
}
