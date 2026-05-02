"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DirectMessagesPanel } from "@/components/dm/DirectMessagesPanel";

type UserRole = "viewer" | "streamer" | "admin" | "owner";

type StreamerActiveSection =
  | "dashboard"
  | "messages"
  | "privateEarnings"
  | "broadcastSummary"
  | "profile"
  | "blocked"
  | "password"
  | "announcements"
  | "rules"
  | "support";

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

type RecentGiftRow = {
  id: string;
  amount: number;
  createdAt: string;
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
  recentGifts?: RecentGiftRow[];
};

type ProfileSummary = {
  displayName: string | null;
  role: UserRole;
  email: string | null;
};

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase ortam değişkenleri eksik.");
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

function sidebarNavClass(active: boolean) {
  return [
    "block w-full rounded-2xl px-4 py-2.5 text-left text-sm transition",
    active ? "bg-white text-indigo-800 shadow-sm" : "bg-white/10 text-white hover:bg-white/20",
  ].join(" ");
}

const SECTION_TEST_ID: Record<StreamerActiveSection, string> = {
  dashboard: "streamer-section-dashboard",
  messages: "streamer-section-messages",
  privateEarnings: "streamer-section-private-earnings",
  broadcastSummary: "streamer-section-broadcast-summary",
  profile: "streamer-section-profile",
  blocked: "streamer-section-blocked",
  password: "streamer-section-password",
  announcements: "streamer-section-announcements",
  rules: "streamer-section-rules",
  support: "streamer-section-support",
};

