"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LiveRoom } from "@/lib/live-rooms";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useRealtimeLiveRooms } from "@/hooks/use-realtime-live-rooms";
import { useWalletBalance } from "@/hooks/use-wallet-balance";

const menuItems = [
  { label: "Sohbet Et", href: "#" },
  { label: "Sure Satin Al", href: "#" },
  { label: "Mesajlarim", href: "#" },
  { label: "Sohbet Ettiklerim", href: "#" },
  { label: "Takip Ettiklerim", href: "#" },
  { label: "Hesap Dokumu", href: "#" },
  { label: "Profilim", href: "/profile" },
  { label: "Bildirimler", href: "#" },
  { label: "Canli Destek", href: "#" },
];

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

function packageTypeLabel(type: PackageType) {
  return type === "minute" ? "Dakika" : "Sure";
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

export default function MemberPageClient({ initialRooms, initialHasError }: MemberPageClientProps) {
  const safeInitialRooms = initialRooms.filter((room) => room.status === "live");
  const [errorMessage, setErrorMessage] = useState("");
  const [isAccountStatementOpen, setIsAccountStatementOpen] = useState(false);
  const [isPackagesModalOpen, setIsPackagesModalOpen] = useState(false);
  const [isPackagesLoading, setIsPackagesLoading] = useState(false);
  const [packagesError, setPackagesError] = useState("");
  const [purchaseInfoMessage, setPurchaseInfoMessage] = useState("");
  const [isSubmittingPackageId, setIsSubmittingPackageId] = useState<string | null>(null);
  const [myOrders, setMyOrders] = useState<MinutePurchaseOrder[]>([]);
  const [myPrivateRequests, setMyPrivateRequests] = useState<ViewerPrivateRequest[]>([]);
  const [isPrivateRequestsLoading, setIsPrivateRequestsLoading] = useState(false);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
  const [packages, setPackages] = useState<PurchasePackage[]>([]);
  const [hasLoadedPackages, setHasLoadedPackages] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const walletBalance = useWalletBalance({ initialBalance: 0 });
  const { rooms: liveRooms, warning: liveRoomsWarning } = useRealtimeLiveRooms({
    initialRooms: safeInitialRooms,
    initialHasError,
    limit: 24,
    channelKey: "member",
  });
  const safeLiveRooms = liveRooms.filter((room) => room.status === "live");

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

        const { data: profile } = await supabase.from("profiles").select("is_banned").eq("id", user.id).maybeSingle<{ is_banned: boolean }>();
        setIsBanned(profile?.is_banned === true);

      } catch {
        setErrorMessage("Hesap kontrolu su an yapilamadi.");
      }
    }

    checkUser();
  }, []);

  useEffect(() => {
    void loadMyPrivateRequests();
  }, []);

  async function handleLogout() {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/login";
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

  async function fetchAccessToken() {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
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

      setMyPrivateRequests((payload.requests ?? []).slice(0, 10));
    } catch {
      setMyPrivateRequests([]);
    } finally {
      setIsPrivateRequestsLoading(false);
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

  const featuredStreamers = safeLiveRooms.slice(0, 5);
  const showEmptyState = safeLiveRooms.length === 0;

  return (
    <main className="min-h-screen bg-cyan-100 px-4 py-4 text-slate-800 sm:px-6">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-3xl bg-gradient-to-b from-indigo-700 to-violet-700 p-4 text-white">
          <h2 className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-pink-200">
            Uye Paneli
          </h2>
          <nav className="mt-3 space-y-2">
            {menuItems.map((item) => (
              item.label === "Hesap Dokumu" ? (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setIsAccountStatementOpen((previous) => !previous)}
                  className="block w-full rounded-2xl bg-white/10 px-4 py-2.5 text-left text-sm transition hover:bg-white/20"
                >
                  {item.label}
                </button>
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  className="block rounded-2xl bg-white/10 px-4 py-2.5 text-sm transition hover:bg-white/20"
                >
                  {item.label}
                </Link>
              )
            ))}
          </nav>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 w-full rounded-2xl bg-pink-400 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pink-300"
          >
            Cikis Yap
          </button>
        </aside>

        <section className="space-y-4">
          <header className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <h1 className="text-xl font-semibold text-indigo-800">Uye Ana Ekran</h1>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span data-testid="member-wallet-balance" className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-700">
                Dakika bakiyem: {walletBalance} dk
              </span>
              <button
                type="button"
                data-testid="open-member-packages"
                onClick={() => void handleOpenPackages()}
                disabled={isBanned}
                className="rounded-full bg-pink-400 px-3 py-1 text-xs font-semibold text-white transition hover:bg-pink-300 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-pink-400"
              >
                Dakika Yükle
              </button>
            </div>
          </header>

          {errorMessage ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {errorMessage}
            </p>
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

          <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            {isAccountStatementOpen ? (
              <section className="mb-4 rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
                <h2 className="text-base font-semibold text-indigo-800">Hesap Dokumu</h2>
                <p className="mt-2 text-sm text-slate-700">Mevcut dakika bakiyesi: {walletBalance} dk</p>
                <p className="mt-1 text-xs text-slate-500">Dakika yukleme yakinda.</p>
              </section>
            ) : null}
            <section className="mb-4 rounded-2xl border border-violet-100 bg-violet-50/40 p-4" data-testid="member-private-requests-panel">
              <h2 className="text-base font-semibold text-indigo-800">Özel Oda Taleplerim</h2>
              {isPrivateRequestsLoading ? (
                <p className="mt-2 text-sm text-slate-600">Yukleniyor...</p>
              ) : myPrivateRequests.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">Henüz özel oda talebiniz yok.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {myPrivateRequests.map((privateRequest) => (
                    <article key={privateRequest.id} className="rounded-xl border border-violet-100 bg-white px-3 py-2 text-sm">
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
            </section>
            <h2 className="text-lg font-semibold text-indigo-800">Gunun Populer Yayincilari</h2>
            <div className="mt-4 flex gap-3 overflow-x-auto">
              {featuredStreamers.length > 0 ? (
                featuredStreamers.map((room) => (
                  <Link
                    key={room.id}
                    href={`/rooms/${room.id}`}
                    className={`block min-w-[160px] rounded-2xl bg-cyan-50 p-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      isBanned ? "pointer-events-none opacity-60" : "hover:bg-cyan-100"
                    }`}
                  >
                    <div className="h-14 w-14 rounded-full bg-gradient-to-br from-pink-300 to-violet-400" />
                    <p className="mt-3 text-sm font-semibold">{room.streamerName}</p>
                    <p className="mt-1 text-xs text-emerald-600">canli • HD</p>
                    <span className="mt-3 inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
                      Yayina gir
                    </span>
                  </Link>
                ))
              ) : (
                <div className="w-full rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-5 text-sm text-slate-600">
                  <p className="font-semibold text-indigo-700">Su an canli yayin yok</p>
                  <p className="mt-1 text-slate-500">Yayincilar online oldugunda burada gorunecek.</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-indigo-800">Online Yayincilar</h2>
            {!showEmptyState ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {safeLiveRooms.map((room) => (
                  <Link
                    key={room.id}
                    href={`/rooms/${room.id}`}
                    className={`block rounded-2xl bg-cyan-50 p-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      isBanned ? "pointer-events-none opacity-60" : "hover:bg-cyan-100"
                    }`}
                  >
                    <div className="h-16 rounded-xl bg-gradient-to-br from-indigo-300 to-pink-300" />
                    <p className="mt-3 text-sm font-semibold">{room.streamerName}</p>
                    <p className="mt-1 text-xs text-emerald-600">canli • HD</p>
                    <span className="mt-3 inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
                      Yayina gir
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-5 text-sm text-slate-600">
                <p className="font-semibold text-indigo-700">Su an canli yayin yok</p>
                <p className="mt-1 text-slate-500">Yayincilar online oldugunda burada gorunecek.</p>
              </div>
            )}
            {liveRoomsWarning ? <p className="mt-3 text-xs text-slate-500">{liveRoomsWarning}</p> : null}
          </div>
        </section>
      </div>

      {isPackagesModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-indigo-950/40 p-3 sm:items-center sm:p-5">
          <section
            data-testid="member-packages-modal"
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
              {isPackagesLoading ? <p className="text-sm text-slate-500">Yukleniyor...</p> : null}
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
                <p data-testid="member-packages-purchase-message" className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
                  {purchaseInfoMessage}
                </p>
              ) : null}

              <section className="mt-5 rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
                <h3 className="text-sm font-semibold text-indigo-800">Son taleplerim</h3>
                {isOrdersLoading ? <p className="mt-2 text-sm text-slate-500">Yukleniyor...</p> : null}
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
      ) : null}
    </main>
  );
}
