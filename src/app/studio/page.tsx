"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchRoomPresence, type RoomPresenceUser } from "@/lib/room-presence";
import { fetchRoomMessages, type RoomMessage } from "@/lib/room-messages";
import { fetchRoomGiftEvents, type RoomGiftEvent } from "@/lib/gift-transactions";
import {
  LIVE_ROOMS_BROADCAST_CHANNEL,
  LIVE_ROOMS_CHANGED_EVENT,
  getSupabaseBrowserClient,
} from "@/lib/supabase-browser";

type RoomStatus = "offline" | "live" | "private";

type StudioRoom = {
  id: string;
  title: string;
  status: RoomStatus;
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

export default function StudioPage() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<StudioRoom | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [mutedStart, setMutedStart] = useState(false);
  const [mirrorVideo, setMirrorVideo] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "gift">("chat");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLiveSettings, setShowLiveSettings] = useState(true);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [roomMessages, setRoomMessages] = useState<RoomMessage[]>([]);
  const [chatBody, setChatBody] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatRefreshing, setChatRefreshing] = useState(false);
  const [presenceUsers, setPresenceUsers] = useState<RoomPresenceUser[]>([]);
  const [giftCatalog, setGiftCatalog] = useState<GiftCatalogItem[]>([]);
  const [isGiftCatalogLoading, setIsGiftCatalogLoading] = useState(false);
  const [hasGiftCatalogLoaded, setHasGiftCatalogLoaded] = useState(false);
  const [giftEvents, setGiftEvents] = useState<RoomGiftEvent[]>([]);
  const [giftOverlayText, setGiftOverlayText] = useState<string | null>(null);
  const [chatIdentity, setChatIdentity] = useState<{ userId: string | null; displayName: string | null }>({
    userId: null,
    displayName: null,
  });
  const roomMessagesRef = useRef<HTMLDivElement | null>(null);
  const messageIdsRef = useRef(new Set<string>());
  const refreshDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const giftOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestGiftEventIdRef = useRef<string | null>(null);

  function getGiftMinuteCost(gift: GiftCatalogItem) {
    return gift.coinAmount ?? gift.amount ?? gift.price ?? 0;
  }

  function getSupabase() {
    return getSupabaseBrowserClient();
  }

  useEffect(() => {
    async function loadUser() {
      try {
        const supabase = getSupabase();

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          window.location.href = "/streamer-login";
          return;
        }

        setOwnerId(user.id);
        setChatIdentity({
          userId: user.id,
          displayName: user.email?.split("@")[0] ?? "Yayinci",
        });

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("display_name, role")
          .eq("id", user.id)
          .single();

        if (profileError) {
          throw profileError;
        }

        const finalDisplayName = profile?.display_name ?? user.email?.split("@")[0] ?? "Yayıncı";
        const finalRole = profile?.role ?? "viewer";
        setDisplayName(finalDisplayName);
        setChatIdentity({
          userId: user.id,
          displayName: finalDisplayName,
        });
        setRole(finalRole);

        if (finalRole !== "streamer") {
          return;
        }

        const { data: rooms, error: roomsError } = await supabase
          .from("rooms")
          .select("id, title, status, updated_at")
          .eq("owner_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(5);

        if (roomsError) {
          throw roomsError;
        }

        if (rooms && rooms.length > 0) {
          const liveRoom = rooms.find((room) => room.status === "live");
          const lastRoom = liveRoom ?? rooms[0];
          setActiveRoom({
            id: lastRoom.id,
            title: lastRoom.title,
            status: lastRoom.status as RoomStatus,
          });
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Beklenmeyen hata oluştu.");
        setStatus("error");
      } finally {
        setLoadingUser(false);
      }
    }

    loadUser();
  }, []);

  const scrollMessagesToBottom = useCallback(() => {
    const element = roomMessagesRef.current;
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

      setRoomMessages((previousMessages) => {
        const mergedMap = new Map<string, RoomMessage>();
        for (const roomMessage of previousMessages) {
          mergedMap.set(roomMessage.id, roomMessage);
        }
        for (const roomMessage of incomingMessages) {
          mergedMap.set(roomMessage.id, roomMessage);
        }

        const nextMessages = Array.from(mergedMap.values())
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
          .slice(-50);
        messageIdsRef.current = new Set(nextMessages.map((roomMessage) => roomMessage.id));
        return nextMessages;
      });
    },
    [setRoomMessages],
  );

  const refreshMessages = useCallback(async () => {
    if (!activeRoom?.id || activeRoom.status !== "live" || chatRefreshing) {
      return;
    }

    setChatRefreshing(true);
    try {
      const supabase = getSupabase();
      const fetchedMessages = await fetchRoomMessages(activeRoom.id, 50, supabase);
      setRoomMessages(fetchedMessages);
      messageIdsRef.current = new Set(fetchedMessages.map((roomMessage) => roomMessage.id));
      scrollMessagesToBottom();
    } finally {
      setChatRefreshing(false);
    }
  }, [activeRoom?.id, activeRoom?.status, chatRefreshing, scrollMessagesToBottom]);

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
    if (!activeRoom?.id || activeRoom.status !== "live") {
      setPresenceUsers([]);
      return;
    }

    const supabase = getSupabase();
    const fetchedPresence = await fetchRoomPresence(activeRoom.id, 100, supabase);
    setPresenceUsers(fetchedPresence);
  }, [activeRoom?.id, activeRoom?.status]);

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
    if (!activeRoom?.id || activeRoom.status !== "live") {
      setGiftEvents([]);
      return;
    }

    const supabase = getSupabase();
    const events = await fetchRoomGiftEvents(activeRoom.id, 20, supabase);
    setGiftEvents(events);
  }, [activeRoom?.id, activeRoom?.status]);

  const upsertStreamerPresence = useCallback(async () => {
    if (!activeRoom?.id || activeRoom.status !== "live" || !ownerId) {
      return;
    }

    const supabase = getSupabase();
    await supabase.from("room_presence").upsert(
      {
        room_id: activeRoom.id,
        user_id: ownerId,
        role: "streamer",
        last_seen_at: new Date().toISOString(),
      },
      {
        onConflict: "room_id,user_id",
      },
    );
  }, [activeRoom?.id, activeRoom?.status, ownerId]);

  const removeStreamerPresence = useCallback(async () => {
    if (!activeRoom?.id || !ownerId) {
      return;
    }

    const supabase = getSupabase();
    await supabase.from("room_presence").delete().eq("room_id", activeRoom.id).eq("user_id", ownerId);
  }, [activeRoom?.id, ownerId]);

  async function handleStartLive() {
    if (!ownerId || role !== "streamer") {
      setStatus("error");
      setMessage("Bu alan sadece yayıncılar içindir.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const supabase = getSupabase();
      const finalTitle = displayName?.trim() ? displayName : "Yayıncı";

      const { data: existingRoom, error: findRoomError } = await supabase
        .from("rooms")
        .select("id, title, status")
        .eq("owner_id", ownerId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (findRoomError) {
        throw findRoomError;
      }

      if (existingRoom) {
        const { data: updatedRoom, error: updateRoomError } = await supabase
          .from("rooms")
          .update({
            status: "live",
            title: finalTitle,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingRoom.id)
          .select("id, title, status")
          .single();

        if (updateRoomError || !updatedRoom) {
          throw updateRoomError ?? new Error("Oda güncellenemedi.");
        }

        setActiveRoom({
          id: updatedRoom.id,
          title: updatedRoom.title,
          status: updatedRoom.status as RoomStatus,
        });

        try {
          await supabase.channel(LIVE_ROOMS_BROADCAST_CHANNEL).send({
            type: "broadcast",
            event: LIVE_ROOMS_CHANGED_EVENT,
            payload: {
              action: "started",
              roomId: updatedRoom.id,
              status: "live",
              at: Date.now(),
            },
          });
        } catch {}
      } else {
        const { data: insertedRoom, error: insertRoomError } = await supabase
          .from("rooms")
          .insert({
            owner_id: ownerId,
            title: finalTitle,
            status: "live",
          })
          .select("id, title, status")
          .single();

        if (insertRoomError || !insertedRoom) {
          throw insertRoomError ?? new Error("Oda oluşturulamadı.");
        }

        setActiveRoom({
          id: insertedRoom.id,
          title: insertedRoom.title,
          status: insertedRoom.status as RoomStatus,
        });

        try {
          await supabase.channel(LIVE_ROOMS_BROADCAST_CHANNEL).send({
            type: "broadcast",
            event: LIVE_ROOMS_CHANGED_EVENT,
            payload: {
              action: "started",
              roomId: insertedRoom.id,
              status: "live",
              at: Date.now(),
            },
          });
        } catch {}
      }

      setStatus("success");
      setMessage("Yayın aktif.");
      setShowLiveSettings(false);
    } catch {
      setStatus("error");
      setMessage("Yayın başlatılamadı. Lütfen tekrar deneyin.");
    }
  }

  async function handleStopLive() {
    if (!ownerId || role !== "streamer") {
      setStatus("error");
      setMessage("Bu alan sadece yayıncılar içindir.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const supabase = getSupabase();

      const { data: liveRoom, error: liveRoomError } = await supabase
        .from("rooms")
        .select("id, title, status")
        .eq("owner_id", ownerId)
        .eq("status", "live")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (liveRoomError) {
        throw liveRoomError;
      }

      const roomIdToClose = liveRoom?.id ?? activeRoom?.id;

      if (!roomIdToClose) {
        setStatus("error");
        setMessage("Yayın kapatılamadı. Lütfen tekrar deneyin.");
        return;
      }

      const { data: updatedRoom, error: closeRoomError } = await supabase
        .from("rooms")
        .update({
          status: "offline",
          updated_at: new Date().toISOString(),
        })
        .eq("id", roomIdToClose)
        .select("id, title, status")
        .single();

      if (closeRoomError || !updatedRoom) {
        throw closeRoomError ?? new Error("Oda kapatılamadı.");
      }

      setActiveRoom(null);
      setRoomMessages([]);
      setPresenceUsers([]);
      setGiftEvents([]);

      try {
        await supabase.channel(LIVE_ROOMS_BROADCAST_CHANNEL).send({
          type: "broadcast",
          event: LIVE_ROOMS_CHANGED_EVENT,
          payload: {
            action: "stopped",
            roomId: roomIdToClose,
            status: "offline",
            at: Date.now(),
          },
        });
      } catch {}

      setStatus("success");
      setMessage("Yayın kapatıldı.");
    } catch {
      setStatus("error");
      setMessage("Yayın kapatılamadı. Lütfen tekrar deneyin.");
    }
  }

  async function handleSignOut() {
    try {
      const supabase = getSupabase();
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/streamer-login";
    }
  }

  const isLive = activeRoom?.status === "live";
  const streamTitle = activeRoom?.title || displayName || "Yayıncı";
  const isBusy = loadingUser || status === "loading";
  const isStreamer = role === "streamer";

  useEffect(() => {
    if (isLive) {
      setShowLiveSettings(false);
    } else {
      setShowLiveSettings(true);
      setChatBody("");
    }
  }, [isLive]);

  useEffect(() => {
    if (!activeRoom?.id || activeRoom.status !== "live") {
      setRoomMessages([]);
      return;
    }
    void refreshMessages();
  }, [activeRoom?.id, activeRoom?.status, refreshMessages]);

  useEffect(() => {
    if (!activeRoom?.id || activeRoom.status !== "live") {
      setPresenceUsers([]);
      return;
    }
    void refreshPresence();
  }, [activeRoom?.id, activeRoom?.status, refreshPresence]);

  useEffect(() => {
    if (!activeRoom?.id) {
      return;
    }

    const supabase = getSupabase();
    const channel = supabase
      .channel(`public:room-messages:${activeRoom.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_messages",
          filter: `room_id=eq.${activeRoom.id}`,
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
  }, [activeRoom?.id, scheduleRefreshMessages]);

  useEffect(() => {
    if (!activeRoom?.id) {
      return;
    }

    const supabase = getSupabase();
    const channel = supabase
      .channel(`public:room-presence:${activeRoom.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_presence",
          filter: `room_id=eq.${activeRoom.id}`,
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
  }, [activeRoom?.id, scheduleRefreshPresence]);

  useEffect(() => {
    if (!activeRoom?.id || activeRoom.status !== "live" || !ownerId || role !== "streamer") {
      return;
    }

    void upsertStreamerPresence();
    const heartbeatTimer = setInterval(() => {
      void upsertStreamerPresence();
    }, 25000);
    const handleBeforeUnload = () => {
      void removeStreamerPresence();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(heartbeatTimer);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      void removeStreamerPresence();
    };
  }, [activeRoom?.id, activeRoom?.status, ownerId, removeStreamerPresence, role, upsertStreamerPresence]);

  async function handleSendChatMessage() {
    const roomId = activeRoom?.id;
    const trimmedBody = chatBody.trim();
    if (
      !roomId ||
      activeRoom?.status !== "live" ||
      !chatIdentity.userId ||
      !trimmedBody ||
      trimmedBody.length > 500 ||
      chatSending
    ) {
      return;
    }

    setChatSending(true);
    try {
      const supabase = getSupabase();
      const { data: insertedMessage } = await supabase
        .from("room_messages")
        .insert({
          room_id: roomId,
          sender_id: chatIdentity.userId,
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
            senderName: chatIdentity.displayName || "Yayinci",
            body: insertedMessage.body,
            createdAt: insertedMessage.created_at,
          },
        ]);
        scrollMessagesToBottom();
      }

      setChatBody("");
      scheduleRefreshMessages(120);
    } finally {
      setChatSending(false);
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
    if (!activeRoom?.id || activeRoom.status !== "live") {
      setGiftEvents([]);
      latestGiftEventIdRef.current = null;
      return;
    }

    void refreshGiftEvents();
  }, [activeRoom?.id, activeRoom?.status, refreshGiftEvents]);

  useEffect(() => {
    if (!activeRoom?.id || activeRoom.status !== "live") {
      return;
    }

    const supabase = getSupabase();
    const channel = supabase
      .channel(`public:gift-transactions:studio:${activeRoom.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "gift_transactions",
          filter: `room_id=eq.${activeRoom.id}`,
        },
        () => {
          void refreshGiftEvents();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeRoom?.id, activeRoom?.status, refreshGiftEvents]);

  useEffect(() => {
    if (!giftEvents.length) {
      return;
    }

    const newestGift = giftEvents[giftEvents.length - 1];
    if (latestGiftEventIdRef.current === newestGift.id) {
      return;
    }
    latestGiftEventIdRef.current = newestGift.id;
    setGiftOverlayText(`🎁 Yeni hediye: ${newestGift.giftName}`);
    if (giftOverlayTimerRef.current) {
      clearTimeout(giftOverlayTimerRef.current);
    }
    giftOverlayTimerRef.current = setTimeout(() => {
      setGiftOverlayText(null);
    }, 2600);

    return () => {
      if (giftOverlayTimerRef.current) {
        clearTimeout(giftOverlayTimerRef.current);
        giftOverlayTimerRef.current = null;
      }
    };
  }, [giftEvents]);

  return (
    <main className="min-h-screen bg-[#eef7fb] text-zinc-900 lg:h-[100dvh] lg:overflow-hidden">
      <header className="relative z-[100] h-16 border-b border-pink-100/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1800px] items-center justify-between px-4 sm:px-6">
          <div className="relative z-[110] flex items-center gap-3 overflow-visible">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-pink-200 bg-white text-lg text-pink-500 transition hover:bg-pink-50"
              aria-label="Menüyü aç"
            >
              ☰
            </button>
            {menuOpen ? (
              <div className="absolute left-0 top-full mt-2 z-[9999] w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-pink-100 bg-white p-2 text-sm shadow-xl">
                {[
                  "Özel Oda Kazançlarım",
                  "Genel Oda Kazançlarım",
                  "Profil Güncelle",
                  "Engellediklerim",
                  "Şifre Değiştir",
                  "Duyurular",
                ].map((menuItem) => (
                  <button
                    key={menuItem}
                    type="button"
                    className="block w-full rounded-xl px-3 py-2 text-left text-zinc-700 transition hover:bg-pink-50"
                  >
                    {menuItem}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="mt-1 block w-full rounded-xl bg-rose-500/10 px-3 py-2 text-left font-semibold text-rose-600 transition hover:bg-rose-500/20"
                >
                  Çıkış Yap
                </button>
              </div>
            ) : null}

            <Link href="/" className="text-lg font-black tracking-tight text-zinc-900 sm:text-xl">
              Poncik<span className="text-pink-400">Live</span>
            </Link>
            <span className="rounded-full bg-yellow-300 px-3 py-1 text-xs font-black text-black">Genel</span>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                isLive ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {isLive ? "Yayın aktif" : "Hazır"}
            </span>
            <Link
              href="/rooms"
              className="rounded-full border border-pink-100 bg-white px-4 py-2 text-xs font-semibold transition hover:bg-pink-50"
            >
              Online yayıncılar
            </Link>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-zinc-900 shadow-sm">0 dk</span>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-pink-500 font-black text-white"
            >
              +
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-64px)] max-w-[1800px] grid-cols-1 gap-3 p-3 lg:h-[calc(100dvh-64px)] lg:min-h-0 lg:grid-cols-[minmax(0,1.45fr)_minmax(420px,1fr)] lg:overflow-hidden lg:gap-3 lg:p-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(440px,1fr)]">
        <div className="flex min-h-0 flex-col rounded-3xl border border-white/70 bg-white/60 p-3 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm lg:overflow-hidden">
          {!loadingUser && !isStreamer ? (
            <div className="flex flex-1 items-center justify-center p-3">
              <div className="w-full max-w-xl rounded-3xl border border-pink-100 bg-white p-8 text-center shadow-lg">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pink-300">PONCIK LIVE</p>
                <h1 className="mt-3 text-2xl font-black text-zinc-900">Bu alan sadece yayıncılar içindir.</h1>
                <p className="mt-3 text-sm text-zinc-600">Yayıncı hesabı ile giriş yapmalısın.</p>
                <Link
                  href="/streamer-login"
                  className="mt-6 inline-flex rounded-full bg-pink-500 px-6 py-3 text-sm font-black text-white transition hover:bg-pink-400"
                >
                  Yayıncı girişine dön
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 flex h-10 shrink-0 items-center gap-2 rounded-2xl border border-pink-100 bg-white px-3">
                <span className="rounded-full bg-yellow-200 px-3 py-1 text-[11px] font-black text-zinc-800">Genel</span>
                <span className="rounded-full bg-purple-100 px-3 py-1 text-[11px] font-bold text-purple-700">
                  Yayıncı masası
                </span>
                <span className="rounded-full bg-pink-100 px-3 py-1 text-[11px] font-semibold text-pink-600">Poncik tone</span>
                {isLive ? (
                  <span className="rounded-full bg-rose-100 px-3 py-1 text-[11px] font-bold text-rose-700">CANLI</span>
                ) : null}
              </div>

              <div
                className={`relative flex min-h-0 items-center justify-center overflow-hidden rounded-3xl border border-zinc-800/70 bg-zinc-950 p-2.5 sm:p-4 ${
                  isLive ? "flex-[1.2]" : "flex-[0.95]"
                }`}
              >
                <div className="w-full max-w-[1100px]">
                  <div
                    className={`relative aspect-video w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-950 via-black to-pink-950/40 p-4 ${
                      mirrorVideo ? "scale-x-[-1]" : ""
                    }`}
                  >
                    <div className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover" />
                    <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                          isLive ? "bg-rose-500/90 text-white" : "bg-white/15 text-zinc-200"
                        }`}
                      >
                        {isLive ? "Canlı yayın" : "Kamera önizleme"}
                      </span>
                      {isLive ? (
                        <span className="rounded-full bg-zinc-100/90 px-3 py-1 text-[11px] font-semibold text-zinc-800">
                          {streamTitle}
                        </span>
                      ) : null}
                    </div>
                    {giftOverlayText ? (
                      <div className="absolute bottom-3 left-3 right-3 z-20 rounded-xl border border-pink-200/70 bg-black/60 px-3 py-2 text-xs font-semibold text-pink-100 sm:left-auto sm:w-[360px]">
                        {giftOverlayText}
                      </div>
                    ) : null}

                    {!isLive ? (
                      <div className="flex h-full items-center justify-center">
                        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-900/70 p-6 text-center shadow-2xl">
                          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-pink-300">PONCIK LIVE</p>
                          <h1 className="mt-3 text-2xl font-black text-white">Yayıncı Paneli</h1>
                          <p className="mt-3 text-sm leading-6 text-zinc-300">
                            Yayına çıkmadan önce kamera ve mikrofon ayarlarını yapılandır. Hazır olduğunda
                            tek tuşla canlı yayına başla.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-center">
                        <div className="absolute inset-0 rounded-3xl bg-[radial-gradient(circle_at_50%_30%,rgba(255,44,122,0.2),transparent_60%)]" />
                        <div className="relative w-full max-w-2xl">
                          <span className="inline-flex rounded-full bg-rose-500 px-5 py-1.5 text-sm font-black tracking-wide text-white shadow-lg">
                            CANLI
                          </span>
                          <h2 className="mt-4 text-2xl font-black text-white sm:text-3xl">{streamTitle}</h2>
                          <p className="mt-2 text-sm text-zinc-300">İzleyiciler seni online yayınlarda görebilir.</p>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              </div>

              {isLive ? (
                <div className="my-2 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-rose-100 bg-white px-3 py-2 shadow-sm">
                  <button
                    type="button"
                    onClick={handleStopLive}
                    disabled={isBusy || !isStreamer}
                    className="rounded-xl bg-rose-500 px-4 py-2 text-xs font-black text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {status === "loading" ? "Yayın kapatılıyor..." : "YAYINI BİTİR"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLiveSettings((prev) => !prev)}
                    className="rounded-xl border border-pink-200 bg-pink-50 px-4 py-2 text-xs font-bold text-pink-700 transition hover:bg-pink-100"
                  >
                    {showLiveSettings ? "Kamera Ayarlarını Gizle" : "Kamera Ayarlarını Göster"}
                  </button>
                  {message ? (
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        status === "success" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {message}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {!isLive ? (
                <div className="my-2 shrink-0 rounded-3xl border border-pink-100 bg-white p-3 shadow-sm lg:p-4">
                  <div className="mx-auto max-w-5xl">
                    <h2 className="text-base font-black text-zinc-900">Kamera Ayarları</h2>
                    <div className="mt-3 grid gap-2 lg:grid-cols-2">
                      <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                        Kamera
                        <select className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none transition focus:border-pink-400">
                          <option>Kamera seçiniz</option>
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                        Mikrofon
                        <select className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none transition focus:border-pink-400">
                          <option>Mikrofonsuz devam et</option>
                        </select>
                      </label>
                    </div>

                    <div className="mt-2 grid gap-2 text-sm text-zinc-700">
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={mutedStart}
                          onChange={(event) => setMutedStart(event.target.checked)}
                          className="h-4 w-4 accent-pink-500"
                        />
                        Yayını ses kapalı olarak başlat
                      </label>
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={mirrorVideo}
                          onChange={(event) => setMirrorVideo(event.target.checked)}
                          className="h-4 w-4 accent-pink-500"
                        />
                        Video aynalama aktif/pasif
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={handleStartLive}
                      disabled={isBusy || !isStreamer}
                      className="mt-3 w-full rounded-2xl bg-emerald-400 px-5 py-2.5 text-sm font-black text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      {status === "loading" ? "Yayın başlatılıyor..." : "YAYINA BAŞLA"}
                    </button>

                    {message ? (
                      <div
                        className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                          status === "success"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-rose-300 bg-rose-50 text-rose-700"
                        }`}
                      >
                        {message}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {isLive && showLiveSettings ? (
                <div className="my-2 shrink-0 rounded-2xl border border-pink-100 bg-white/95 p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-black text-zinc-900">Kamera Ayarları</h2>
                    <button
                      type="button"
                      onClick={() => setShowLiveSettings(false)}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-bold text-zinc-600 transition hover:bg-zinc-100"
                    >
                      Ayarları Gizle
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs font-semibold text-zinc-700">
                      Kamera
                      <select className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-pink-400">
                        <option>Kamera seçiniz</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-zinc-700">
                      Mikrofon
                      <select className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-pink-400">
                        <option>Mikrofonsuz devam et</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-zinc-700 sm:grid-cols-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={mutedStart}
                        onChange={(event) => setMutedStart(event.target.checked)}
                        className="h-4 w-4 accent-pink-500"
                      />
                      Yayını ses kapalı başlat
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={mirrorVideo}
                        onChange={(event) => setMirrorVideo(event.target.checked)}
                        className="h-4 w-4 accent-pink-500"
                      />
                      Video aynalama aktif/pasif
                    </label>
                  </div>
                </div>
              ) : null}

              <div className="grid h-14 shrink-0 gap-2 sm:grid-cols-3">
                <button className="rounded-2xl bg-yellow-300 px-4 py-2 text-sm font-black text-zinc-800 transition hover:brightness-95">
                  CANLI DESTEK
                </button>
                <button className="rounded-2xl bg-orange-300 px-4 py-2 text-sm font-black text-zinc-800 transition hover:brightness-95">
                  HEDİYE LİSTESİ
                </button>
                <button className="rounded-2xl bg-pink-400 px-4 py-2 text-sm font-black text-white transition hover:bg-pink-300">
                  MESAJLARIM
                </button>
              </div>
            </>
          )}
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
            {activeTab === "chat" ? "Odadakiler" : "Hediye Katalogu"}
          </div>

          <div ref={roomMessagesRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {activeTab === "gift" ? (
              isGiftCatalogLoading ? (
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
                        <p className="mt-2 text-[11px] text-zinc-500">Yayinda gelen hediyeler burada gorunur.</p>
                      </article>
                    ))}
                  </div>
                  <section className="rounded-2xl border border-pink-100 bg-white p-3">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Son hediyeler</p>
                    {giftEvents.length === 0 ? (
                      <p className="mt-2 text-sm text-zinc-500">Bu yayinda henuz hediye yok.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {giftEvents.map((event) => (
                          <article key={event.id} className="rounded-xl border border-zinc-100 bg-zinc-50/70 px-3 py-2">
                            <p className="text-sm text-zinc-700">
                              <span className="font-semibold text-zinc-900">{event.senderName}</span> {event.giftEmoji} {event.giftName} gonderdi ·{" "}
                              {event.amount} dk
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
                <section className="mb-4 rounded-2xl border border-pink-100 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Odadakiler</p>
                    <span className="rounded-full bg-pink-100 px-2.5 py-1 text-xs font-bold text-pink-700">{presenceUsers.length}</span>
                  </div>
                  {presenceUsers.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-500">Aktif odada izleyici yok.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {presenceUsers.map((presenceUser) => (
                        <article key={presenceUser.id} className="rounded-xl border border-zinc-100 bg-zinc-50/70 px-3 py-2">
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
                </section>
                {roomMessages.length === 0 ? (
                  <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-pink-100 bg-pink-50/45 p-5 text-center text-sm text-zinc-500">
                    Henuz sohbet mesaji yok.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {roomMessages.map((roomMessage) => (
                      <article
                        key={roomMessage.id}
                        className="rounded-2xl border border-pink-100/80 bg-white px-3 py-2.5 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-pink-600">{roomMessage.senderName}</span>
                          <span className="text-zinc-400">
                            {new Date(roomMessage.createdAt).toLocaleTimeString("tr-TR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-700">{roomMessage.body}</p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
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
                    void handleSendChatMessage();
                  }
                }}
                disabled={activeTab !== "chat" || !isLive || chatSending}
                placeholder="Mesajınızı buraya yazınız..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500"
              />
              <button
                type="button"
                onClick={() => {
                  void handleSendChatMessage();
                }}
                disabled={activeTab !== "chat" || !isLive || chatSending || !chatBody.trim() || chatBody.trim().length > 500}
                className="inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm disabled:opacity-60"
              >
                {chatSending ? "..." : "Gonder"}
              </button>
            </div>
            {!isLive && activeTab === "chat" ? (
              <p className="mt-2 text-xs text-zinc-500">Yayin kapaliyken mesaj gonderilemez.</p>
            ) : null}
            {activeTab === "chat" && chatBody.trim().length > 500 ? (
              <p className="mt-2 text-xs text-rose-600">Mesaj en fazla 500 karakter olabilir.</p>
            ) : null}
            {activeTab === "gift" ? (
              <p className="mt-2 text-xs text-zinc-500">
                {isLive ? "Yayinda gelen hediyeler burada gorunur." : "Yayin kapaliyken hediye etkinligi dinlenmez."}
              </p>
            ) : null}
          </div>
        </aside>
      </section>
    </main>
  );
}
