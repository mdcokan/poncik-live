"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchRoomPresenceFromApi,
  removeRoomPresence,
  type RoomPresenceUser,
  upsertRoomPresence,
} from "@/lib/room-presence";
import { fetchRoomMessages, type RoomMessage } from "@/lib/room-messages";
import { fetchRoomGiftEvents, type RoomGiftEvent } from "@/lib/gift-transactions";
import {
  getSupabaseBrowserClient,
  LIVE_ROOMS_BROADCAST_CHANNEL,
  LIVE_ROOMS_CHANGED_EVENT,
} from "@/lib/supabase-browser";
import PrivateRoomSessionPanel from "@/components/private-room/PrivateRoomSessionPanel";

type RoomRow = {
  id: string;
  title: string | null;
  status: string;
  owner_id: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  role: string | null;
  is_banned: boolean | null;
};

type ViewerState = {
  room: RoomRow | null;
  ownerProfile: ProfileRow | null;
  isLoggedIn: boolean;
  userId: string | null;
  userDisplayName: string | null;
  isLoading: boolean;
};

type GiftCatalogItem = {
  id: string;
  code: string;
  name: string;
  emoji: string;
  price: number;
  coinAmount?: number;
  amount?: number;
  sortOrder: number;
};

type SendGiftApiResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
  gift?: {
    gift_name?: string;
    sender_balance?: number;
  };
};

type PrivateRequestApiResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
};

type PrivateRoomRequestRealtimeRow = {
  id: string;
  room_id: string;
  viewer_id: string;
  status: string;
};

type PrivateSessionSummary = {
  sessionId: string;
  roomId: string;
  requestId: string;
  streamerId: string;
  streamerName: string;
  viewerId: string;
  viewerName: string;
  status: string;
  startedAt: string;
  viewerBalanceMinutes?: number;
  elapsedSeconds?: number;
  estimatedChargedMinutes?: number;
  estimatedRemainingMinutes?: number;
  isLowBalance?: boolean;
};

type PrivateSessionApiResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
  session?: PrivateSessionSummary | null;
};

type EndSessionApiResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
  session?: {
    status?: string;
    durationSeconds?: number;
    chargedMinutes?: number;
    viewerSpentMinutes?: number;
    streamerEarnedMinutes?: number;
    platformFeeMinutes?: number;
  };
};

type LiveRoomsBroadcastPayload = {
  action?: "started" | "stopped";
  roomId?: string;
  status?: "live" | "offline";
  at?: number;
};

type PublicRoomStateResponse = {
  id: string;
  title: string | null;
  status: string;
  ownerId: string;
  streamerName: string;
  isLive: boolean;
};

type RoomModerationRow = {
  id: string;
};

const PRESENCE_HEARTBEAT_INTERVAL_MS = 10_000;

function getStreamerName(room: RoomRow | null, profile: ProfileRow | null) {
  const profileName = profile?.display_name?.trim();
  const roomTitle = room?.title?.trim();
  return profileName || roomTitle || "Yayinci";
}

function getPresenceRoleLabel(role: string) {
  if (role === "streamer") {
    return "Yayinci";
  }
  if (role === "admin") {
    return "Admin";
  }
  return "Izleyici";
}

function formatSeenText(lastSeenAt: string) {
  const milliseconds = Date.now() - new Date(lastSeenAt).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return "simdi";
  }
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 45) {
    return "simdi";
  }
  if (seconds < 60) {
    return `${seconds} sn once`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} dk once`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours} sa once`;
}

function RoomInfoState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="min-h-screen bg-cyan-100 px-4 py-6 text-slate-800 sm:px-6">
      <section className="mx-auto max-w-3xl rounded-3xl border border-pink-100 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-pink-400">Poncik Live</p>
        <h1 className="mt-4 text-3xl font-black text-indigo-800">{title}</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
        <Link
          href="/rooms"
          className="mt-7 inline-flex rounded-full bg-pink-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-pink-400"
        >
          Online yayincilara dön
        </Link>
      </section>
    </main>
  );
}

