import type { APIRequestContext } from "@playwright/test";

type LiveRoomApiItem = {
  id: string;
  title?: string | null;
  streamerName?: string | null;
  ownerDisplayName?: string | null;
  displayName?: string | null;
  status?: string | null;
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

/** Fixture streamer Eda — tolerant of ASCII "Yayinci" vs "Yayıncı" title/display variants. */
export const EDA_STREAMER_ROOM_MATCHER = /Yayıncı\s+Eda|Yayinci\s+Eda|Eda/i;

export type MatchedLiveRoom = {
  id: string;
  title: string | null;
  streamerName: string;
};

export type LiveRoomsPollSnapshot = {
  httpStatus: number;
  responseOk: boolean;
  bodySnippet: string;
  rooms: LiveRoomApiItem[];
};

function snippet(value: string, max = 900) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) {
    return collapsed;
  }
  return `${collapsed.slice(0, max)}…`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function pollIntervalMs() {
  return 500 + Math.floor(Math.random() * 500);
}

function roomsDiagnosticJson(rooms: LiveRoomApiItem[]) {
  const slim = rooms.map((room) => ({
    id: room.id,
    streamerName: room.streamerName ?? null,
    title: room.title ?? null,
    status: room.status ?? null,
  }));
  return snippet(JSON.stringify(slim));
}

function roomMatchesStreamer(room: LiveRoomApiItem, matcher: RegExp | string) {
  const roomText = [
    room.streamerName,
    room.ownerDisplayName,
    room.displayName,
    room.title,
  ]
    .filter((part) => part != null && String(part).length > 0)
    .join(" ")
    .trim();
  if (!roomText) {
    return false;
  }
  if (typeof matcher === "string") {
    return roomText.toLocaleLowerCase("tr-TR").includes(matcher.toLocaleLowerCase("tr-TR"));
  }
  return matcher.test(roomText);
}

function toMatchedRoom(room: LiveRoomApiItem): MatchedLiveRoom {
  return {
    id: room.id,
    title: room.title ?? null,
    streamerName: room.streamerName?.trim() || room.title?.trim() || "",
  };
}

/**
 * Single GET with cache-busting. Does not throw on HTTP errors — use {@link waitForLiveRoomByStreamerName} for retries + diagnostics.
 */
export async function pollLiveRoomsSnapshot(request: APIRequestContext): Promise<LiveRoomsPollSnapshot> {
  try {
    const response = await request.get(`/api/live-rooms?limit=24&t=${Date.now()}`, {
      failOnStatusCode: false,
      timeout: 15_000,
    });
    const httpStatus = response.status();
    const bodyText = await response.text();
    const bodySnippet = snippet(bodyText);

    if (!response.ok()) {
      return { httpStatus, responseOk: false, bodySnippet, rooms: [] };
    }

    let payload: LiveRoomsPayload = {};
    try {
      payload = (bodyText ? JSON.parse(bodyText) : {}) as LiveRoomsPayload;
    } catch {
      return { httpStatus, responseOk: true, bodySnippet: `(invalid JSON) ${bodySnippet}`, rooms: [] };
    }

    const rooms = Array.isArray(payload.rooms) ? payload.rooms : [];
    return { httpStatus, responseOk: true, bodySnippet, rooms };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return {
      httpStatus: 0,
      responseOk: false,
      bodySnippet: snippet(`(request failed) ${message}`),
      rooms: [],
    };
  }
}

export async function fetchLiveRoomsSnapshot(request: APIRequestContext) {
  const snap = await pollLiveRoomsSnapshot(request);
  if (!snap.responseOk) {
    throw new Error(`live-rooms request failed: ${snap.httpStatus} ${snap.bodySnippet}`);
  }
  return { rooms: snap.rooms } satisfies LiveRoomsPayload;
}

export async function waitForLiveRoomByStreamerName(
  request: APIRequestContext,
  streamerNameRegexOrText: RegExp | string,
  timeoutMs = 60_000,
): Promise<MatchedLiveRoom> {
  const deadline = Date.now() + timeoutMs;
  let lastHttpStatus: number | null = null;
  let lastBodySnippet = "";
  let lastRoomsSnippet = "";
  let lastResponseOk = false;

  while (Date.now() < deadline) {
    const snap = await pollLiveRoomsSnapshot(request);
    lastHttpStatus = snap.httpStatus;
    lastBodySnippet = snap.bodySnippet;
    lastResponseOk = snap.responseOk;
    lastRoomsSnippet = roomsDiagnosticJson(snap.rooms);

    if (snap.responseOk) {
      const matchedRoom = snap.rooms.find((room) => roomMatchesStreamer(room, streamerNameRegexOrText));
      if (matchedRoom?.id) {
        return toMatchedRoom(matchedRoom);
      }
    }

    await sleep(pollIntervalMs());
  }

  const matcherLabel = streamerNameRegexOrText instanceof RegExp ? streamerNameRegexOrText.toString() : JSON.stringify(streamerNameRegexOrText);
  throw new Error(
    [
      `waitForLiveRoomByStreamerName timed out after ${timeoutMs}ms.`,
      `matcher=${matcherLabel}`,
      `lastHttpStatus=${lastHttpStatus ?? "n/a"}`,
      `lastResponseOk=${lastResponseOk}`,
      `lastBodySnippet=${lastBodySnippet || "(empty)"}`,
      `lastRoomsSnippet=${lastRoomsSnippet || "[]"}`,
    ].join(" "),
  );
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