export default function StreamerPage() {
  const [activeSection, setActiveSection] = useState<StreamerActiveSection>("dashboard");
  const [errorMessage, setErrorMessage] = useState("");
  const [isBanned, setIsBanned] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null);
  const [todayGiftTotal, setTodayGiftTotal] = useState(0);
  const [overallGiftTotal, setOverallGiftTotal] = useState(0);
  const [todayPrivateRoomTotal, setTodayPrivateRoomTotal] = useState(0);
  const [overallPrivateRoomTotal, setOverallPrivateRoomTotal] = useState(0);
  const [pendingWithdrawalMinutes, setPendingWithdrawalMinutes] = useState(0);
  const [approvedWithdrawalMinutes, setApprovedWithdrawalMinutes] = useState(0);
  const [availableWithdrawalMinutes, setAvailableWithdrawalMinutes] = useState(0);
  const [recentPrivateRoomEarnings, setRecentPrivateRoomEarnings] = useState<StreamerEarningRow[]>([]);
  const [recentWithdrawals, setRecentWithdrawals] = useState<WithdrawalRow[]>([]);
  const [recentGifts, setRecentGifts] = useState<RecentGiftRow[]>([]);
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
      setErrorMessage(payload.message ?? "Kazanç özeti yüklenemedi.");
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
    setRecentGifts(payload.recentGifts ?? []);
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
          .select("role, is_banned, display_name")
          .eq("id", user.id)
          .single<{ role: UserRole; is_banned: boolean; display_name: string | null }>();

        setIsBanned(profile?.is_banned === true);
        if (profile?.role === "viewer") {
          window.location.href = "/member";
          return;
        }

        setProfileSummary({
          displayName: profile?.display_name ?? null,
          role: (profile?.role as UserRole) ?? "streamer",
          email: user.email ?? null,
        });

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token ?? null;
        setAccessToken(token);
        if (token) {
          await refreshEarningsSummary(token);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.");
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
      setWithdrawalFeedback({ type: "error", message: "Oturum bulunamadı." });
      return;
    }
    if (!Number.isFinite(requestedMinutes) || requestedMinutes <= 0) {
      setWithdrawalFeedback({ type: "error", message: "Geçerli bir dakika miktarı gir." });
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
        setWithdrawalFeedback({ type: "error", message: payload.message || "Çekim talebi oluşturulamadı." });
        return;
      }
      setRequestedMinutesInput("");
      setPaymentNoteInput("");
      setWithdrawalFeedback({ type: "success", message: "Çekim talebin alındı." });
      await refreshEarningsSummary(accessToken);
    } catch {
      setWithdrawalFeedback({ type: "error", message: "Çekim talebi oluşturulamadı." });
    } finally {
      setIsSubmittingWithdrawal(false);
    }
  }

  const roleLabel =
    profileSummary?.role === "owner"
      ? "Sahip"
      : profileSummary?.role === "admin"
        ? "Yönetici"
        : profileSummary?.role === "streamer"
          ? "Yayıncı"
          : "Üye";

  const withdrawalForm = (
    <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-indigo-800">Çekim talebi oluştur</h2>
      <p className="mt-1 text-sm text-slate-500">
        Hediye gelirleri bilgilendirme amaçlıdır; çekilebilir bakiye özel oda net kazancı üzerinden hesaplanır.
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
          placeholder="Ödeme notu / IBAN notu (opsiyonel)"
          className="w-full rounded-2xl border border-cyan-200 px-4 py-3 text-sm outline-none"
        />
        <button
          type="button"
          data-testid="streamer-withdrawal-submit"
          disabled={isSubmittingWithdrawal || availableWithdrawalMinutes <= 0}
          onClick={() => void submitWithdrawalRequest()}
          className="rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          Çekim Talebi Oluştur
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
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-cyan-50 via-pink-50/30 to-violet-50/40 px-4 py-4 text-slate-800 sm:px-6">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-3xl bg-gradient-to-b from-indigo-700 to-violet-700 p-4 text-white shadow-lg">
          <h2 className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-pink-200">Yayıncı Paneli</h2>
          <nav className="mt-3 space-y-2">
            {isBanned ? (
              <span className="block cursor-not-allowed rounded-2xl bg-white/10 px-4 py-2.5 text-sm opacity-60">Online Ol</span>
            ) : (
              <Link
                href="/studio"
                data-testid="streamer-sidebar-studio"
                className="block rounded-2xl bg-gradient-to-r from-pink-400 to-violet-500 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-md transition hover:from-pink-300 hover:to-violet-400"
              >
                Online Ol
              </Link>
            )}

            <button
              type="button"
              data-testid="streamer-sidebar-messages"
              onClick={() => setActiveSection("messages")}
              className={sidebarNavClass(activeSection === "messages")}
            >
              Mesajlarım
            </button>
            <button
              type="button"
              data-testid="streamer-sidebar-private-earnings"
              onClick={() => setActiveSection("privateEarnings")}
              className={sidebarNavClass(activeSection === "privateEarnings")}
            >
              Özel Oda Kazançlarım
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("broadcastSummary")}
              className={sidebarNavClass(activeSection === "broadcastSummary")}
            >
              Yayın Özeti
            </button>
            <button
              type="button"
              data-testid="streamer-sidebar-profile"
              onClick={() => setActiveSection("profile")}
              className={sidebarNavClass(activeSection === "profile")}
            >
              Profil Güncelle
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("blocked")}
              className={sidebarNavClass(activeSection === "blocked")}
            >
              Engellediklerim
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("password")}
              className={sidebarNavClass(activeSection === "password")}
            >
              Şifre Değiştir
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("announcements")}
              className={sidebarNavClass(activeSection === "announcements")}
            >
              Duyurular
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("rules")}
              className={sidebarNavClass(activeSection === "rules")}
            >
              Yayın Kuralları
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("support")}
              className={sidebarNavClass(activeSection === "support")}
            >
              Canlı Destek
            </button>
          </nav>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 w-full rounded-2xl bg-pink-400 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pink-300"
          >
            Çıkış Yap
          </button>
        </aside>

        <section className="min-w-0 space-y-4">
          <header className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <h1 className="text-xl font-semibold text-indigo-800">Yayıncı Ana Ekran</h1>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <span
                data-testid="streamer-available-balance-badge"
                className="rounded-full bg-indigo-100 px-3 py-1.5 text-sm font-semibold text-indigo-700"
              >
                Çekilebilir: {availableWithdrawalMinutes} dk
              </span>
              {isBanned ? (
                <span className="rounded-full bg-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600">Yayına gidilemez</span>
              ) : (
                <Link
                  href="/studio"
                  data-testid="streamer-goto-broadcast-cta"
                  className="rounded-full bg-pink-400 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-pink-300"
                >
                  Yayına Git
                </Link>
              )}
            </div>
          </header>

          {errorMessage ? (
            <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600">{errorMessage}</p>
          ) : null}
          {isBanned ? (
            <p className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Hesabınız kısıtlanmıştır. Yayın başlatma gibi kritik işlemler kapatılmıştır.
            </p>
          ) : null}

          {activeSection === "dashboard" ? (
            <div data-testid={SECTION_TEST_ID.dashboard} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="text-sm font-semibold text-slate-500">Bugünkü özel oda kazancı</h2>
                  <p className="mt-2 text-3xl font-bold text-indigo-800">{todayPrivateRoomTotal} dk</p>
                </article>
                <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="text-sm font-semibold text-slate-500">Toplam özel oda kazancı</h2>
                  <p className="mt-2 text-3xl font-bold text-indigo-800">{overallPrivateRoomTotal} dk</p>
                </article>
                <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="text-sm font-semibold text-slate-500">Çekilebilir bakiye</h2>
                  <p className="mt-2 text-3xl font-bold text-indigo-800">{availableWithdrawalMinutes} dk</p>
                  <p className="mt-1 text-xs text-slate-500">Onaylanan çekim toplamı: {approvedWithdrawalMinutes} dk</p>
                </article>
                <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="text-sm font-semibold text-slate-500">Bekleyen çekim</h2>
                  <p className="mt-2 text-3xl font-bold text-indigo-800">{pendingWithdrawalMinutes} dk</p>
                </article>
                <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="text-sm font-semibold text-slate-500">Bugünkü hediye geliri</h2>
                  <p className="mt-2 text-3xl font-bold text-indigo-800">{todayGiftTotal} dk</p>
                </article>
                <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="text-sm font-semibold text-slate-500">Toplam hediye geliri</h2>
                  <p className="mt-2 text-3xl font-bold text-indigo-800">{overallGiftTotal} dk</p>
                </article>
              </div>

              <div className="rounded-2xl border border-indigo-100 bg-white/80 px-4 py-3 text-sm text-slate-600 shadow-sm">
                <span className="font-medium text-indigo-800">Çekim talebi:</span> Özel oda kazançların üzerinden talep oluşturmak için{" "}
                <button
                  type="button"
                  className="font-semibold text-pink-600 underline decoration-pink-300 underline-offset-2 hover:text-pink-500"
                  onClick={() => setActiveSection("privateEarnings")}
                >
                  Özel Oda Kazançlarım
                </button>{" "}
                bölümüne gidin.
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="text-lg font-semibold text-indigo-800">Son gelen hediyeler</h2>
                  <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
                    {recentGifts.map((gift) => (
                      <article key={gift.id} className="rounded-2xl border border-pink-100 bg-pink-50/80 px-3 py-2">
                        <p className="text-sm font-semibold text-slate-800">+{gift.amount} dk</p>
                        <p className="text-xs text-slate-500">{new Date(gift.createdAt).toLocaleString("tr-TR")}</p>
                      </article>
                    ))}
                    {recentGifts.length === 0 ? (
                      <p className="rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-3 text-sm text-slate-500">Henüz hediye kaydı yok.</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="text-lg font-semibold text-indigo-800">Son özel oda kazançları</h2>
                  <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
                    {recentPrivateRoomEarnings.map((earning) => (
                      <article key={earning.id} className="rounded-2xl border border-violet-100 bg-violet-50 p-3">
                        <p className="text-sm font-semibold text-slate-800">Net: {earning.netMinutes} dk</p>
                        <p className="text-xs text-slate-500">
                          Brüt {earning.grossMinutes} dk • Kesinti {earning.platformFeeMinutes} dk •{" "}
                          {new Date(earning.createdAt).toLocaleString("tr-TR")}
                        </p>
                      </article>
                    ))}
                    {recentPrivateRoomEarnings.length === 0 ? (
                      <p className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-slate-500">Henüz özel oda kazancı yok.</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                <h2 className="text-lg font-semibold text-indigo-800">Son çekim talepleri</h2>
                <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
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
                    <p className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm text-slate-500">Henüz çekim talebi yok.</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {activeSection === "messages" ? (
            <div data-testid={SECTION_TEST_ID.messages} className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold text-indigo-800">Mesajlarım</h2>
              <p className="mt-2 text-sm text-slate-600">Üye ve yayıncı özel mesajların.</p>
              <div className="mt-6">
                <DirectMessagesPanel currentUserRole="streamer" banned={isBanned} />
              </div>
            </div>
          ) : null}

          {activeSection === "privateEarnings" ? (
            <div data-testid={SECTION_TEST_ID.privateEarnings} className="space-y-4">
              <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                <h2 className="text-2xl font-semibold text-indigo-800">Özel Oda Kazançlarım</h2>
                <p className="mt-1 text-sm text-slate-600">Özel oda net kazancın ve çekim taleplerin.</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="text-sm font-semibold text-slate-500">Toplam özel oda kazancı</h2>
                  <p className="mt-2 text-2xl font-bold text-indigo-800">{overallPrivateRoomTotal} dk</p>
                </article>
                <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="text-sm font-semibold text-slate-500">Bugünkü özel oda kazancı</h2>
                  <p className="mt-2 text-2xl font-bold text-indigo-800">{todayPrivateRoomTotal} dk</p>
                </article>
                <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="text-sm font-semibold text-slate-500">Çekilebilir bakiye</h2>
                  <p className="mt-2 text-2xl font-bold text-indigo-800">{availableWithdrawalMinutes} dk</p>
                </article>
                <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="text-sm font-semibold text-slate-500">Bekleyen çekim</h2>
                  <p className="mt-2 text-2xl font-bold text-indigo-800">{pendingWithdrawalMinutes} dk</p>
                </article>
              </div>

              {withdrawalForm}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="text-lg font-semibold text-indigo-800">Son özel oda kazançları</h2>
                  <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                    {recentPrivateRoomEarnings.map((earning) => (
                      <article key={earning.id} className="rounded-2xl border border-violet-100 bg-violet-50 p-3">
                        <p className="text-sm font-semibold text-slate-800">Net: {earning.netMinutes} dk</p>
                        <p className="text-xs text-slate-500">
                          Brüt {earning.grossMinutes} dk • Kesinti {earning.platformFeeMinutes} dk •{" "}
                          {new Date(earning.createdAt).toLocaleString("tr-TR")}
                        </p>
                      </article>
                    ))}
                    {recentPrivateRoomEarnings.length === 0 ? (
                      <p className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-slate-500">Henüz özel oda kazancı yok.</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="text-lg font-semibold text-indigo-800">Son çekim taleplerim</h2>
                  <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
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
                      <p className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm text-slate-500">Henüz çekim talebi yok.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeSection === "broadcastSummary" ? (
            <div data-testid={SECTION_TEST_ID.broadcastSummary} className="space-y-4">
              <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                <h2 className="text-2xl font-semibold text-indigo-800">Yayın Özeti</h2>
                <p className="mt-2 text-sm text-slate-600">Mevcut kazanç verilerinden özet.</p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                  <h3 className="text-sm font-semibold text-slate-500">Toplam özel oda süresi (net)</h3>
                  <p className="mt-2 text-2xl font-bold text-indigo-800">{overallPrivateRoomTotal} dk</p>
                </article>
                <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                  <h3 className="text-sm font-semibold text-slate-500">Toplam hediye geliri</h3>
                  <p className="mt-2 text-2xl font-bold text-indigo-800">{overallGiftTotal} dk</p>
                </article>
                <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
                  <h3 className="text-sm font-semibold text-slate-500">Son hediye işlemleri</h3>
                  <p className="mt-2 text-2xl font-bold text-indigo-800">{recentGifts.length}</p>
                  <p className="mt-1 text-xs text-slate-500">Son 10 işlem üzerinden</p>
                </article>
              </div>

              <div className="rounded-3xl border border-indigo-100 bg-white p-4 text-sm text-slate-600 shadow-sm sm:p-6">
                <p className="font-medium text-indigo-800">Detaylı yayın analitiği</p>
                <p className="mt-2">
                  Toplam canlı oda / özel oda oturum sayısı ve detaylı yayın analitiği bir sonraki fazda bağlanacak.
                </p>
              </div>
            </div>
          ) : null}

          {activeSection === "profile" ? (
            <div data-testid={SECTION_TEST_ID.profile} className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-xl font-semibold text-indigo-800">Profil Güncelle</h2>
              <div className="mt-6 space-y-3 rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
                <p className="text-sm">
                  <span className="font-semibold text-slate-700">Görünen ad:</span>{" "}
                  <span className="text-slate-800">{profileSummary?.displayName?.trim() || "—"}</span>
                </p>
                <p className="text-sm">
                  <span className="font-semibold text-slate-700">E-posta:</span>{" "}
                  <span className="break-all text-slate-800">{profileSummary?.email ?? "—"}</span>
                </p>
                <p className="text-sm">
                  <span className="font-semibold text-slate-700">Rol:</span> <span className="text-slate-800">{roleLabel}</span>
                </p>
                <p className="text-sm">
                  <span className="font-semibold text-slate-700">Ban durumu:</span>{" "}
                  <span className="text-slate-800">{isBanned ? "Kısıtlı" : "Aktif"}</span>
                </p>
              </div>
              <Link
                href="/profile"
                data-testid="streamer-profile-full-link"
                className="mt-6 inline-flex rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Profil sayfasına git
              </Link>
              <p className="mt-4 text-sm text-slate-500">Profil düzenleme formu yakında bu panelde de kullanılabilir olacak.</p>
            </div>
          ) : null}

          {activeSection === "blocked" ? (
            <div data-testid={SECTION_TEST_ID.blocked} className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-xl font-semibold text-indigo-800">Engellediklerim</h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                Engel yönetimi stüdyo moderasyon panelinden yapılır. Detaylı liste bir sonraki fazda bağlanacak.
              </p>
            </div>
          ) : null}

          {activeSection === "password" ? (
            <div data-testid={SECTION_TEST_ID.password} className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-xl font-semibold text-indigo-800">Şifre Değiştir</h2>
              <p className="mt-4 text-sm text-slate-600">Şifre değiştirme akışı bir sonraki fazda bağlanacak.</p>
              <p className="mt-3 text-sm text-slate-500">
                Oturumunu kapatıp giriş ekranından şifremi unuttum akışını kullanmak istersen{" "}
                <Link href="/streamer-login" className="font-semibold text-indigo-600 underline">
                  yayıncı girişi
                </Link>{" "}
                sayfasına gidebilirsin.
              </p>
            </div>
          ) : null}

          {activeSection === "announcements" ? (
            <div data-testid={SECTION_TEST_ID.announcements} className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-xl font-semibold text-indigo-800">Duyurular</h2>
              <p className="mt-4 text-sm text-slate-600">Henüz duyuru yok.</p>
            </div>
          ) : null}

          {activeSection === "rules" ? (
            <div data-testid={SECTION_TEST_ID.rules} className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-xl font-semibold text-indigo-800">Yayın Kuralları</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700">
                <li>Telefon, e-posta veya sosyal medya paylaşımı yasaktır.</li>
                <li>Uygunsuz davranışlar moderasyon sebebidir.</li>
                <li>Özel oda kuralları platform güvenliği kapsamındadır.</li>
              </ul>
            </div>
          ) : null}

          {activeSection === "support" ? (
            <div data-testid={SECTION_TEST_ID.support} className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-xl font-semibold text-indigo-800">Canlı Destek</h2>
              <p className="mt-4 text-sm text-slate-600">Destek talebin için admin ekibiyle iletişime geçebilirsin.</p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
