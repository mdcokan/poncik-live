import { expect, type APIRequestContext } from "@playwright/test";

type LiveRoomApiItem = {
  id: string;
  title?: string | null;
  streamerName?: string | null;
  ownerDisplayName?: string | null;
};

type LiveRoomsPayload = {
  rooms?: LiveRoomApiItem[];
};

export type RoomStatePayload = {
  id: string;
  title: string | null;
  status: string;
  ownerId: string;
  streamerName: string;
  isLive: boolean;
};

function roomMatchesStreamer(room: LiveRoomApiItem, matcher: RegExp | string) {
  const roomText = `${room.streamerName ?? ""} ${room.ownerDisplayName ?? ""} ${room.title ?? ""}`.trim();
  if (!roomText) {
    return false;
  }
  if (typeof matcher === "string") {
    return roomText.toLocaleLowerCase("tr-TR").includes(matcher.toLocaleLowerCase("tr-TR"));
  }
  return matcher.test(roomText);
}

export async function fetchLiveRoomsSnapshot(request: APIRequestContext) {
  const response = await request.get(`/api/live-rooms?limit=24&t=${Date.now()}`, { failOnStatusCode: false });
  if (!response.ok()) {
    throw new Error(`live-rooms request failed: ${response.status()} ${response.statusText()}`);
  }
  const payload = (await response.json()) as LiveRoomsPayload;
  return payload;
}

export async function waitForLiveRoomByStreamerName(
  request: APIRequestContext,
  streamerNameRegexOrText: RegExp | string,
  timeoutMs = 30_000,
) {
  let latestPayload: LiveRoomsPayload = {};

  await expect
    .poll(
      async () => {
        latestPayload = await fetchLiveRoomsSnapshot(request);
        const rooms = Array.isArray(latestPayload.rooms) ? latestPayload.rooms : [];
        const matchedRoom = rooms.find((room) => roomMatchesStreamer(room, streamerNameRegexOrText));
        return matchedRoom?.id ?? null;
      },
      {
        timeout: timeoutMs,
        intervals: [300, 600, 1000],
        message: `live room not found for ${String(streamerNameRegexOrText)}`,
      },
    )
    .not.toBeNull();

  const rooms = Array.isArray(latestPayload.rooms) ? latestPayload.rooms : [];
  const finalRoom = rooms.find((room) => roomMatchesStreamer(room, streamerNameRegexOrText));
  if (!finalRoom?.id) {
    throw new Error(`live room disappeared for ${String(streamerNameRegexOrText)}`);
  }
  return finalRoom;
}

export async function fetchRoomStateSnapshot(request: APIRequestContext, roomId: string) {
  const response = await request.get(`/api/rooms/${roomId}/state?t=${Date.now()}`, { failOnStatusCode: false });
  const bodyText = await response.text();
  let payload: RoomStatePayload | Record<string, unknown> | null = null;
  try {
    payload = bodyText ? (JSON.parse(bodyText) as RoomStatePayload | Record<string, unknown>) : null;
  } catch {
    payload = null;
  }
  return {
    status: response.status(),
    ok: response.ok(),
    payload,
    bodyText,
  };
}
