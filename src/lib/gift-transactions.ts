import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type GiftTransactionRow = {
  id: string;
  room_id: string;
  sender_id: string;
  receiver_id: string;
  gift_id: string;
  amount: number;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type GiftCatalogRow = {
  id: string;
  name: string;
  emoji: string;
};

export type RoomGiftEvent = {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  giftId: string;
  giftName: string;
  giftEmoji: string;
  amount: number;
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
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
        }),
    },
  });
}

export async function fetchRoomGiftEvents(
  roomId: string,
  limit = 20,
  supabaseClient?: SupabaseClient,
): Promise<RoomGiftEvent[]> {
  if (!roomId) {
    return [];
  }

  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 20);

  try {
    const supabase = supabaseClient ?? getSupabaseClient();
    const { data: transactionRows, error: transactionError } = await supabase
      .from("gift_transactions")
      .select("id, room_id, sender_id, receiver_id, gift_id, amount, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (transactionError || !transactionRows?.length) {
      return [];
    }

    const orderedRows = [...(transactionRows as GiftTransactionRow[])].reverse();
    const senderIds = Array.from(new Set(orderedRows.map((row) => row.sender_id)));
    const giftIds = Array.from(new Set(orderedRows.map((row) => row.gift_id)));

    const [{ data: profilesRows }, { data: giftRows }] = await Promise.all([
      senderIds.length
        ? supabase.from("profiles").select("id, display_name").in("id", senderIds)
        : Promise.resolve({ data: [] as ProfileRow[] }),
      giftIds.length
        ? supabase.from("gift_catalog").select("id, name, emoji").in("id", giftIds)
        : Promise.resolve({ data: [] as GiftCatalogRow[] }),
    ]);

    const senderNameById = new Map<string, string>(
      (profilesRows ?? []).map((row) => [row.id, row.display_name?.trim() || "Üye"]),
    );
    const giftById = new Map<string, { name: string; emoji: string }>(
      (giftRows ?? []).map((row) => [row.id, { name: row.name, emoji: row.emoji }]),
    );

    return orderedRows.map((row) => {
      const gift = giftById.get(row.gift_id);
      return {
        id: row.id,
        roomId: row.room_id,
        senderId: row.sender_id,
        senderName: senderNameById.get(row.sender_id) ?? "Üye",
        receiverId: row.receiver_id,
        giftId: row.gift_id,
        giftName: gift?.name ?? "Hediye",
        giftEmoji: gift?.emoji ?? "🎁",
        amount: row.amount,
        createdAt: row.created_at,
      };
    });
  } catch {
    return [];
  }
}