export default function ViewerRoomClientPage() {
  const params = useParams<{ roomId?: string }>();
  const roomId = useMemo(() => {
    const raw = params?.roomId;
    if (Array.isArray(raw)) {
      return raw[0] ?? "";
    }
    return raw ?? "";
  }, [params]);

  const [state, setState] = useState<ViewerState>({
    room: null,
    ownerProfile: null,
    isLoggedIn: false,
    userId: null,
    userDisplayName: null,
    isLoading: true,
  });
  const [hasFetchError, setHasFetchError] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "gift">("chat");
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [chatBody, setChatBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isRefreshingMessages, setIsRefreshingMessages] = useState(false);
  const [presenceUsers, setPresenceUsers] = useState<RoomPresenceUser[]>([]);
  const [giftCatalog, setGiftCatalog] = useState<GiftCatalogItem[]>([]);
  const [isGiftCatalogLoading, setIsGiftCatalogLoading] = useState(false);
  const [hasGiftCatalogLoaded, setHasGiftCatalogLoaded] = useState(false);
  const [pendingGiftId, setPendingGiftId] = useState<string | null>(null);
  const [giftFeedback, setGiftFeedback] = useState<string | null>(null);
  const [presenceErrorMessage, setPresenceErrorMessage] = useState<string | null>(null);
  const [isViewerBanned, setIsViewerBanned] = useState(false);
  const [isRoomBanned, setIsRoomBanned] = useState(false);
  const [isRoomMuted, setIsRoomMuted] = useState(false);
  const [isRoomKicked, setIsRoomKicked] = useState(false);
  const [moderationMessage, setModerationMessage] = useState<string | null>(null);
  const [giftEvents, setGiftEvents] = useState<RoomGiftEvent[]>([]);
  const [giftOverlayText, setGiftOverlayText] = useState<string | null>(null);
  const [privateRequestFeedback, setPrivateRequestFeedback] = useState<string | null>(null);
  const [isPrivateRequestPending, setIsPrivateRequestPending] = useState(false);
  const [showInsufficientMinutesModal, setShowInsufficientMinutesModal] = useState(false);
  const [activePrivateSession, setActivePrivateSession] = useState<PrivateSessionSummary | null>(null);
  const [privateSessionResult, setPrivateSessionResult] = useState<string | null>(null);
  const [privateSessionError, setPrivateSessionError] = useState<string | null>(null);
  const [isPrivateSessionStarting, setIsPrivateSessionStarting] = useState(false);
  const [isPrivateSessionEnding, setIsPrivateSessionEnding] = useState(false);
  const messageIdsRef = useRef(new Set<string>());
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const refreshDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const giftOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestGiftEventIdRef = useRef<string | null>(null);

  const isLive = state.room?.status === "live";
  const isChatInputDisabled = !state.isLoggedIn || !isLive || isSending || isRoomMuted || isRoomBanned || isRoomKicked;
  const isGiftSendDisabled = !state.isLoggedIn || !isLive || isViewerBanned || isRoomBanned || isRoomKicked || Boolean(pendingGiftId);
  const isPrivateRequestDisabled = !isLive || isViewerBanned || isRoomBanned || isRoomKicked || isPrivateRequestPending;
  const hasActivePrivateSession = Boolean(activePrivateSession?.sessionId);

  function getGiftMinuteCost(gift: GiftCatalogItem) {
    return gift.coinAmount ?? gift.amount ?? gift.price ?? 0;
  }

  const scrollMessagesToBottom = useCallback(() => {
    const element = messagesContainerRef.current;
    if (!element) {
      return;
    }
    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
  }, []);

  const mergeMessages = useCallback(
    (incomingMessages: RoomMessage[]) => {
      if (!incomingMessages.length) {
        return;
      }

      setMessages((previousMessages) => {
        const mergedMap = new Map<string, RoomMessage>();
        for (const message of previousMessages) {
          mergedMap.set(message.id, message);
        }
        for (const message of incomingMessages) {
          mergedMap.set(message.id, message);
        }

        const dedupedSorted = Array.from(mergedMap.values()).sort(
          (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
        );
        const nextMessages = dedupedSorted.slice(-50);
        messageIdsRef.current = new Set(nextMessages.map((message) => message.id));
        return nextMessages;
      });
    },
    [setMessages],
  );

  const refreshMessages = useCallback(async () => {
    if (!roomId || !isLive || isRefreshingMessages) {
      return;
    }

    setIsRefreshingMessages(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const fetchedMessages = await fetchRoomMessages(roomId, 50, supabase);
      setMessages(fetchedMessages);
      messageIdsRef.current = new Set(fetchedMessages.map((message) => message.id));
      scrollMessagesToBottom();
    } finally {
      setIsRefreshingMessages(false);
    }
  }, [isLive, isRefreshingMessages, roomId, scrollMessagesToBottom]);

  const scheduleRefreshMessages = useCallback(
    (delayMs = 150) => {
      if (refreshDebounceTimerRef.current) {
        clearTimeout(refreshDebounceTimerRef.current);
      }
      refreshDebounceTimerRef.current = setTimeout(() => {
        void refreshMessages();
      }, delayMs);
    },
    [refreshMessages],
  );

  const refreshPresence = useCallback(async () => {
    if (!roomId || !isLive) {
      setPresenceUsers([]);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const fetchedPresence = await fetchRoomPresenceFromApi(roomId, supabase, 100);
    setPresenceUsers(fetchedPresence);
  }, [isLive, roomId]);

  const scheduleRefreshPresence = useCallback(
    (delayMs = 120) => {
      if (presenceRefreshTimerRef.current) {
        clearTimeout(presenceRefreshTimerRef.current);
      }
      presenceRefreshTimerRef.current = setTimeout(() => {
        void refreshPresence();
      }, delayMs);
    },
    [refreshPresence],
  );

  const refreshGiftEvents = useCallback(async () => {
    if (!roomId || !isLive) {
      setGiftEvents([]);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const nextEvents = await fetchRoomGiftEvents(roomId, 20, supabase);
    setGiftEvents(nextEvents);
  }, [isLive, roomId]);

  const fetchRoomStateFromApi = useCallback(
    async (targetRoomId: string): Promise<PublicRoomStateResponse | null> => {
      const response = await fetch(`/api/rooms/${targetRoomId}/state`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`ROOM_STATE_FETCH_FAILED_${response.status}`);
      }
      return (await response.json()) as PublicRoomStateResponse;
    },
    [],
  );

  const refreshModerationState = useCallback(async () => {
    if (!roomId || !state.userId || !isLive) {
      setIsRoomMuted(false);
      setIsRoomBanned(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const [{ data: roomBan }, { data: roomMute }] = await Promise.all([
      supabase
        .from("room_bans")
        .select("id")
        .eq("room_id", roomId)
        .eq("user_id", state.userId)
        .maybeSingle<RoomModerationRow>(),
      supabase
        .from("room_mutes")
        .select("id")
        .eq("room_id", roomId)
        .eq("user_id", state.userId)
        .maybeSingle<RoomModerationRow>(),
    ]);

    const nextBanned = Boolean(roomBan?.id);
    const nextMuted = Boolean(roomMute?.id);
    setIsRoomBanned(nextBanned);
    setIsRoomMuted(nextMuted);
    if (nextBanned) {
      setModerationMessage("Bu odaya girişiniz engellenmiştir.");
    }
  }, [isLive, roomId, state.userId]);

  const upsertOwnPresence = useCallback(async () => {
    if (!roomId || !state.userId || !isLive || isRoomBanned || isRoomKicked) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const result = await upsertRoomPresence(
      {
        roomId,
        userId: state.userId,
        role: "viewer",
      },
      supabase,
    );
    if (!result.ok) {
      setPresenceErrorMessage(result.errorMessage || "Odadakiler listesine katilim dogrulanamadi.");
      return;
    }
    setPresenceErrorMessage(null);
  }, [isLive, isRoomBanned, isRoomKicked, roomId, state.userId]);

  const removeOwnPresence = useCallback(async () => {
    if (!roomId || !state.userId) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const result = await removeRoomPresence(
      {
        roomId,
        userId: state.userId,
      },
      supabase,
    );
    if (!result.ok) {
      setPresenceErrorMessage(result.errorMessage || "Odadakiler kaydi kaldirilamadi.");
    }
  }, [roomId, state.userId]);

  const applyRoomClosedState = useCallback((targetRoomId?: string | null) => {
    if (!targetRoomId || targetRoomId !== roomId) {
      return;
    }
    setState((prev) => {
      if (!prev.room) {
        return prev;
      }
      if (prev.room.status !== "live") {
        return prev;
      }
      return {
        ...prev,
        room: {
          ...prev.room,
          status: "offline",
        },
      };
    });
    setChatBody("");
    setMessages([]);
    setPresenceUsers([]);
    setGiftEvents([]);
    latestGiftEventIdRef.current = null;
  }, [roomId]);

  useEffect(() => {
    if (!roomId) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        room: null,
        ownerProfile: null,
        userId: null,
        userDisplayName: null,
      }));
      return;
    }

    let cancelled = false;

    async function loadViewerRoom() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const userId = user?.id ?? null;
        let userDisplayName: string | null = user?.email?.split("@")[0] ?? null;
        if (userId) {
          const { data: userProfileData } = await supabase
            .from("profiles")
            .select("display_name, is_banned")
            .eq("id", userId)
            .maybeSingle();
          userDisplayName = userProfileData?.display_name?.trim() || userDisplayName;
          setIsViewerBanned(userProfileData?.is_banned === true);
        } else {
          setIsViewerBanned(false);
        }

        const roomState = await fetchRoomStateFromApi(roomId);
        if (!roomState) {
          if (!cancelled) {
            setState({
              room: null,
              ownerProfile: null,
              isLoggedIn: Boolean(user),
              userId,
              userDisplayName,
              isLoading: false,
            });
          }
          return;
        }

        if (!cancelled) {
          setState({
            room: {
              id: roomState.id,
              title: roomState.title,
              status: roomState.status,
              owner_id: roomState.ownerId,
            },
            ownerProfile: {
              id: roomState.ownerId,
              display_name: roomState.streamerName,
              role: "streamer",
              is_banned: null,
            },
            isLoggedIn: Boolean(user),
            userId,
            userDisplayName,
            isLoading: false,
          });
        }
      } catch {
        if (!cancelled) {
          setHasFetchError(true);
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      }
    }

    loadViewerRoom();
    return () => {
      cancelled = true;
    };
  }, [fetchRoomStateFromApi, roomId]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    async function refreshRoomState() {
      try {
        const roomState = await fetchRoomStateFromApi(roomId);
        if (cancelled || !roomState) {
          return;
        }

        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            room: {
              id: roomState.id,
              title: roomState.title,
              status: roomState.status,
              owner_id: roomState.ownerId,
            },
            ownerProfile: {
              id: roomState.ownerId,
              display_name: roomState.streamerName,
              role: "streamer",
              is_banned: null,
            },
          }));
          if (!roomState.isLive) {
            setChatBody("");
          }
        }
      } catch {
        // Do not replace current viewer state on transient realtime refresh errors.
      }
    }

    const channel = supabase
      .channel(`public:rooms:viewer:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          const payloadRoomId =
            payload.eventType === "DELETE"
              ? ((payload.old ?? null) as { id?: string } | null)?.id
              : ((payload.new ?? null) as { id?: string } | null)?.id;
          if (!payloadRoomId || payloadRoomId !== roomId) {
            return;
          }

          if (payload.eventType === "DELETE") {
            setState((prev) => ({ ...prev, room: null }));
            return;
          }

          const nextStatus =
            payload.eventType === "UPDATE"
              ? ((payload.new ?? null) as { status?: string } | null)?.status
              : null;
          if (nextStatus && nextStatus !== "live") {
            applyRoomClosedState(payloadRoomId);
            return;
          }
          void refreshRoomState();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [applyRoomClosedState, fetchRoomStateFromApi, roomId]);

  useEffect(() => {
    if (!roomId) {
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(LIVE_ROOMS_BROADCAST_CHANNEL)
      .on("broadcast", { event: LIVE_ROOMS_CHANGED_EVENT }, ({ payload }) => {
        const liveRoomsPayload = (payload ?? null) as LiveRoomsBroadcastPayload | null;
        if (!liveRoomsPayload) {
          return;
        }
        if (liveRoomsPayload.action === "stopped") {
          applyRoomClosedState(liveRoomsPayload.roomId);
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [applyRoomClosedState, roomId]);

  useEffect(() => {
    if (!roomId || !isLive) {
      setMessages([]);
      return;
    }
    void refreshMessages();
  }, [isLive, refreshMessages, roomId]);

  useEffect(() => {
    if (!roomId || !isLive) {
      setPresenceUsers([]);
      return;
    }
    void refreshPresence();
  }, [isLive, refreshPresence, roomId]);

  useEffect(() => {
    if (!roomId || !isLive) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`public:room-messages:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_messages",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          scheduleRefreshMessages();
        },
      )
      .subscribe();

    return () => {
      if (refreshDebounceTimerRef.current) {
        clearTimeout(refreshDebounceTimerRef.current);
        refreshDebounceTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [isLive, roomId, scheduleRefreshMessages]);

  useEffect(() => {
    if (!roomId || !isLive) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`public:room-presence:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_presence",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          scheduleRefreshPresence();
        },
      )
      .subscribe();

    return () => {
      if (presenceRefreshTimerRef.current) {
        clearTimeout(presenceRefreshTimerRef.current);
        presenceRefreshTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [isLive, roomId, scheduleRefreshPresence]);

  useEffect(() => {
    if (!roomId || !isLive || !state.userId) {
      return;
    }
    void refreshModerationState();
  }, [isLive, refreshModerationState, roomId, state.userId]);

  useEffect(() => {
    if (!roomId || !isLive || !state.userId) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const bansChannel = supabase
      .channel(`public:room-bans:${roomId}:${state.userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_bans", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = (payload.new ?? payload.old ?? null) as { user_id?: string } | null;
          if (row?.user_id !== state.userId) {
            return;
          }
          if (payload.eventType === "DELETE") {
            setIsRoomBanned(false);
            setModerationMessage("Oda banınız kaldırıldı.");
          } else {
            setIsRoomBanned(true);
            setModerationMessage("Bu odaya girişiniz engellenmiştir.");
            void removeOwnPresence();
          }
        },
      )
      .subscribe();

    const mutesChannel = supabase
      .channel(`public:room-mutes:${roomId}:${state.userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_mutes", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = (payload.new ?? payload.old ?? null) as { user_id?: string } | null;
          if (row?.user_id !== state.userId) {
            return;
          }
          setIsRoomMuted(payload.eventType !== "DELETE");
        },
      )
      .subscribe();

    const kicksChannel = supabase
      .channel(`public:room-kicks:${roomId}:${state.userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "room_kicks", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = (payload.new ?? null) as { user_id?: string } | null;
          if (row?.user_id !== state.userId) {
            return;
          }
          setIsRoomKicked(true);
          setModerationMessage("Odadan çıkarıldınız.");
          void removeOwnPresence();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(bansChannel);
      void supabase.removeChannel(mutesChannel);
      void supabase.removeChannel(kicksChannel);
    };
  }, [isLive, removeOwnPresence, roomId, state.userId]);

  useEffect(() => {
    if (!state.userId) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`public:private-requests:viewer:${state.userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "private_room_requests",
          filter: `viewer_id=eq.${state.userId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old ?? null) as PrivateRoomRequestRealtimeRow | null;
          if (!row || row.viewer_id !== state.userId || payload.eventType !== "UPDATE") {
            return;
          }

          if (row.status === "accepted") {
            setPrivateRequestFeedback("Özel oda talebiniz kabul edildi.");
            void startPrivateSession(row.id);
          } else if (row.status === "rejected") {
            setPrivateRequestFeedback("Özel oda talebiniz reddedildi.");
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [hasActivePrivateSession, isPrivateSessionStarting, state.userId]);

  useEffect(() => {
    if (!state.userId || !state.isLoggedIn) {
      setActivePrivateSession(null);
      return;
    }
    void fetchActivePrivateSession();
  }, [state.isLoggedIn, state.userId]);

  useEffect(() => {
    if (!state.userId) {
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`public:private-sessions:viewer:${state.userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "private_room_sessions",
          filter: `viewer_id=eq.${state.userId}`,
        },
        () => {
          void fetchActivePrivateSession();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [state.userId]);

  useEffect(() => {
    if (!roomId || !isLive || !state.isLoggedIn || !state.userId || isRoomBanned || isRoomKicked) {
      return;
    }

    void upsertOwnPresence();
    const heartbeatTimer = setInterval(() => {
      void upsertOwnPresence();
    }, PRESENCE_HEARTBEAT_INTERVAL_MS);
    const handleBeforeUnload = () => {
      void removeOwnPresence();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(heartbeatTimer);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      void removeOwnPresence();
    };
  }, [isLive, isRoomBanned, isRoomKicked, removeOwnPresence, roomId, state.isLoggedIn, state.userId, upsertOwnPresence]);

  async function handleSendMessage() {
    const trimmedBody = chatBody.trim();
    if (!state.userId || !roomId || !isLive || !trimmedBody || trimmedBody.length > 500 || isSending || isRoomMuted || isRoomBanned || isRoomKicked) {
      return;
    }

    setIsSending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: insertedMessage } = await supabase
        .from("room_messages")
        .insert({
          room_id: roomId,
          sender_id: state.userId,
          body: trimmedBody,
        })
        .select("id, room_id, sender_id, body, created_at")
        .maybeSingle();

      if (insertedMessage && !messageIdsRef.current.has(insertedMessage.id)) {
        mergeMessages([
          {
            id: insertedMessage.id,
            roomId: insertedMessage.room_id,
            senderId: insertedMessage.sender_id,
            senderName: state.userDisplayName || "Sen",
            body: insertedMessage.body,
            createdAt: insertedMessage.created_at,
          },
        ]);
        scrollMessagesToBottom();
      }

      setChatBody("");
      scheduleRefreshMessages(120);
    } finally {
      setIsSending(false);
    }
  }

  async function handleSendGift(gift: GiftCatalogItem) {
    if (!state.isLoggedIn) {
      window.location.href = "/login";
      return;
    }

    if (!isLive || pendingGiftId) {
      return;
    }

    setGiftFeedback(null);
    setPendingGiftId(gift.id);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/gifts/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ roomId, giftId: gift.id }),
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as SendGiftApiResponse;
      if (!response.ok || !payload.ok) {
        setGiftFeedback(payload.message || "Hediye gönderilemedi. Lütfen tekrar dene.");
        return;
      }

      const giftName = payload.gift?.gift_name || gift.name;
      const balanceText =
        typeof payload.gift?.sender_balance === "number" ? ` Kalan sure: ${payload.gift.sender_balance} dk` : "";
      setGiftFeedback(`${giftName} gönderildi.${balanceText}`);
      await refreshGiftEvents();
    } catch {
      setGiftFeedback("Hediye gönderilemedi. Lütfen tekrar dene.");
    } finally {
      setPendingGiftId(null);
    }
  }

  async function handleCreatePrivateRoomRequest() {
    if (!state.isLoggedIn) {
      window.location.href = "/login";
      return;
    }
    if (!roomId || !isLive || isPrivateRequestDisabled) {
      return;
    }

    setPrivateRequestFeedback(null);
    setIsPrivateRequestPending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/private-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ roomId }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as PrivateRequestApiResponse;

      if (!response.ok || !payload.ok) {
        if (payload.code === "AUTH_REQUIRED") {
          window.location.href = "/login";
          return;
        }
        if (payload.code === "INSUFFICIENT_MINUTES") {
          setShowInsufficientMinutesModal(true);
          return;
        }
        if (payload.code === "PENDING_REQUEST_EXISTS") {
          setPrivateRequestFeedback("Bu yayıncıya bekleyen bir özel oda talebiniz var.");
          return;
        }
        setPrivateRequestFeedback(payload.message || "Özel oda talebi gönderilemedi.");
        return;
      }

      setPrivateRequestFeedback("Özel oda talebiniz yayıncıya iletildi.");
    } catch {
      setPrivateRequestFeedback("Özel oda talebi gönderilemedi.");
    } finally {
      setIsPrivateRequestPending(false);
    }
  }

  async function fetchActivePrivateSession() {
    if (!state.isLoggedIn) {
      setActivePrivateSession(null);
      return;
    }
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setActivePrivateSession(null);
        return;
      }
      const response = await fetch("/api/private-sessions/active", {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as PrivateSessionApiResponse;
      if (!response.ok || !payload.ok) {
        return;
      }
      const nextSession = payload.session && payload.session.roomId === roomId ? payload.session : null;
      setActivePrivateSession(nextSession);
    } catch {
      // keep stale value on transient errors
    }
  }

  async function startPrivateSession(requestId: string) {
    if (!requestId || isPrivateSessionStarting || hasActivePrivateSession) {
      return;
    }
    setIsPrivateSessionStarting(true);
    setPrivateSessionResult(null);
    setPrivateSessionError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }
      const response = await fetch("/api/private-sessions/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ requestId }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as PrivateSessionApiResponse;
      if (!response.ok || !payload.ok) {
        if (payload.code === "INSUFFICIENT_MINUTES") {
          setPrivateRequestFeedback("Süreniz yeterli değil.");
          return;
        }
        if (payload.code === "AUTH_REQUIRED") {
          window.location.href = "/login";
          return;
        }
        setPrivateRequestFeedback(payload.message || "Özel oda başlatılamadı.");
        return;
      }
      setActivePrivateSession(payload.session ?? null);
      setPrivateRequestFeedback("Özel oda aktif.");
    } catch {
      setPrivateRequestFeedback("Özel oda başlatılamadı.");
    } finally {
      setIsPrivateSessionStarting(false);
    }
  }

  async function endPrivateSession(reason?: string) {
    if (!activePrivateSession?.sessionId || isPrivateSessionEnding) {
      return;
    }
    setIsPrivateSessionEnding(true);
    setPrivateSessionResult(null);
    setPrivateSessionError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }
      const response = await fetch(`/api/private-sessions/${activePrivateSession.sessionId}/end`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(reason ? { reason } : {}),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as EndSessionApiResponse;
      if (!response.ok || !payload.ok) {
        setPrivateSessionError(payload.message || "Özel oda kapatılamadı.");
        return;
      }
      const spent =
        payload.session?.chargedMinutes ??
        (typeof payload.session?.durationSeconds === "number" ? Math.max(1, Math.ceil(payload.session.durationSeconds / 60)) : 0);
      const isBalanceDepleted = reason === "balance_depleted";
      setPrivateSessionResult(
        isBalanceDepleted
          ? `Süre bittiği için özel oda kapatıldı. Harcanan süre: ${spent} dk`
          : `Özel oda kapatıldı. Harcanan süre: ${spent} dk`,
      );
      setActivePrivateSession(null);
    } catch {
      setPrivateSessionError("Özel oda kapatılamadı.");
    } finally {
      setIsPrivateSessionEnding(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "gift" || hasGiftCatalogLoaded) {
      return;
    }

    let cancelled = false;
    async function loadGiftCatalog() {
      setIsGiftCatalogLoading(true);
      try {
        const response = await fetch("/api/gifts/catalog?limit=50", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) {
            setGiftCatalog([]);
            setHasGiftCatalogLoaded(true);
          }
          return;
        }

        const payload = (await response.json()) as { items?: GiftCatalogItem[] };
        if (!cancelled) {
          setGiftCatalog(Array.isArray(payload.items) ? payload.items : []);
          setHasGiftCatalogLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setGiftCatalog([]);
          setHasGiftCatalogLoaded(true);
        }
      } finally {
        if (!cancelled) {
          setIsGiftCatalogLoading(false);
        }
      }
    }

    void loadGiftCatalog();
    return () => {
      cancelled = true;
    };
  }, [activeTab, hasGiftCatalogLoaded]);

  useEffect(() => {
    if (!roomId || !isLive) {
      setGiftEvents([]);
      latestGiftEventIdRef.current = null;
      return;
    }
    void refreshGiftEvents();
  }, [isLive, refreshGiftEvents, roomId]);

  useEffect(() => {
    if (!roomId || !isLive) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`public:gift-transactions:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "gift_transactions",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void refreshGiftEvents();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isLive, refreshGiftEvents, roomId]);

  useEffect(() => {
    if (!giftEvents.length) {
      return;
    }

    const newestGift = giftEvents[giftEvents.length - 1];
    if (latestGiftEventIdRef.current === newestGift.id) {
      return;
    }
    latestGiftEventIdRef.current = newestGift.id;
    setGiftOverlayText(`${newestGift.senderName} ${newestGift.giftEmoji} ${newestGift.giftName} gönderdi`);
    if (giftOverlayTimerRef.current) {
      clearTimeout(giftOverlayTimerRef.current);
    }
    giftOverlayTimerRef.current = setTimeout(() => {
      setGiftOverlayText(null);
    }, 2800);

    return () => {
      if (giftOverlayTimerRef.current) {
        clearTimeout(giftOverlayTimerRef.current);
        giftOverlayTimerRef.current = null;
      }
    };
  }, [giftEvents]);

  if (state.isLoading) {
    return (
      <main className="min-h-screen bg-cyan-100 px-4 py-6 text-slate-800 sm:px-6">
        <section className="mx-auto max-w-3xl rounded-3xl border border-pink-100 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-indigo-700">Oda yukleniyor...</p>
        </section>
      </main>
    );
  }

  if (!state.room) {
    return (
      <RoomInfoState
        title="Oda bulunamadi"
        description={
          hasFetchError
            ? "Oda bilgisi su an alinamadi. Lutfen biraz sonra tekrar deneyin."
            : "Bu oda artik mevcut degil ya da gecersiz bir baglanti kullaniyorsun."
        }
      />
    );
  }

  if (state.room.status !== "live") {
    return (
      <RoomInfoState
        title="Bu yayin su an kapali"
        description="Yayinci yayini sonlandirdi. Yeni canli yayinlarda tekrar gorusebiliriz."
      />
    );
  }

  if (isRoomBanned) {
    return (
      <RoomInfoState
        title="Bu odaya girişiniz engellenmiştir."
        description={moderationMessage || "Yayıncı bu oda için erişiminizi kapattı."}
      />
    );
  }

  const streamerName = getStreamerName(state.room, state.ownerProfile);
  const chatValidationError =
    chatBody.trim().length > 500 ? "Mesaj en fazla 500 karakter olabilir." : chatBody.length > 0 && !chatBody.trim() ? "Bos mesaj gonderilemez." : null;

  return (
    <main className="min-h-screen bg-[#eef7fb] text-zinc-900 lg:h-[100dvh] lg:overflow-hidden">
      <header className="h-16 border-b border-pink-100/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1800px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-lg font-black tracking-tight text-zinc-900 sm:text-xl">
              Poncik<span className="text-pink-400">Live</span>
            </Link>
            <span className="rounded-full bg-yellow-300 px-3 py-1 text-xs font-black text-black">Genel</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/rooms"
              className="rounded-full border border-pink-100 bg-white px-4 py-2 text-xs font-semibold transition hover:bg-pink-50"
            >
              Online yayincilar
            </Link>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-zinc-900 shadow-sm">0 dk</span>
          </div>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-64px)] max-w-[1800px] grid-cols-1 gap-3 p-3 lg:h-[calc(100dvh-64px)] lg:min-h-0 lg:grid-cols-[minmax(0,1.45fr)_minmax(420px,1fr)] lg:overflow-hidden lg:gap-3 lg:p-3">
        <div className="flex min-h-0 flex-col rounded-3xl border border-white/70 bg-white/60 p-3 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm lg:overflow-hidden">
          <div className="mb-2 flex h-10 shrink-0 items-center gap-2 rounded-2xl border border-pink-100 bg-white px-3">
            <span className="rounded-full bg-yellow-200 px-3 py-1 text-[11px] font-black text-zinc-800">Genel</span>
            <span className="rounded-full bg-rose-100 px-3 py-1 text-[11px] font-bold text-rose-700">CANLI</span>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-3xl border border-zinc-800/70 bg-zinc-950 p-3 sm:p-4">
            <div className="w-full max-w-[1100px]">
              <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-950 via-black to-pink-950/40 p-4">
                <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-rose-500/90 px-3 py-1 text-[11px] font-bold text-white">Canli yayin</span>
                </div>
                {giftOverlayText ? (
                  <div className="absolute bottom-3 left-3 right-3 z-20 rounded-xl border border-pink-200/70 bg-black/60 px-3 py-2 text-xs font-semibold text-pink-100 sm:left-auto sm:w-[420px]">
                    {giftOverlayText}
                  </div>
                ) : null}
                <div className="flex h-full items-center justify-center text-center">
                  <div className="absolute inset-0 rounded-3xl bg-[radial-gradient(circle_at_50%_30%,rgba(255,44,122,0.2),transparent_60%)]" />
                  <div className="relative w-full max-w-2xl">
                    <span className="inline-flex rounded-full bg-rose-500 px-5 py-1.5 text-sm font-black tracking-wide text-white shadow-lg">
                      CANLI
                    </span>
                    <h1 className="mt-4 text-2xl font-black text-white sm:text-3xl">{streamerName}</h1>
                    <p className="mt-3 text-sm text-zinc-300">
                      Yayin canli. Sohbet aktif, hediyeler anlik olarak panelde gorunur.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid h-14 shrink-0 gap-2 sm:grid-cols-4">
            <button className="rounded-2xl bg-yellow-300 px-4 py-2 text-sm font-black text-zinc-800 transition hover:brightness-95">
              CANLI DESTEK
            </button>
            <button className="rounded-2xl bg-orange-300 px-4 py-2 text-sm font-black text-zinc-800 transition hover:brightness-95">
              HEDIYE LISTESI
            </button>
            <button className="rounded-2xl bg-pink-400 px-4 py-2 text-sm font-black text-white transition hover:bg-pink-300">
              MESAJLARIM
            </button>
            <button
              type="button"
              data-testid="private-room-request-button"
              onClick={() => {
                void handleCreatePrivateRoomRequest();
              }}
              disabled={isPrivateRequestDisabled}
              className="rounded-2xl bg-violet-500 px-4 py-2 text-sm font-black text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isPrivateRequestPending ? "GONDERILIYOR..." : "OZEL ODA DAVETI"}
            </button>
          </div>
          {privateRequestFeedback ? (
            /talebiniz kabul edildi|talebiniz reddedildi/i.test(privateRequestFeedback) ? (
              <p className="mt-2 text-xs font-semibold text-violet-700" data-testid="private-request-status-message">
                {privateRequestFeedback}
              </p>
            ) : (
              <p className="mt-2 text-xs font-semibold text-violet-700" data-testid="private-request-feedback">
                {privateRequestFeedback}
              </p>
            )
          ) : null}
          {activePrivateSession ? (
            <PrivateRoomSessionPanel
              sessionId={activePrivateSession.sessionId}
              viewerName={activePrivateSession.viewerName}
              streamerName={activePrivateSession.streamerName}
              startedAt={activePrivateSession.startedAt}
              currentUserRole="viewer"
              viewerBalanceMinutes={activePrivateSession.viewerBalanceMinutes ?? null}
              initialEstimatedRemainingMinutes={activePrivateSession.estimatedRemainingMinutes ?? null}
              lowBalanceThresholdMinutes={2}
              autoEndWhenBalanceLikelyDepleted
              onAutoEnd={() => endPrivateSession("balance_depleted")}
              autoEndReason="Süre bittiği için özel oda kapatılıyor..."
              onEnd={() => endPrivateSession()}
              isEnding={isPrivateSessionEnding}
              resultText={privateSessionResult ?? undefined}
              errorText={privateSessionError ?? undefined}
            />
          ) : null}
          {!activePrivateSession && privateSessionResult ? (
            <p className="mt-2 text-xs font-semibold text-violet-700" data-testid="private-session-result">
              {privateSessionResult}
            </p>
          ) : null}
          {!activePrivateSession && privateSessionError ? (
            <p className="mt-2 text-xs font-semibold text-rose-700" data-testid="private-session-error">
              {privateSessionError}
            </p>
          ) : null}
        </div>

        <aside className="flex min-h-[420px] flex-col rounded-3xl border border-pink-100 bg-gradient-to-b from-white to-rose-50/35 text-zinc-900 shadow-[0_8px_20px_rgba(219,39,119,0.08)] lg:min-h-0 lg:h-full lg:min-w-[420px] lg:overflow-hidden">
          <div className="flex shrink-0 border-b border-zinc-200">
            <button
              type="button"
              onClick={() => setActiveTab("chat")}
              className={`relative flex-1 py-3.5 text-sm font-black transition ${
                activeTab === "chat" ? "text-pink-500" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Sohbet
              {activeTab === "chat" ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-pink-500" /> : null}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("gift")}
              className={`relative flex-1 py-3.5 text-sm font-black transition ${
                activeTab === "gift" ? "text-pink-500" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Hediye
              {activeTab === "gift" ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-pink-500" /> : null}
            </button>
          </div>

          <div className="shrink-0 border-b border-zinc-200 px-6 py-3 text-center text-base font-black text-zinc-700">
            {activeTab === "chat" ? "Sohbet" : "Hediye Katalogu"}
          </div>

          <div ref={messagesContainerRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {activeTab === "gift" ? (
              !state.isLoggedIn ? (
                <div className="rounded-2xl border border-pink-100 bg-white p-5 text-center">
                  <p className="text-sm font-semibold text-zinc-700">Hediye gondermek icin giris yapmalisin.</p>
                  <Link
                    href="/login"
                    className="mt-3 inline-flex rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-400"
                  >
                    Uye girisi
                  </Link>
                </div>
              ) : isGiftCatalogLoading ? (
                <div className="flex h-full min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-pink-100 bg-pink-50/45 p-5 text-center text-sm text-zinc-500">
                  Hediye katalogu yukleniyor...
                </div>
              ) : giftCatalog.length === 0 ? (
                <div className="flex h-full min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-pink-100 bg-pink-50/45 p-5 text-center text-sm text-zinc-500">
                  Henuz aktif hediye yok.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {giftCatalog.map((giftItem) => (
                      <article key={giftItem.id} className="rounded-2xl border border-pink-100 bg-white p-3 shadow-sm">
                        <p className="text-2xl leading-none">{giftItem.emoji}</p>
                        <p className="mt-2 text-sm font-black text-zinc-800">{giftItem.name}</p>
                        <p className="mt-1 text-xs font-semibold text-pink-600">{getGiftMinuteCost(giftItem)} dk</p>
                        <button
                          type="button"
                          onClick={() => {
                            void handleSendGift(giftItem);
                          }}
                          disabled={isGiftSendDisabled}
                          className="mt-2 rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-semibold text-zinc-600 disabled:cursor-not-allowed disabled:text-zinc-400"
                        >
                          {pendingGiftId === giftItem.id ? "Gonderiliyor..." : "Gonder"}
                        </button>
                      </article>
                    ))}
                  </div>

                  <section className="rounded-2xl border border-pink-100 bg-white p-3" data-testid="viewer-gift-panel">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Son hediyeler</p>
                    {giftEvents.length === 0 ? (
                      <p className="mt-2 text-sm text-zinc-500">Bu odada henuz hediye yok.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {giftEvents.map((event) => (
                          <article
                            key={event.id}
                            className="rounded-xl border border-zinc-100 bg-zinc-50/70 px-3 py-2"
                            data-testid="viewer-gift-event"
                          >
                            <p className="text-sm text-zinc-700">
                              <span className="font-semibold text-zinc-900">{event.senderName}</span> {event.giftEmoji} {event.giftName} gonderdi
                            </p>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )
            ) : (
              <div>
                <section className="mb-4 rounded-2xl border border-pink-100 bg-white p-3" data-testid="room-presence-panel">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Odadakiler</p>
                    <span className="rounded-full bg-pink-100 px-2.5 py-1 text-xs font-bold text-pink-700">{presenceUsers.length}</span>
                  </div>
                  {presenceUsers.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-500">Aktif odadaki uye yok.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {presenceUsers.map((presenceUser) => (
                        <article
                          key={presenceUser.id}
                          className="rounded-xl border border-zinc-100 bg-zinc-50/70 px-3 py-2"
                          data-testid="room-presence-user"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-semibold text-zinc-800">{presenceUser.displayName}</p>
                            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-bold text-zinc-700">
                              {getPresenceRoleLabel(presenceUser.role)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">Son gorulme: {formatSeenText(presenceUser.lastSeenAt)}</p>
                        </article>
                      ))}
                    </div>
                  )}
                  {presenceErrorMessage ? (
                    <p className="mt-2 text-xs text-rose-600" data-testid="room-presence-error">
                      Odadakiler listesine katilim dogrulanamadi. ({presenceErrorMessage})
                    </p>
                  ) : null}
                </section>
                {messages.length === 0 ? (
                  <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-pink-100 bg-pink-50/45 p-5 text-center text-sm text-zinc-500">
                    Henuz sohbet mesaji yok.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((message) => (
                      <article key={message.id} className="rounded-2xl border border-pink-100/80 bg-white px-3 py-2.5 shadow-sm">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-pink-600">{message.senderName}</span>
                          <span className="text-zinc-400">
                            {new Date(message.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-700">{message.body}</p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "chat" && !state.isLoggedIn ? (
              <div className="mt-4 rounded-2xl border border-pink-100 bg-white p-4 text-center">
                <p className="text-sm font-semibold text-zinc-700">Sohbete katilmak icin giris yapmalisin.</p>
                <Link
                  href="/login"
                  className="mt-3 inline-flex rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-400"
                >
                  Uye girisi
                </Link>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-zinc-200 p-4">
            <div className="flex items-center gap-2 rounded-full border border-pink-100 bg-zinc-100/90 px-3 py-2.5">
              <input
                value={chatBody}
                maxLength={500}
                onChange={(event) => setChatBody(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSendMessage();
                  }
                }}
                disabled={activeTab !== "chat" || isChatInputDisabled}
                placeholder="Mesajinizi buraya yaziniz..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500"
              />
              <button
                type="button"
                onClick={() => {
                  void handleSendMessage();
                }}
                disabled={activeTab !== "chat" || isChatInputDisabled || Boolean(chatValidationError)}
                className="inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm disabled:opacity-60"
              >
                {isSending ? "..." : "Gonder"}
              </button>
            </div>
            {activeTab === "chat" && !isLive ? (
              <p className="mt-2 text-xs text-zinc-500">Yayin kapaliyken mesaj gonderilemez.</p>
            ) : null}
            {activeTab === "chat" && isRoomMuted ? (
              <p className="mt-2 text-xs text-rose-600">Bu odada mesaj yazmanız geçici olarak kapatılmıştır.</p>
            ) : null}
            {activeTab === "chat" && isRoomKicked ? (
              <p className="mt-2 text-xs text-rose-600">{moderationMessage || "Odadan çıkarıldınız."}</p>
            ) : null}
            {activeTab === "chat" && chatValidationError ? <p className="mt-2 text-xs text-rose-600">{chatValidationError}</p> : null}
            {activeTab === "gift" && state.isLoggedIn ? (
              <p className={`mt-2 text-xs ${giftFeedback ? "text-pink-600" : "text-zinc-500"}`}>
                {giftFeedback || (isLive ? "Bir hediye secip anlik gonderim yapabilirsin." : "Offline odada hediye gonderimi kapali.")}
              </p>
            ) : null}
          </div>
        </aside>
      </section>
      {showInsufficientMinutesModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <section className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" data-testid="insufficient-minutes-modal">
            <h2 className="text-lg font-black text-zinc-900">Süreniz yeterli değil!</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Özel odaya geçmek için süreniz yeterli değil. Dakika satın alıp tekrar deneyiniz.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/member";
                }}
                className="rounded-xl bg-pink-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-pink-400"
              >
                Dakika Satın Al
              </button>
              <button
                type="button"
                onClick={() => setShowInsufficientMinutesModal(false)}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
              >
                Kapat
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
