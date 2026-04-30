import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const ADMIN_ROLES = new Set(["admin", "owner"]);
const ROOMS_LIMIT = 50;
const MESSAGE_FETCH_LIMIT = 150;
const GIFT_FETCH_LIMIT = 150;
const PRESENCE_PER_ROOM_LIMIT = 50;
const PRESENCE_TOTAL_FETCH_LIMIT = 1000;

type RoomRow = {
  id: string;
  title: string | null;
  status: string;
  owner_id: string;
  updated_at: string | null;
  created_at: string | null;
};

type PresenceRow = {
  room_id: string;
  user_id: string;
  role: string | null;
  last_seen_at: string;
};

type MessageRow = {
  id: string;
  room_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type GiftRow = {
  id: string;
  room_id: string;
  sender_id: string;
  gift_id: string;
  amount: number;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  role?: string | null;
};

type GiftCatalogRow = {
  id: string;
  name: string;
  emoji: string;
};

type RoomMuteRow = {
  room_id: string;
  user_id: string;
};

type RoomBanRow = {
  room_id: string;
  user_id: string;
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

function takeLastByRoom<T extends { room_id: string }>(rows: T[], limitPerRoom: number) {
  const roomCounts = new Map<string, number>();
  const selected: T[] = [];
  for (const row of rows) {
    const count = roomCounts.get(row.room_id) ?? 0;
    if (count >= limitPerRoom) {
      continue;
    }
    roomCounts.set(row.room_id, count + 1);
    selected.push(row);
  }
  return selected;
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, message: "Canlı yayın verisi yüklenemedi." }, { status: 500 });
  }

  const authHeader = parseBearerToken(request);
  if (!authHeader) {
    return noStoreJson({ ok: false, message: "Giriş gerekli." }, { status: 401 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return noStoreJson({ ok: false, message: "Giriş gerekli." }, { status: 401 });
    }

    const { data: requesterProfile, error: requesterProfileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single<{ role: string }>();
    if (requesterProfileError || !requesterProfile || !ADMIN_ROLES.has(requesterProfile.role)) {
      return noStoreJson({ ok: false, message: "Bu işlem için yetkin yok." }, { status: 403 });
    }

    const { data: roomRows, error: roomError } = await supabase
      .from("rooms")
      .select("id, title, status, owner_id, updated_at, created_at")
      .eq("status", "live")
      .order("updated_at", { ascending: false })
      .limit(ROOMS_LIMIT);
    if (roomError) {
      return noStoreJson({ ok: false, message: "Canlı yayın verisi yüklenemedi." }, { status: 500 });
    }

    const rooms = (roomRows as RoomRow[] | null) ?? [];
    if (!rooms.length) {
      return noStoreJson({ ok: true, rooms: [] });
    }

    const roomIds = rooms.map((room) => room.id);

    const [{ data: presenceRows }, { data: messageRows }, { data: giftRows }, { data: roomMuteRows }, { data: roomBanRows }] =
      await Promise.all([
        supabase
          .from("room_presence")
          .select("room_id, user_id, role, last_seen_at")
          .in("room_id", roomIds)
          .order("last_seen_at", { ascending: false })
          .limit(PRESENCE_TOTAL_FETCH_LIMIT),
      supabase
        .from("room_messages")
        .select("id, room_id, sender_id, body, created_at")
        .in("room_id", roomIds)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_FETCH_LIMIT),
      supabase
        .from("gift_transactions")
        .select("id, room_id, sender_id, gift_id, amount, created_at")
        .in("room_id", roomIds)
        .order("created_at", { ascending: false })
        .limit(GIFT_FETCH_LIMIT),
        supabase.from("room_mutes").select("room_id, user_id").in("room_id", roomIds),
        supabase.from("room_bans").select("room_id, user_id").in("room_id", roomIds),
      ]);

    const safePresenceRows = (presenceRows as PresenceRow[] | null) ?? [];
    const safeMessageRows = takeLastByRoom((messageRows as MessageRow[] | null) ?? [], 3);
    const safeGiftRows = takeLastByRoom((giftRows as GiftRow[] | null) ?? [], 3);

    const safeRoomMuteRows = (roomMuteRows as RoomMuteRow[] | null) ?? [];
    const safeRoomBanRows = (roomBanRows as RoomBanRow[] | null) ?? [];
    const ownerIds = rooms.map((room) => room.owner_id);
    const presenceUserIds = safePresenceRows.map((presence) => presence.user_id);
    const messageSenderIds = safeMessageRows.map((message) => message.sender_id);
    const giftSenderIds = safeGiftRows.map((gift) => gift.sender_id);
    const allProfileIds = Array.from(new Set([...ownerIds, ...presenceUserIds, ...messageSenderIds, ...giftSenderIds]));
    const allGiftIds = Array.from(new Set(safeGiftRows.map((gift) => gift.gift_id)));

    const [{ data: profileRows }, { data: giftCatalogRows }] = await Promise.all([
      allProfileIds.length
        ? supabase.from("profiles").select("id, display_name, role").in("id", allProfileIds)
        : Promise.resolve({ data: [] as ProfileRow[] }),
      allGiftIds.length
        ? supabase.from("gift_catalog").select("id, name, emoji").in("id", allGiftIds)
        : Promise.resolve({ data: [] as GiftCatalogRow[] }),
    ]);

    const profileNameById = new Map<string, string>(
      ((profileRows as ProfileRow[] | null) ?? []).map((profile) => [profile.id, profile.display_name?.trim() || "Kullanıcı"]),
    );
    const profileRoleById = new Map<string, string>(
      ((profileRows as ProfileRow[] | null) ?? []).map((profile) => [profile.id, profile.role?.trim() || "viewer"]),
    );
    const giftById = new Map<string, { name: string; emoji: string }>(
      ((giftCatalogRows as GiftCatalogRow[] | null) ?? []).map((gift) => [gift.id, { name: gift.name, emoji: gift.emoji }]),
    );

    const viewerCountByRoomId = new Map<string, number>();
    for (const presenceRow of safePresenceRows) {
      viewerCountByRoomId.set(presenceRow.room_id, (viewerCountByRoomId.get(presenceRow.room_id) ?? 0) + 1);
    }

    const mutedUserKeys = new Set(safeRoomMuteRows.map((mute) => `${mute.room_id}:${mute.user_id}`));
    const bannedUserKeys = new Set(safeRoomBanRows.map((ban) => `${ban.room_id}:${ban.user_id}`));
    const presenceUsersByRoomId = new Map<
      string,
      Array<{
        userId: string;
        displayName: string;
        role: string;
        lastSeenAt: string;
        isMuted: boolean;
        isBanned: boolean;
      }>
    >();
    const presenceCountsByRoomId = new Map<string, number>();
    for (const presenceRow of safePresenceRows) {
      const count = presenceCountsByRoomId.get(presenceRow.room_id) ?? 0;
      if (count >= PRESENCE_PER_ROOM_LIMIT) {
        continue;
      }
      const roomPresenceUsers = presenceUsersByRoomId.get(presenceRow.room_id) ?? [];
      roomPresenceUsers.push({
        userId: presenceRow.user_id,
        displayName: profileNameById.get(presenceRow.user_id) ?? "Kullanıcı",
        role: profileRoleById.get(presenceRow.user_id) ?? presenceRow.role?.trim() ?? "viewer",
        lastSeenAt: presenceRow.last_seen_at,
        isMuted: mutedUserKeys.has(`${presenceRow.room_id}:${presenceRow.user_id}`),
        isBanned: bannedUserKeys.has(`${presenceRow.room_id}:${presenceRow.user_id}`),
      });
      presenceUsersByRoomId.set(presenceRow.room_id, roomPresenceUsers);
      presenceCountsByRoomId.set(presenceRow.room_id, count + 1);
    }

    const messagesByRoomId = new Map<
      string,
      Array<{
        senderName: string;
        body: string;
        createdAt: string;
      }>
    >();
    for (const messageRow of safeMessageRows) {
      const roomMessages = messagesByRoomId.get(messageRow.room_id) ?? [];
      roomMessages.push({
        senderName: profileNameById.get(messageRow.sender_id) ?? "Kullanıcı",
        body: messageRow.body,
        createdAt: messageRow.created_at,
      });
      messagesByRoomId.set(messageRow.room_id, roomMessages);
    }

    const giftsByRoomId = new Map<
      string,
      Array<{
        senderName: string;
        giftName: string;
        giftEmoji: string;
        amount: number;
        createdAt: string;
      }>
    >();
    for (const giftRow of safeGiftRows) {
      const roomGifts = giftsByRoomId.get(giftRow.room_id) ?? [];
      const gift = giftById.get(giftRow.gift_id);
      roomGifts.push({
        senderName: profileNameById.get(giftRow.sender_id) ?? "Kullanıcı",
        giftName: gift?.name ?? "Hediye",
        giftEmoji: gift?.emoji ?? "🎁",
        amount: giftRow.amount,
        createdAt: giftRow.created_at,
      });
      giftsByRoomId.set(giftRow.room_id, roomGifts);
    }

    const responseRooms = rooms.map((room) => ({
      id: room.id,
      title: room.title,
      status: room.status,
      ownerId: room.owner_id,
      streamer: {
        displayName: profileNameById.get(room.owner_id) ?? (room.title?.trim() || "Yayıncı"),
      },
      updatedAt: room.updated_at,
      createdAt: room.created_at,
      viewerCount: viewerCountByRoomId.get(room.id) ?? 0,
      lastMessages: messagesByRoomId.get(room.id) ?? [],
      lastGifts: giftsByRoomId.get(room.id) ?? [],
      presenceUsers: presenceUsersByRoomId.get(room.id) ?? [],
    }));

    return noStoreJson({
      ok: true,
      rooms: responseRooms,
    });
  } catch {
    return noStoreJson({ ok: false, message: "Canlı yayın verisi yüklenemedi." }, { status: 500 });
  }
}
