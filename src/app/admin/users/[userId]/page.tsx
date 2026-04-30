"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";
import { getSupabaseClient } from "@/app/admin/_lib/supabase";

type Role = "viewer" | "streamer" | "admin" | "owner";
type ManagedRole = "viewer" | "streamer" | "admin";

type MinuteOrder = {
  id: string;
  packageName: string;
  amount: number;
  priceTry: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt: string | null;
};

type WalletAdjustment = {
  id: string;
  amount: number;
  reason: string | null;
  adminName: string;
  createdAt: string;
};

type GiftItem = {
  id: string;
  roomId: string;
  giftName: string;
  giftEmoji: string;
  amount: number;
  createdAt: string;
};

type ActionLog = {
  id: string;
  actionType: string;
  description: string;
  adminName: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

type UserDetail = {
  profile: {
    id: string;
    displayName: string;
    role: Role;
    isBanned: boolean;
    updatedAt: string;
  };
  wallet: {
    balance: number;
    updatedAt: string | null;
  };
  minuteOrders: MinuteOrder[];
  walletAdjustments: WalletAdjustment[];
  sentGifts: GiftItem[];
  receivedGifts: GiftItem[];
  actionLogs: ActionLog[];
};

type DetailApiResponse = {
  ok?: boolean;
  message?: string;
} & Partial<UserDetail>;

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return "-";
  }
  return new Date(timestamp).toLocaleString("tr-TR");
}

