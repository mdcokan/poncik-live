"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LiveRoom } from "@/lib/live-rooms";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useRealtimeLiveRooms } from "@/hooks/use-realtime-live-rooms";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import { DirectMessagesPanel } from "@/components/dm/DirectMessagesPanel";

type MemberPageClientProps = {
  initialRooms: LiveRoom[];
  initialHasError: boolean;
};

type PackageType = "minute" | "duration";

type PurchasePackage = {
  id: string;
  type: PackageType;
  name: string;
  amount: number;
  price_try: number;
  sort_order: number;
};

type MinuteOrderStatus = "pending" | "approved" | "rejected";

type MinutePurchaseOrder = {
  id: string;
  packageId: string;
  packageName: string;
  packageType: PackageType;
  amount: number;
  priceTry: number;
  status: MinuteOrderStatus;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
};

type ViewerPrivateRequest = {
  id: string;
  roomId: string;
  streamerId: string;
  streamerName: string;
  viewerId: string;
  viewerName: string;
  status: string;
  createdAt: string;
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
};

type BusyStreamer = {
  sessionId: string;
  streamerId: string;
  roomId: string;
  streamerName: string;
};

type ActiveSection =
  | "home"
  | "packages"
  | "messages"
  | "chatHistory"
  | "following"
  | "account"
  | "profile"
  | "notifications"
  | "support"
  | "privateRequests";

type MemberProfile = {
  displayName: string;
  role: string;
  isBanned: boolean;
};

type WalletAdjustmentRow = {
  id: string;
  amount: number;
  reason: string | null;
  created_at: string;
};

type ChatHistoryEntry = {
  sessionId: string;
  roomId: string;
  streamerId: string;
  streamerName: string;
  status: string;
  startedAt: string;
};

const SIDEBAR_ITEMS: Array<{ section: ActiveSection; label: string }> = [
  { section: "home", label: "Sohbet Et" },
  { section: "packages", label: "Süre Satın Al" },
  { section: "messages", label: "Mesajlarım" },
  { section: "chatHistory", label: "Sohbet Ettiklerim" },
  { section: "following", label: "Takip Ettiklerim" },
  { section: "account", label: "Hesap Dökümü" },
  { section: "profile", label: "Profilim" },
  { section: "notifications", label: "Bildirimler" },
  { section: "support", label: "Canlı Destek" },
];

function packageTypeLabel(type: PackageType) {
  return type === "minute" ? "Dakika" : "Süre";
}

function minuteOrderStatusLabel(status: MinuteOrderStatus) {
  if (status === "approved") {
    return "Onaylandı";
  }
  if (status === "rejected") {
    return "Reddedildi";
  }
  return "Beklemede";
}

