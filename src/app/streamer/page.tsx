"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DirectMessagesPanel } from "@/components/dm/DirectMessagesPanel";

type UserRole = "viewer" | "streamer" | "admin" | "owner";

type StreamerMenuItem = { label: string; href: string; section?: "messages" };

const menuItems: StreamerMenuItem[] = [
  { label: "Online OL", href: "/studio" },
  { label: "Mesajlarim", href: "#", section: "messages" },
  { label: "Ozel Oda Kazanclarim", href: "#" },
  { label: "Yayin Ozetim", href: "#" },
  { label: "Profil Guncelle", href: "/profile" },
  { label: "Engellediklerim", href: "#" },
  { label: "Sifre Degistir", href: "#" },
  { label: "Duyurular", href: "#" },
  { label: "Yayin Kurallari", href: "#" },
  { label: "Canli Destek", href: "#" },
];

type StreamerEarningRow = {
  id: string;
  sourceId: string;
  grossMinutes: number;
  platformFeeMinutes: number;
  netMinutes: number;
  createdAt: string;
};

type WithdrawalRow = {
  id: string;
  requestedMinutes: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  paymentNote: string | null;
  adminNote: string | null;
  createdAt: string;
  decidedAt: string | null;
};

type EarningsPayload = {
  ok?: boolean;
  message?: string;
  todayPrivateRoomNetMinutes?: number;
  totalPrivateRoomNetMinutes?: number;
  pendingWithdrawalMinutes?: number;
  approvedWithdrawalMinutes?: number;
  availableWithdrawalMinutes?: number;
  todayGiftMinutes?: number;
  totalGiftMinutes?: number;
  recentPrivateRoomEarnings?: StreamerEarningRow[];
  recentWithdrawals?: WithdrawalRow[];
};

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase ortam degiskenleri eksik.");
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