function roleBadgeTone(role: Role) {
  if (role === "owner") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (role === "admin") {
    return "border-indigo-200 bg-indigo-50 text-indigo-700";
  }
  if (role === "streamer") {
    return "border-cyan-200 bg-cyan-50 text-cyan-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function safeMetadata(metadata: Record<string, unknown>) {
  try {
    const json = JSON.stringify(metadata);
    return json.length <= 140 ? json : `${json.slice(0, 137)}...`;
  } catch {
    return "{}";
  }
}

export default function AdminUserDetailPage() {
  const params = useParams<{ userId: string }>();
  const userId = typeof params?.userId === "string" ? params.userId : "";
  const { loading, authorized, message, signOut } = useAdminAccess();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedRole, setSelectedRole] = useState<ManagedRole>("viewer");
  const [amountInput, setAmountInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [isActing, setIsActing] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!authorized || !userId) {
      return;
    }
    setIsFetching(true);
    setFeedback(null);
    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setDetail(null);
        setFeedback({ type: "error", text: "Oturum bulunamadı." });
        return;
      }

      const response = await fetch(`/api/admin/users/${userId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as DetailApiResponse;
      if (!response.ok || !payload.ok || !payload.profile || !payload.wallet) {
        setDetail(null);
        setFeedback({ type: "error", text: payload.message ?? "Kullanıcı detayı yüklenemedi." });
        return;
      }

      const nextDetail: UserDetail = {
        profile: payload.profile,
        wallet: payload.wallet,
        minuteOrders: payload.minuteOrders ?? [],
        walletAdjustments: payload.walletAdjustments ?? [],
        sentGifts: payload.sentGifts ?? [],
        receivedGifts: payload.receivedGifts ?? [],
        actionLogs: payload.actionLogs ?? [],
      };
      setDetail(nextDetail);
      if (nextDetail.profile.role !== "owner") {
        setSelectedRole(nextDetail.profile.role as ManagedRole);
      }
    } catch {
      setDetail(null);
      setFeedback({ type: "error", text: "Kullanıcı detayı yüklenemedi." });
    } finally {
      setIsFetching(false);
    }
  }, [authorized, userId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const isOwnerUser = detail?.profile.role === "owner";

  const canSubmitWallet = useMemo(() => {
    const parsedAmount = Number.parseInt(amountInput, 10);
    return Number.isFinite(parsedAmount) && parsedAmount > 0 && !isActing;
  }, [amountInput, isActing]);

  async function runUserAction(action: "ban" | "unban" | "set_role") {
    if (!detail || isActing) {
      return;
    }
    if (action === "set_role" && isOwnerUser) {
      return;
    }
    setIsActing(true);
    setFeedback(null);
    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setFeedback({ type: "error", text: "Oturum bulunamadı." });
        return;
      }

      const response = await fetch("/api/admin/users/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId: detail.profile.id,
          action,
          role: action === "set_role" ? selectedRole : undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) {
        setFeedback({ type: "error", text: payload.message ?? "İşlem yapılamadı." });
        return;
      }

      setFeedback({
        type: "success",
        text:
          action === "set_role"
            ? "Rol güncellendi."
            : action === "ban"
              ? "Kullanıcı banlandı."
              : "Kullanıcının banı kaldırıldı.",
      });
      await loadDetail();
    } catch {
      setFeedback({ type: "error", text: "İşlem yapılamadı." });
    } finally {
      setIsActing(false);
    }
  }

  async function runWalletAdjustment(multiplier: 1 | -1) {
    if (!detail || isActing) {
      return;
    }

    const parsedAmount = Number.parseInt(amountInput, 10);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFeedback({ type: "error", text: "Miktar 0'dan büyük bir tam sayı olmalı." });
      return;
    }

    setIsActing(true);
    setFeedback(null);
    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setFeedback({ type: "error", text: "Oturum bulunamadı." });
        return;
      }

      const response = await fetch("/api/admin/wallets/adjust", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId: detail.profile.id,
          amount: parsedAmount * multiplier,
          reason: reasonInput.trim() || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) {
        setFeedback({ type: "error", text: payload.message ?? "Dakika düzenleme yapılamadı." });
        return;
      }

      setFeedback({ type: "success", text: multiplier === 1 ? "Dakika eklendi." : "Dakika düşüldü." });
      setAmountInput("");
      setReasonInput("");
      await loadDetail();
    } catch {
      setFeedback({ type: "error", text: "Dakika düzenleme yapılamadı." });
    } finally {
      setIsActing(false);
    }
  }

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout title="Kullanıcı Detayı" description="Kullanıcı rolü, durum ve hareket geçmişi" onLogout={signOut}>
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/admin/users"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Geri dön
          </Link>
          <button
            type="button"
            onClick={() => void loadDetail()}
            disabled={isFetching}
            className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Yenile
          </button>
        </div>

        {feedback ? (
          <p
            className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {feedback.text}
          </p>
        ) : null}

        {isFetching && !detail ? <p className="mt-4 text-sm text-slate-500">Kullanıcı detayı yükleniyor...</p> : null}

        {!isFetching && !detail ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Kullanıcı detayı yüklenemedi.
          </p>
        ) : null}

        {detail ? (
          <>
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
              <article className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3">
                <p className="text-xs text-slate-500">Kullanıcı adı</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{detail.profile.displayName}</p>
              </article>
              <article className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3">
                <p className="text-xs text-slate-500">Rol</p>
                <p
                  className={`mt-1 inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${roleBadgeTone(detail.profile.role)}`}
                >
                  {detail.profile.role}
                </p>
              </article>
              <article className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3">
                <p className="text-xs text-slate-500">Durum</p>
                <p
                  className={`mt-1 inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${
                    detail.profile.isBanned
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {detail.profile.isBanned ? "Banlı" : "Aktif"}
                </p>
              </article>
              <article className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3">
                <p className="text-xs text-slate-500">Dakika bakiyesi</p>
                <p className="mt-1 text-xl font-bold text-indigo-800">{detail.wallet.balance} dk</p>
              </article>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 rounded-2xl border border-cyan-100 bg-cyan-50/30 p-4 lg:grid-cols-3">
              <article className="rounded-xl border border-cyan-100 bg-white p-3">
                <p className="text-xs font-semibold text-slate-500">Ban yönetimi</p>
                <button
                  type="button"
                  onClick={() => void runUserAction(detail.profile.isBanned ? "unban" : "ban")}
                  disabled={isActing}
                  className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {detail.profile.isBanned ? "Banı Kaldır" : "Banla"}
                </button>
              </article>

              <article className="rounded-xl border border-cyan-100 bg-white p-3">
                <p className="text-xs font-semibold text-slate-500">Rol güncelle</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={selectedRole}
                    onChange={(event) => setSelectedRole(event.target.value as ManagedRole)}
                    disabled={isOwnerUser || isActing}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"
                  >
                    <option value="viewer">viewer</option>
                    <option value="streamer">streamer</option>
                    <option value="admin">admin</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void runUserAction("set_role")}
                    disabled={isOwnerUser || isActing}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Rolü Güncelle
                  </button>
                </div>
                {isOwnerUser ? <p className="mt-2 text-xs text-slate-500">Owner rolü değiştirilemez.</p> : null}
              </article>

              <article className="rounded-xl border border-cyan-100 bg-white p-3">
                <p className="text-xs font-semibold text-slate-500">Dakika ekle / düş</p>
                <div className="mt-2 flex flex-col gap-2">
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={amountInput}
                    onChange={(event) => setAmountInput(event.target.value)}
                    placeholder="Miktar"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none"
                  />
                  <input
                    type="text"
                    maxLength={300}
                    value={reasonInput}
                    onChange={(event) => setReasonInput(event.target.value)}
                    placeholder="Neden"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void runWalletAdjustment(1)}
                      disabled={!canSubmitWallet}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Dakika Ekle
                    </button>
                    <button
                      type="button"
                      onClick={() => void runWalletAdjustment(-1)}
                      disabled={!canSubmitWallet}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Dakika Düş
                    </button>
                  </div>
                </div>
              </article>
            </div>

            <div className="mt-2 text-xs text-slate-500">
              Profil güncelleme: {formatDateTime(detail.profile.updatedAt)} | Cüzdan güncelleme: {formatDateTime(detail.wallet.updatedAt)}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <section className="rounded-2xl border border-cyan-100 bg-white p-4">
                <h2 className="text-sm font-semibold text-indigo-800">Satın Alma Talepleri</h2>
                <div className="mt-3 space-y-2">
                  {detail.minuteOrders.map((order) => (
                    <article key={order.id} className="rounded-xl border border-cyan-100 px-3 py-2 text-sm">
                      <p className="font-semibold text-slate-800">{order.packageName}</p>
                      <p className="text-slate-600">
                        {order.amount} dk • {order.priceTry} TL • {order.status}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDateTime(order.createdAt)}
                        {order.decidedAt ? ` • Karar: ${formatDateTime(order.decidedAt)}` : ""}
                      </p>
                    </article>
                  ))}
                  {detail.minuteOrders.length === 0 ? <p className="text-sm text-slate-500">Son 20 talep içinde kayıt yok.</p> : null}
                </div>
              </section>

              <section className="rounded-2xl border border-cyan-100 bg-white p-4">
                <h2 className="text-sm font-semibold text-indigo-800">Dakika Hareketleri</h2>
                <div className="mt-3 space-y-2">
                  {detail.walletAdjustments.map((adjustment) => (
                    <article key={adjustment.id} className="rounded-xl border border-cyan-100 px-3 py-2 text-sm">
                      <p className="font-semibold text-slate-800">
                        {adjustment.amount > 0 ? "+" : ""}
                        {adjustment.amount} dk
                      </p>
                      <p className="text-slate-600">{adjustment.reason || "Not yok"}</p>
                      <p className="text-xs text-slate-500">
                        {adjustment.adminName} • {formatDateTime(adjustment.createdAt)}
                      </p>
                    </article>
                  ))}
                  {detail.walletAdjustments.length === 0 ? <p className="text-sm text-slate-500">Son 20 hareket içinde kayıt yok.</p> : null}
                </div>
              </section>

              <section className="rounded-2xl border border-cyan-100 bg-white p-4">
                <h2 className="text-sm font-semibold text-indigo-800">Gönderdiği Hediyeler</h2>
                <div className="mt-3 space-y-2">
                  {detail.sentGifts.map((gift) => (
                    <article key={gift.id} className="rounded-xl border border-cyan-100 px-3 py-2 text-sm">
                      <p className="font-semibold text-slate-800">
                        {gift.giftEmoji} {gift.giftName}
                      </p>
                      <p className="text-slate-600">
                        Oda: {gift.roomId} • {gift.amount} dk
                      </p>
                      <p className="text-xs text-slate-500">{formatDateTime(gift.createdAt)}</p>
                    </article>
                  ))}
                  {detail.sentGifts.length === 0 ? <p className="text-sm text-slate-500">Son 20 gönderim içinde kayıt yok.</p> : null}
                </div>
              </section>

              <section className="rounded-2xl border border-cyan-100 bg-white p-4">
                <h2 className="text-sm font-semibold text-indigo-800">Aldığı Hediyeler</h2>
                <div className="mt-3 space-y-2">
                  {detail.receivedGifts.map((gift) => (
                    <article key={gift.id} className="rounded-xl border border-cyan-100 px-3 py-2 text-sm">
                      <p className="font-semibold text-slate-800">
                        {gift.giftEmoji} {gift.giftName}
                      </p>
                      <p className="text-slate-600">
                        Oda: {gift.roomId} • {gift.amount} dk
                      </p>
                      <p className="text-xs text-slate-500">{formatDateTime(gift.createdAt)}</p>
                    </article>
                  ))}
                  {detail.receivedGifts.length === 0 ? <p className="text-sm text-slate-500">Son 20 alım içinde kayıt yok.</p> : null}
                </div>
              </section>
            </div>

            <section className="mt-4 rounded-2xl border border-cyan-100 bg-white p-4">
              <h2 className="text-sm font-semibold text-indigo-800">Admin İşlem Geçmişi</h2>
              <div className="mt-3 space-y-2">
                {detail.actionLogs.map((log) => (
                  <article key={log.id} className="rounded-xl border border-cyan-100 px-3 py-2 text-sm">
                    <p className="font-semibold text-slate-800">
                      {log.actionType} • {log.adminName}
                    </p>
                    <p className="text-slate-600">{log.description}</p>
                    <p className="font-mono text-xs text-slate-500">{safeMetadata(log.metadata)}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(log.createdAt)}</p>
                  </article>
                ))}
                {detail.actionLogs.length === 0 ? <p className="text-sm text-slate-500">Son 20 işlem içinde kayıt yok.</p> : null}
              </div>
            </section>
          </>
        ) : null}
      </section>
    </AdminLayout>
  );
}