function privateRequestStatusLabel(status: string) {
  if (status === "accepted") {
    return "Kabul edildi";
  }
  if (status === "rejected") {
    return "Reddedildi";
  }
  if (status === "cancelled") {
    return "İptal edildi";
  }
  if (status === "expired") {
    return "Süresi doldu";
  }
  return "Beklemede";
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M7 10V8a5 5 0 0 1 10 0v2M6 10h12v10H6V10Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MemberPageClient({ initialRooms, initialHasError }: MemberPageClientProps) {
  const safeInitialRooms = initialRooms.filter((room) => room.status === "live");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeSection, setActiveSection] = useState<ActiveSection>("home");
  const [isPackagesModalOpen, setIsPackagesModalOpen] = useState(false);
  const [isPackagesLoading, setIsPackagesLoading] = useState(false);
  const [packagesError, setPackagesError] = useState("");
  const [purchaseInfoMessage, setPurchaseInfoMessage] = useState("");
  const [isSubmittingPackageId, setIsSubmittingPackageId] = useState<string | null>(null);
  const [myOrders, setMyOrders] = useState<MinutePurchaseOrder[]>([]);
  const [myPrivateRequests, setMyPrivateRequests] = useState<ViewerPrivateRequest[]>([]);
  const [isPrivateRequestsLoading, setIsPrivateRequestsLoading] = useState(false);
  const [activePrivateSession, setActivePrivateSession] = useState<PrivateSessionSummary | null>(null);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
  const [packages, setPackages] = useState<PurchasePackage[]>([]);
  const [hasLoadedPackages, setHasLoadedPackages] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [busyStreamers, setBusyStreamers] = useState<BusyStreamer[]>([]);
  const [busyLoading, setBusyLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>([]);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false);
  const [walletAdjustments, setWalletAdjustments] = useState<WalletAdjustmentRow[]>([]);
  const [walletAdjustmentsLoading, setWalletAdjustmentsLoading] = useState(false);
  const [memberProfile, setMemberProfile] = useState<MemberProfile | null>(null);
  const [memberEmail, setMemberEmail] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const walletBalance = useWalletBalance({ initialBalance: 0 });
  const { rooms: liveRooms, warning: liveRoomsWarning } = useRealtimeLiveRooms({
    initialRooms: safeInitialRooms,
    initialHasError,
    limit: 24,
    channelKey: "member",
  });
  const safeLiveRooms = liveRooms.filter((room) => room.status === "live");

  const sortedPrivateRequests = useMemo(
    () =>
      [...myPrivateRequests].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [myPrivateRequests],
  );
  const latestPrivateRequest = sortedPrivateRequests[0];

  const busyOwnerIds = useMemo(() => new Set(busyStreamers.map((b) => b.streamerId)), [busyStreamers]);
  const freeLiveRooms = useMemo(
    () => safeLiveRooms.filter((room) => !busyOwnerIds.has(room.ownerId)),
    [safeLiveRooms, busyOwnerIds],
  );
  const featuredStreamers = freeLiveRooms.slice(0, 5);

  useEffect(() => {
    async function checkUser() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = "/login";
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("is_banned")
          .eq("id", user.id)
          .maybeSingle<{ is_banned: boolean }>();
        setIsBanned(profile?.is_banned === true);
      } catch {
        setErrorMessage("Hesap kontrolü şu an yapılamadı.");
      }
    }

    checkUser();
  }, []);

  useEffect(() => {
    void loadMyPrivateRequests();
    void loadActivePrivateSession();
  }, []);

  useEffect(() => {
    void loadBusyStreamers();
  }, []);

  useEffect(() => {
    if (activeSection !== "chatHistory") {
      return;
    }
    void loadChatHistory();
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== "account" && activeSection !== "privateRequests") {
      return;
    }
    void loadMyOrders();
    void loadWalletAdjustments();
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== "profile") {
      return;
    }
    void loadMemberProfileSection();
  }, [activeSection]);

  async function handleLogout() {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/login";
    }
  }

  async function fetchAccessToken() {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  const loadBusyStreamers = useCallback(async () => {
    setBusyLoading(true);
    try {
      const accessToken = await fetchAccessToken();
      if (!accessToken) {
        setBusyStreamers([]);
        return;
      }
      const response = await fetch("/api/member/busy-streamers", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        streamers?: BusyStreamer[];
      };
      if (!response.ok || !payload.ok) {
        setBusyStreamers([]);
        return;
      }
      setBusyStreamers(payload.streamers ?? []);
    } catch {
      setBusyStreamers([]);
    } finally {
      setBusyLoading(false);
    }
  }, []);

  async function loadChatHistory() {
    setChatHistoryLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setChatHistory([]);
        return;
      }
      const { data: rows, error } = await supabase
        .from("private_room_sessions")
        .select("id, room_id, streamer_id, status, started_at")
        .eq("viewer_id", user.id)
        .order("started_at", { ascending: false })
        .limit(10);
      if (error || !rows?.length) {
        setChatHistory([]);
        return;
      }
      const streamerIds = Array.from(new Set(rows.map((r) => r.streamer_id as string)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", streamerIds);
      const names = new Map(
        (profiles ?? []).map((p: { id: string; display_name: string | null }) => [
          p.id,
          p.display_name?.trim() || "Yayıncı",
        ]),
      );
      setChatHistory(
        rows.map((r) => ({
          sessionId: r.id as string,
          roomId: r.room_id as string,
          streamerId: r.streamer_id as string,
          streamerName: names.get(r.streamer_id as string) ?? "Yayıncı",
          status: r.status as string,
          startedAt: r.started_at as string,
        })),
      );
    } catch {
      setChatHistory([]);
    } finally {
      setChatHistoryLoading(false);
    }
  }

  async function loadWalletAdjustments() {
    setWalletAdjustmentsLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setWalletAdjustments([]);
        return;
      }
      const { data, error } = await supabase
        .from("wallet_adjustments")
        .select("id, amount, reason, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) {
        setWalletAdjustments([]);
        return;
      }
      setWalletAdjustments((data ?? []) as WalletAdjustmentRow[]);
    } catch {
      setWalletAdjustments([]);
    } finally {
      setWalletAdjustmentsLoading(false);
    }
  }

  async function loadMemberProfileSection() {
    setProfileLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setMemberProfile(null);
        setMemberEmail(null);
        return;
      }
      setMemberEmail(user.email ?? null);
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, role, is_banned")
        .eq("id", user.id)
        .maybeSingle<{ display_name: string | null; role: string; is_banned: boolean }>();
      if (!profile) {
        setMemberProfile(null);
        return;
      }
      setMemberProfile({
        displayName: profile.display_name?.trim() || "İsimsiz kullanıcı",
        role: profile.role,
        isBanned: profile.is_banned === true,
      });
    } catch {
      setMemberProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }

  async function loadPackages() {
    setIsPackagesLoading(true);
    setPackagesError("");
    setPurchaseInfoMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setPackages([]);
        setPackagesError("Paketler şu an yüklenemedi.");
        return;
      }

      const response = await fetch("/api/packages", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });

      const payload = (await response.json()) as { ok?: boolean; message?: string; packages?: PurchasePackage[] };
      if (!response.ok || !payload.ok) {
        setPackages([]);
        setPackagesError("Paketler şu an yüklenemedi.");
        return;
      }

      setPackages(payload.packages ?? []);
      setHasLoadedPackages(true);
    } catch {
      setPackages([]);
      setPackagesError("Paketler şu an yüklenemedi.");
    } finally {
      setIsPackagesLoading(false);
    }
  }

  async function loadMyOrders() {
    setIsOrdersLoading(true);
    try {
      const accessToken = await fetchAccessToken();
      if (!accessToken) {
        setMyOrders([]);
        return;
      }

      const response = await fetch("/api/packages/order", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });
      const payload = (await response.json()) as { ok?: boolean; orders?: MinutePurchaseOrder[] };
      if (!response.ok || !payload.ok) {
        setMyOrders([]);
        return;
      }
      setMyOrders((payload.orders ?? []).slice(0, 10));
    } catch {
      setMyOrders([]);
    } finally {
      setIsOrdersLoading(false);
    }
  }

  async function loadMyPrivateRequests() {
    setIsPrivateRequestsLoading(true);
    try {
      const accessToken = await fetchAccessToken();
      if (!accessToken) {
        setMyPrivateRequests([]);
        return;
      }

      const response = await fetch("/api/private-requests?scope=viewer", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; requests?: ViewerPrivateRequest[] };
      if (!response.ok || !payload.ok) {
        setMyPrivateRequests([]);
        return;
      }

      setMyPrivateRequests((payload.requests ?? []).slice(0, 50));
    } catch {
      setMyPrivateRequests([]);
    } finally {
      setIsPrivateRequestsLoading(false);
    }
  }

  async function loadActivePrivateSession() {
    try {
      const accessToken = await fetchAccessToken();
      if (!accessToken) {
        setActivePrivateSession(null);
        return;
      }
      const response = await fetch("/api/private-sessions/active", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; session?: PrivateSessionSummary | null };
      if (!response.ok || !payload.ok) {
        setActivePrivateSession(null);
        return;
      }
      setActivePrivateSession(payload.session ?? null);
    } catch {
      setActivePrivateSession(null);
    }
  }

  async function handleCreateOrder(item: PurchasePackage) {
    if (isBanned) {
      setPurchaseInfoMessage("Hesabınız kısıtlanmıştır.");
      return;
    }

    try {
      setIsSubmittingPackageId(item.id);
      setPurchaseInfoMessage("");
      const accessToken = await fetchAccessToken();
      if (!accessToken) {
        setPurchaseInfoMessage("Giriş yapmalısın.");
        return;
      }

      const response = await fetch("/api/packages/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          packageId: item.id,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) {
        setPurchaseInfoMessage(payload.message ?? "Satın alma talebi oluşturulamadı.");
        return;
      }

      setPurchaseInfoMessage("Satın alma talebin alındı. Admin onayından sonra dakika bakiyene eklenecek.");
      await loadMyOrders();
    } catch {
      setPurchaseInfoMessage("Satın alma talebi oluşturulamadı.");
    } finally {
      setIsSubmittingPackageId(null);
    }
  }

  async function handleOpenPackages() {
    setIsPackagesModalOpen(true);
    if (hasLoadedPackages) {
      await loadMyOrders();
      return;
    }
    await Promise.all([loadPackages(), loadMyOrders()]);
  }

  function openPackagesFlow() {
    setActiveSection("packages");
    void handleOpenPackages();
  }

  function sidebarNavClass(active: boolean) {
    return [
      "block w-full rounded-2xl px-4 py-2.5 text-left text-sm font-medium transition",
      active ? "bg-white text-indigo-800 shadow-sm" : "bg-white/10 text-white hover:bg-white/20",
    ].join(" ");
  }

  function renderPackagesModal() {
    if (!isPackagesModalOpen) {
      return null;
    }
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-indigo-950/40 p-3 sm:items-center sm:p-5">
        <section
          data-testid="member-section-packages"
          className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-xl"
        >
          <header className="flex items-start justify-between border-b border-cyan-100 px-4 py-4 sm:px-6">
            <div>
              <h2 className="text-lg font-semibold text-indigo-800">Dakika Paketleri</h2>
              <p className="mt-1 text-sm text-slate-600">Satın almak istediğiniz dakika paketini seçin.</p>
            </div>
            <button
              type="button"
              data-testid="member-packages-close"
              onClick={() => setIsPackagesModalOpen(false)}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
            >
              Kapat
            </button>
          </header>

          <div className="max-h-[70vh] overflow-y-auto px-4 py-4 sm:px-6">
            {isPackagesLoading ? <p className="text-sm text-slate-500">Yükleniyor...</p> : null}
            {!isPackagesLoading && packagesError ? (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {packagesError}
              </p>
            ) : null}

            {!isPackagesLoading && !packagesError && packages.length === 0 ? (
              <p className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm text-slate-600">
                Şu an aktif dakika paketi bulunmuyor.
              </p>
            ) : null}

            {!isPackagesLoading && !packagesError && packages.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {packages.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold text-indigo-800">{item.name}</h3>
                      <span className="inline-flex rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                        {packageTypeLabel(item.type)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">Miktar: {item.amount} dk</p>
                    <p className="mt-1 text-sm text-slate-700">Fiyat: {item.price_try} TL</p>
                    <button
                      type="button"
                      disabled={isSubmittingPackageId === item.id || isBanned}
                      className="mt-4 rounded-xl bg-pink-400 px-3 py-2 text-xs font-semibold text-white transition hover:bg-pink-300 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-pink-400"
                      onClick={() => void handleCreateOrder(item)}
                    >
                      {isSubmittingPackageId === item.id ? "Gönderiliyor..." : "Satın Al"}
                    </button>
                  </article>
                ))}
              </div>
            ) : null}

            {purchaseInfoMessage ? (
              <p
                data-testid="member-packages-purchase-message"
                className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700"
              >
                {purchaseInfoMessage}
              </p>
            ) : null}

            <section className="mt-5 rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
              <h3 className="text-sm font-semibold text-indigo-800">Son taleplerim</h3>
              {isOrdersLoading ? <p className="mt-2 text-sm text-slate-500">Yükleniyor...</p> : null}
              {!isOrdersLoading && myOrders.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">Henüz talep oluşturmadın.</p>
              ) : null}
              {!isOrdersLoading && myOrders.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {myOrders.map((order) => (
                    <article key={order.id} className="rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm">
                      <p className="font-semibold text-slate-800">{order.packageName}</p>
                      <p className="text-slate-600">{order.amount} dk</p>
                      <p data-testid={`member-order-status-${order.id}`} className="text-slate-600">
                        {minuteOrderStatusLabel(order.status)}
                      </p>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        </section>
      </div>
    );
  }

  function renderLiveCard(room: LiveRoom) {
    return (
      <Link
        key={room.id}
        data-testid="member-live-card"
        href={`/rooms/${room.id}`}
        className={`flex min-h-[200px] flex-col rounded-2xl border border-cyan-100/80 bg-gradient-to-b from-cyan-50 to-white p-4 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          isBanned ? "pointer-events-none opacity-60" : "hover:border-indigo-200 hover:shadow-md"
        }`}
      >
        <div className="h-24 w-full rounded-xl bg-gradient-to-br from-indigo-200 via-pink-200 to-violet-200" />
        <div className="mt-3 h-12 w-12 shrink-0 rounded-full bg-gradient-to-br from-pink-300 to-violet-400 ring-2 ring-white" />
        <p className="mt-3 line-clamp-1 text-base font-semibold text-slate-800">{room.streamerName}</p>
        <p className="mt-1 text-xs font-medium text-emerald-600">Canlı</p>
        <span className="mt-auto inline-flex w-fit rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white">
          Yayına gir
        </span>
      </Link>
    );
  }

  function renderSectionGrid(title: string, children: ReactNode) {
    return (
      <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-indigo-800">{title}</h2>
        {children}
      </section>
    );
  }

  function renderMainBody() {
    if (activeSection === "home") {
      return (
        <div data-testid="member-section-home" className="space-y-4">
          {renderSectionGrid(
            "Günün Popüler Yayıncıları",
            featuredStreamers.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {featuredStreamers.map((room) => renderLiveCard(room))}
              </div>
            ) : (
              <p className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-5 text-sm text-slate-600">
                Şu an canlı yayın yok.
              </p>
            ),
          )}

          {renderSectionGrid(
            "Online Yayıncılar",
            freeLiveRooms.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {freeLiveRooms.map((room) => renderLiveCard(room))}
              </div>
            ) : (
              <p className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-5 text-sm text-slate-600">
                Şu an canlı yayın yok.
              </p>
            ),
          )}

          {renderSectionGrid(
            "Meşgul Yayıncılar",
            busyLoading ? (
              <p className="mt-4 text-sm text-slate-500">Yükleniyor...</p>
            ) : busyStreamers.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {busyStreamers.map((b) => (
                  <div
                    key={b.sessionId}
                    data-testid="member-busy-card"
                    className="flex min-h-[200px] cursor-not-allowed flex-col rounded-2xl border border-slate-200 bg-slate-50 p-4 opacity-80"
                    aria-disabled
                  >
                    <div className="h-24 w-full rounded-xl bg-gradient-to-br from-slate-200 to-slate-300" />
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-12 w-12 shrink-0 rounded-full bg-slate-300 ring-2 ring-white" />
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                        Özel odada
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-1 text-base font-semibold text-slate-600">{b.streamerName}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                      <LockIcon className="text-slate-500" />
                      Meşgul
                    </p>
                    <p className="mt-auto pt-3 text-xs text-slate-500">Şu an özel odada</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                Şu an meşgul yayıncı yok.
              </p>
            ),
          )}

          <section className="rounded-3xl border border-violet-100 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-indigo-800">Özel Oda Taleplerim</h2>
            <div data-testid="member-private-requests-summary" className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
              {isPrivateRequestsLoading ? (
                <p className="text-sm text-slate-600">Yükleniyor...</p>
              ) : latestPrivateRequest ? (
                <p className="text-sm text-slate-700">
                  <span className="font-semibold text-slate-800">Son özel oda talebi: </span>
                  {privateRequestStatusLabel(latestPrivateRequest.status)}
                </p>
              ) : (
                <p className="text-sm text-slate-600">Henüz özel oda talebin yok.</p>
              )}
              <button
                type="button"
                onClick={() => setActiveSection("privateRequests")}
                className="mt-3 rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
              >
                Tümünü gör
              </button>
            </div>
          </section>

          {liveRoomsWarning ? <p className="text-xs text-slate-500">{liveRoomsWarning}</p> : null}
        </div>
      );
    }

    if (activeSection === "packages") {
      return (
        <div data-testid="member-section-packages-fallback" className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-indigo-800">Süre Satın Al</h2>
          <p className="mt-2 text-sm text-slate-600">
            Dakika paketleri penceresi açıldı. Kapattıysan aşağıdaki düğmeyle yeniden açabilirsin.
          </p>
          <button
            type="button"
            onClick={() => void handleOpenPackages()}
            className="mt-4 rounded-full bg-pink-400 px-5 py-2 text-sm font-semibold text-white hover:bg-pink-300"
          >
            Dakika paketlerini aç
          </button>
        </div>
      );
    }

    if (activeSection === "messages") {
      return (
        <div data-testid="member-section-messages" className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-indigo-800">Mesajlarım</h2>
          <p className="mt-2 text-sm text-slate-600">Özel mesajlarını buradan yönetebilirsin.</p>
          <div className="mt-6">
            <DirectMessagesPanel currentUserRole="viewer" banned={isBanned} />
          </div>
        </div>
      );
    }

    if (activeSection === "chatHistory") {
      return (
        <div data-testid="member-section-chat-history" className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-indigo-800">Sohbet Ettiklerim</h2>
          {chatHistoryLoading ? (
            <p className="mt-4 text-sm text-slate-500">Yükleniyor...</p>
          ) : chatHistory.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">Henüz kayıtlı özel oda oturumun yok.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {chatHistory.map((entry) => (
                <li key={entry.sessionId} className="rounded-xl border border-cyan-100 bg-cyan-50/40 px-4 py-3 text-sm">
                  <p className="font-semibold text-slate-800">{entry.streamerName}</p>
                  <p className="text-slate-600">Durum: {entry.status}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(entry.startedAt).toLocaleString("tr-TR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    if (activeSection === "following") {
      return (
        <div data-testid="member-section-following" className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-indigo-800">Takip Ettiklerim</h2>
          <p className="mt-4 text-sm text-slate-600">Takip sistemi bir sonraki fazda bağlanacak.</p>
        </div>
      );
    }

    if (activeSection === "notifications") {
      return (
        <div data-testid="member-section-notifications" className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-indigo-800">Bildirimler</h2>
          <p className="mt-4 text-sm text-slate-600">Henüz bildirimin yok.</p>
        </div>
      );
    }

    if (activeSection === "support") {
      return (
        <div data-testid="member-section-support" className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-indigo-800">Canlı Destek</h2>
          <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5 text-sm text-slate-700">
            Destek talebin için admin ekibiyle iletişime geçebilirsin.
          </div>
        </div>
      );
    }

    if (activeSection === "profile") {
      return (
        <div data-testid="member-section-profile" className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-indigo-800">Profilim</h2>
          {profileLoading ? (
            <p className="mt-4 text-sm text-slate-500">Yükleniyor...</p>
          ) : memberProfile ? (
            <div className="mt-4 space-y-3 text-sm">
              <p>
                <span className="text-slate-500">Görünen ad:</span>{" "}
                <span className="font-semibold text-slate-800">{memberProfile.displayName}</span>
              </p>
              <p>
                <span className="text-slate-500">E-posta:</span>{" "}
                <span className="font-semibold text-slate-800">{memberEmail ?? "—"}</span>
              </p>
              <p>
                <span className="text-slate-500">Rol:</span>{" "}
                <span className="font-semibold text-slate-800">{memberProfile.role}</span>
              </p>
              <p>
                <span className="text-slate-500">Ban durumu:</span>{" "}
                <span className="font-semibold text-slate-800">{memberProfile.isBanned ? "Kısıtlı" : "Aktif"}</span>
              </p>
              <p>
                <span className="text-slate-500">Dakika bakiyesi:</span>{" "}
                <span className="font-semibold text-indigo-700">{walletBalance} dk</span>
              </p>
              <p className="pt-2 text-xs text-slate-500">Profil düzenleme yakında.</p>
              <Link
                data-testid="member-profile-full-link"
                href="/profile"
                className="mt-2 inline-flex text-xs font-semibold text-indigo-600 underline hover:text-indigo-500"
              >
                Tam profil sayfasına git
              </Link>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600">Profil yüklenemedi.</p>
          )}
        </div>
      );
    }

    if (activeSection === "privateRequests") {
      return (
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-indigo-800">Özel Oda Taleplerim</h2>
          {isPrivateRequestsLoading ? (
            <p className="mt-4 text-sm text-slate-500">Yükleniyor...</p>
          ) : sortedPrivateRequests.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">Henüz özel oda talebin yok.</p>
          ) : (
            <div data-testid="member-private-requests-list" className="mt-4 space-y-2">
              {sortedPrivateRequests.map((privateRequest) => (
                <article key={privateRequest.id} className="rounded-xl border border-violet-100 bg-violet-50/40 px-4 py-3 text-sm">
                  <p className="font-semibold text-slate-800">{privateRequest.streamerName}</p>
                  <p className="text-slate-600">{privateRequestStatusLabel(privateRequest.status)}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(privateRequest.createdAt).toLocaleString("tr-TR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (activeSection === "account") {
      return (
        <div data-testid="member-section-account" className="space-y-4">
          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-indigo-800">Hesap Dökümü</h2>
            <p className="mt-2 text-sm text-slate-600">
              Mevcut dakika bakiyesi: <span className="font-semibold text-indigo-700">{walletBalance} dk</span>
            </p>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-indigo-800">Son dakika satın alma talepleri</h3>
            {isOrdersLoading ? (
              <p className="mt-2 text-sm text-slate-500">Yükleniyor...</p>
            ) : myOrders.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">Henüz talep yok.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {myOrders.map((order) => (
                  <article key={order.id} className="rounded-xl border border-cyan-100 bg-cyan-50/50 px-3 py-2 text-sm">
                    <p className="font-semibold text-slate-800">{order.packageName}</p>
                    <p className="text-slate-600">{minuteOrderStatusLabel(order.status)}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-indigo-800">Cüzdan düzenlemeleri</h3>
            {walletAdjustmentsLoading ? (
              <p className="mt-2 text-sm text-slate-500">Yükleniyor...</p>
            ) : walletAdjustments.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">Kayıtlı düzenleme yok.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {walletAdjustments.map((adj) => (
                  <article key={adj.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                    <p className="font-semibold text-slate-800">{adj.amount > 0 ? "+" : ""}{adj.amount} dk</p>
                    {adj.reason ? <p className="text-slate-600">{adj.reason}</p> : null}
                    <p className="text-xs text-slate-500">
                      {new Date(adj.created_at).toLocaleString("tr-TR")}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-indigo-800">Özel oda talepleri</h3>
            {isPrivateRequestsLoading ? (
              <p className="mt-2 text-sm text-slate-500">Yükleniyor...</p>
            ) : sortedPrivateRequests.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">Henüz özel oda talebin yok.</p>
            ) : (
              <div data-testid="member-private-requests-list" className="mt-3 space-y-2">
                {sortedPrivateRequests.slice(0, 5).map((privateRequest) => (
                  <article key={privateRequest.id} className="rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2 text-sm">
                    <p className="font-semibold text-slate-800">{privateRequest.streamerName}</p>
                    <p className="text-slate-600">{privateRequestStatusLabel(privateRequest.status)}</p>
                  </article>
                ))}
              </div>
            )}
            {sortedPrivateRequests.length > 5 ? (
              <button
                type="button"
                onClick={() => setActiveSection("privateRequests")}
                className="mt-3 text-sm font-semibold text-indigo-600 hover:text-indigo-500"
              >
                Tüm talepleri gör ({sortedPrivateRequests.length})
              </button>
            ) : null}
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm" data-testid="member-active-private-session-panel">
            <h3 className="text-base font-semibold text-indigo-800">Özel oda geçmişi</h3>
            {activePrivateSession ? (
              <article className="mt-3 rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2 text-sm">
                <p className="font-semibold text-slate-800">{activePrivateSession.streamerName}</p>
                <p className="text-slate-600">Aktif özel oda oturumu</p>
                <p className="text-xs text-slate-500">
                  {new Date(activePrivateSession.startedAt).toLocaleString("tr-TR")}
                </p>
              </article>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Aktif özel oda oturumun yok.</p>
            )}
            <p className="mt-3 text-xs text-slate-500">Son oturumların tam listesi için Sohbet Ettiklerim bölümüne bakabilirsin.</p>
          </section>
        </div>
      );
    }

    return null;
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-cyan-50 via-pink-50/30 to-violet-50/40 px-4 py-4 text-slate-800 sm:px-6">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-3xl bg-gradient-to-b from-indigo-700 to-violet-700 p-4 text-white shadow-lg">
          <h2 className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-pink-200">Üye Paneli</h2>
          <nav className="mt-3 space-y-2">
            {SIDEBAR_ITEMS.map((item) => (
              <button
                key={item.section}
                type="button"
                data-testid={
                  item.section === "packages" ? "member-sidebar-packages-button" : `member-sidebar-${item.section}`
                }
                onClick={() => {
                  if (item.section === "packages") {
                    openPackagesFlow();
                    return;
                  }
                  setActiveSection(item.section);
                }}
                className={sidebarNavClass(activeSection === item.section)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 w-full rounded-2xl bg-pink-400 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pink-300"
          >
            Çıkış Yap
          </button>
        </aside>

        <section className="space-y-4">
          <header className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <h1 className="text-xl font-semibold text-indigo-800">Üye Ana Ekran</h1>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <span
                data-testid="member-wallet-balance"
                className="rounded-full bg-indigo-100 px-3 py-1.5 text-sm font-semibold text-indigo-700"
              >
                Dakika bakiyem: {walletBalance} dk
              </span>
              <button
                type="button"
                data-testid="member-minute-load-button"
                onClick={() => void openPackagesFlow()}
                disabled={isBanned}
                className="rounded-full bg-pink-400 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-pink-300 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-pink-400"
              >
                Dakika Yükle
              </button>
            </div>
          </header>

          {errorMessage ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{errorMessage}</p>
          ) : null}
          {isBanned ? (
            <section
              data-testid="member-banned-alert"
              className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              <p className="font-semibold">Hesabınız kısıtlanmıştır.</p>
              <p className="mt-1">
                Canlı yayınlara katılma, mesaj yazma, hediye gönderme ve dakika satın alma işlemleri geçici olarak
                kapatılmıştır.
              </p>
            </section>
          ) : null}

          {renderMainBody()}
        </section>
      </div>

      {renderPackagesModal()}
    </main>
  );
}