export default function StreamerPage() {
  const [activeSection, setActiveSection] = useState<"dashboard" | "messages">("dashboard");
  const [errorMessage, setErrorMessage] = useState("");
  const [isBanned, setIsBanned] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [todayGiftTotal, setTodayGiftTotal] = useState(0);
  const [overallGiftTotal, setOverallGiftTotal] = useState(0);
  const [todayPrivateRoomTotal, setTodayPrivateRoomTotal] = useState(0);
  const [overallPrivateRoomTotal, setOverallPrivateRoomTotal] = useState(0);
  const [pendingWithdrawalMinutes, setPendingWithdrawalMinutes] = useState(0);
  const [approvedWithdrawalMinutes, setApprovedWithdrawalMinutes] = useState(0);
  const [availableWithdrawalMinutes, setAvailableWithdrawalMinutes] = useState(0);
  const [recentPrivateRoomEarnings, setRecentPrivateRoomEarnings] = useState<StreamerEarningRow[]>([]);
  const [recentWithdrawals, setRecentWithdrawals] = useState<WithdrawalRow[]>([]);
  const [requestedMinutesInput, setRequestedMinutesInput] = useState("");
  const [paymentNoteInput, setPaymentNoteInput] = useState("");
  const [withdrawalFeedback, setWithdrawalFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSubmittingWithdrawal, setIsSubmittingWithdrawal] = useState(false);

  async function refreshEarningsSummary(nextAccessToken: string) {
    const response = await fetch("/api/streamer/earnings", {
      headers: {
        Authorization: `Bearer ${nextAccessToken}`,
      },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as EarningsPayload;
    if (!response.ok || !payload.ok) {
      setErrorMessage(payload.message ?? "Kazanc ozeti yuklenemedi.");
      return false;
    }

    setErrorMessage("");
    setTodayPrivateRoomTotal(payload.todayPrivateRoomNetMinutes ?? 0);
    setOverallPrivateRoomTotal(payload.totalPrivateRoomNetMinutes ?? 0);
    setPendingWithdrawalMinutes(payload.pendingWithdrawalMinutes ?? 0);
    setApprovedWithdrawalMinutes(payload.approvedWithdrawalMinutes ?? 0);
    setAvailableWithdrawalMinutes(payload.availableWithdrawalMinutes ?? 0);
    setTodayGiftTotal(payload.todayGiftMinutes ?? 0);
    setOverallGiftTotal(payload.totalGiftMinutes ?? 0);
    setRecentPrivateRoomEarnings(payload.recentPrivateRoomEarnings ?? []);
    setRecentWithdrawals(payload.recentWithdrawals ?? []);
    return true;
  }

  useEffect(() => {
    async function checkRoleAndLoad() {
      try {
        const supabase = getSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = "/streamer-login";
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role, is_banned")
          .eq("id", user.id)
          .single<{ role: UserRole; is_banned: boolean }>();

        setIsBanned(profile?.is_banned === true);
        if (profile?.role === "viewer") {
          window.location.href = "/member";
          return;
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token ?? null;
        setAccessToken(token);
        if (token) {
          await refreshEarningsSummary(token);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Beklenmeyen bir hata olustu.");
      }
    }

    void checkRoleAndLoad();
  }, []);

  async function handleLogout() {
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/streamer-login";
    }
  }

  async function submitWithdrawalRequest() {
    const requestedMinutes = Number.parseInt(requestedMinutesInput, 10);
    if (!accessToken) {
      setWithdrawalFeedback({ type: "error", message: "Oturum bulunamadi." });
      return;
    }
    if (!Number.isFinite(requestedMinutes) || requestedMinutes <= 0) {
      setWithdrawalFeedback({ type: "error", message: "Gecerli bir dakika miktari gir." });
      return;
    }
    try {
      setIsSubmittingWithdrawal(true);
      setWithdrawalFeedback(null);
      const response = await fetch("/api/streamer/withdrawals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          requestedMinutes,
          paymentNote: paymentNoteInput.trim() || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) {
        setWithdrawalFeedback({ type: "error", message: payload.message || "Cekim talebi olusturulamadi." });
        return;
      }
      setRequestedMinutesInput("");
      setPaymentNoteInput("");
      setWithdrawalFeedback({ type: "success", message: "Cekim talebin alindi." });
      await refreshEarningsSummary(accessToken);
    } catch {
      setWithdrawalFeedback({ type: "error", message: "Cekim talebi olusturulamadi." });
    } finally {
      setIsSubmittingWithdrawal(false);
    }
  }

  return (
    <main className="min-h-screen bg-cyan-100 px-4 py-4 text-slate-800 sm:px-6">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-3xl bg-gradient-to-b from-indigo-700 to-violet-700 p-4 text-white">
          <h2 className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-pink-200">Yayinci Paneli</h2>
          <nav className="mt-3 space-y-2">
            {menuItems.map((item) => {
              if (item.section === "messages") {
                return (
                  <button
                    key={item.label}
                    type="button"
                    data-testid="streamer-sidebar-messages"
                    onClick={() => setActiveSection("messages")}
                    className={[
                      "block w-full rounded-2xl px-4 py-2.5 text-left text-sm transition",
                      activeSection === "messages" ? "bg-white text-indigo-800 shadow-sm" : "bg-white/10 text-white hover:bg-white/20",
                    ].join(" ")}
                  >
                    {item.label}
                  </button>
                );
              }
              if (item.href === "/studio" && isBanned) {
                return (
                  <span key={item.label} className="block cursor-not-allowed rounded-2xl bg-white/10 px-4 py-2.5 text-sm opacity-60">
                    {item.label}
                  </span>
                );
              }
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setActiveSection("dashboard")}
                  className="block rounded-2xl bg-white/10 px-4 py-2.5 text-sm transition hover:bg-white/20"
                >
                  {item.label}
                </Link>
              );
            })}
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
          <header className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <h1 className="text-xl font-semibold text-indigo-800">Yayinci Ana Ekran</h1>
          </header>

          {errorMessage ? (
            <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600">{errorMessage}</p>
          ) : null}
          {isBanned ? (
            <p className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Hesabiniz kisitlanmistir. Yayin baslatma gibi kritik islemler kapatilmistir.
            </p>
          ) : null}

          {activeSection === "messages" ? (
            <div data-testid="streamer-section-messages" className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold text-indigo-800">Mesajlarim</h2>
              <p className="mt-2 text-sm text-slate-600">Uye ve yayıncı özel mesajların.</p>
              <div className="mt-6">
                <DirectMessagesPanel currentUserRole="streamer" banned={isBanned} />
              </div>
            </div>
          ) : null}

          {activeSection === "dashboard" ? (
            <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-sm font-semibold text-slate-500">Bugunku ozel oda kazanci</h2>
              <p className="mt-2 text-3xl font-bold text-indigo-800">{todayPrivateRoomTotal} dk</p>
            </article>
            <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-sm font-semibold text-slate-500">Toplam ozel oda kazanci</h2>
              <p className="mt-2 text-3xl font-bold text-indigo-800">{overallPrivateRoomTotal} dk</p>
            </article>
            <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-sm font-semibold text-slate-500">Bekleyen cekim</h2>
              <p className="mt-2 text-3xl font-bold text-indigo-800">{pendingWithdrawalMinutes} dk</p>
            </article>
            <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-sm font-semibold text-slate-500">Cekilebilir bakiye</h2>
              <p className="mt-2 text-3xl font-bold text-indigo-800">{availableWithdrawalMinutes} dk</p>
              <p className="mt-1 text-xs text-slate-500">Onaylanan cekim toplam: {approvedWithdrawalMinutes} dk</p>
            </article>
            <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-sm font-semibold text-slate-500">Bugunku hediye geliri</h2>
              <p className="mt-2 text-3xl font-bold text-indigo-800">{todayGiftTotal} dk</p>
            </article>
            <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-sm font-semibold text-slate-500">Toplam hediye geliri</h2>
              <p className="mt-2 text-3xl font-bold text-indigo-800">{overallGiftTotal} dk</p>
            </article>
          </div>

          <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-indigo-800">Cekim talebi olustur</h2>
            <p className="mt-1 text-sm text-slate-500">
              Hediye gelirleri bu fazda bilgilendirme amacli gosterilir; cekilebilir bakiye ozel oda net kazanci uzerinden hesaplanir.
            </p>
            <div data-testid="streamer-withdrawal-form" className="mt-4 space-y-3">
              <input
                type="number"
                min={1}
                max={100000}
                value={requestedMinutesInput}
                onChange={(event) => setRequestedMinutesInput(event.target.value)}
                placeholder="Talep edilecek dakika"
                className="w-full rounded-2xl border border-cyan-200 px-4 py-3 text-sm outline-none"
              />
              <textarea
                maxLength={500}
                rows={3}
                value={paymentNoteInput}
                onChange={(event) => setPaymentNoteInput(event.target.value)}
                placeholder="Odeme notu / IBAN notu (opsiyonel)"
                className="w-full rounded-2xl border border-cyan-200 px-4 py-3 text-sm outline-none"
              />
              <button
                type="button"
                data-testid="streamer-withdrawal-submit"
                disabled={isSubmittingWithdrawal || availableWithdrawalMinutes <= 0}
                onClick={() => void submitWithdrawalRequest()}
                className="rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
              >
                Cekim Talebi Olustur
              </button>
              {withdrawalFeedback ? (
                <p
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    withdrawalFeedback.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-rose-200 bg-rose-50 text-rose-700"
                  }`}
                >
                  {withdrawalFeedback.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-indigo-800">Son ozel oda kazanclari</h2>
            <div className="mt-4 space-y-2">
              {recentPrivateRoomEarnings.map((earning) => (
                <article key={earning.id} className="rounded-2xl border border-violet-100 bg-violet-50 p-3">
                  <p className="text-sm font-semibold text-slate-800">Net: {earning.netMinutes} dk</p>
                  <p className="text-xs text-slate-500">
                    Brut {earning.grossMinutes} dk • Kesinti {earning.platformFeeMinutes} dk •{" "}
                    {new Date(earning.createdAt).toLocaleString("tr-TR")}
                  </p>
                </article>
              ))}
              {recentPrivateRoomEarnings.length === 0 ? (
                <p className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-slate-500">
                  Henuz ozel oda kazanci yok.
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-indigo-800">Son cekim taleplerim</h2>
            <div className="mt-4 space-y-2">
              {recentWithdrawals.map((withdrawal) => (
                <article
                  key={withdrawal.id}
                  data-testid="streamer-withdrawal-row"
                  className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3"
                >
                  <p className="text-sm font-semibold text-slate-800">
                    {withdrawal.requestedMinutes} dk • {withdrawal.status}
                  </p>
                  <p className="text-xs text-slate-500">{new Date(withdrawal.createdAt).toLocaleString("tr-TR")}</p>
                  {withdrawal.paymentNote ? <p className="mt-1 text-xs text-slate-600">Not: {withdrawal.paymentNote}</p> : null}
                  {withdrawal.adminNote ? <p className="mt-1 text-xs text-slate-600">Admin notu: {withdrawal.adminNote}</p> : null}
                </article>
              ))}
              {recentWithdrawals.length === 0 ? (
                <p className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm text-slate-500">Henuz cekim talebi yok.</p>
              ) : null}
            </div>
          </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
