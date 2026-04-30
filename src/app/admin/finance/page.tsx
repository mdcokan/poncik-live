"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";
import { getSupabaseClient } from "@/app/admin/_lib/supabase";
import { fetchAdminWalletAdjustments, fetchAdminWalletSummaries, type WalletAdjustment, type WalletSummary } from "@/lib/wallets";

type GiftTransactionRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  gift_id: string;
  amount: number;
  created_at: string;
};

type GiftCatalogRow = {
  id: string;
  name: string;
  emoji: string;
};

type ProfileDisplayRow = {
  id: string;
  display_name: string | null;
};

export default function AdminFinancePage() {
  const { loading, authorized, message, signOut } = useAdminAccess();
  const [walletSummaries, setWalletSummaries] = useState<WalletSummary[]>([]);
  const [walletAdjustments, setWalletAdjustments] = useState<WalletAdjustment[]>([]);
  const [giftTransactions, setGiftTransactions] = useState<GiftTransactionRow[]>([]);
  const [amountByUserId, setAmountByUserId] = useState<Record<string, string>>({});
  const [reasonByUserId, setReasonByUserId] = useState<Record<string, string>>({});
  const [submittingUserId, setSubmittingUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [giftNameById, setGiftNameById] = useState<Record<string, string>>({});
  const [profileNameById, setProfileNameById] = useState<Record<string, string>>({});

  async function loadFinanceData() {
    const [summaries, adjustments] = await Promise.all([fetchAdminWalletSummaries(50), fetchAdminWalletAdjustments(50)]);
    setWalletSummaries(summaries);
    setWalletAdjustments(adjustments);

    const supabase = getSupabaseClient();
    const { data: giftRows } = await supabase
      .from("gift_transactions")
      .select("id, sender_id, receiver_id, gift_id, amount, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    const transactions = (giftRows as GiftTransactionRow[] | null) ?? [];
    setGiftTransactions(transactions);

    const giftIds = Array.from(new Set(transactions.map((row) => row.gift_id)));
    const profileIds = Array.from(new Set(transactions.flatMap((row) => [row.sender_id, row.receiver_id])));

    const [{ data: giftCatalogRows }, { data: profileRows }] = await Promise.all([
      giftIds.length
        ? supabase.from("gift_catalog").select("id, name, emoji").in("id", giftIds)
        : Promise.resolve({ data: [] as GiftCatalogRow[] }),
      profileIds.length
        ? supabase.from("profiles").select("id, display_name").in("id", profileIds)
        : Promise.resolve({ data: [] as ProfileDisplayRow[] }),
    ]);

    const nextGiftMap: Record<string, string> = {};
    for (const giftRow of (giftCatalogRows as GiftCatalogRow[] | null) ?? []) {
      nextGiftMap[giftRow.id] = `${giftRow.emoji} ${giftRow.name}`;
    }
    setGiftNameById(nextGiftMap);

    const nextProfileMap: Record<string, string> = {};
    for (const profileRow of (profileRows as ProfileDisplayRow[] | null) ?? []) {
      nextProfileMap[profileRow.id] = profileRow.display_name?.trim() || "Uye";
    }
    setProfileNameById(nextProfileMap);
  }

  useEffect(() => {
    if (!authorized) {
      return;
    }
    void loadFinanceData();
  }, [authorized]);

  const totalWalletBalance = useMemo(
    () => walletSummaries.reduce((total, walletSummary) => total + walletSummary.balance, 0),
    [walletSummaries],
  );

  const todayGiftStats = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    let totalAmount = 0;
    let totalCount = 0;
    for (const transaction of giftTransactions) {
      const createdAtMs = new Date(transaction.created_at).getTime();
      if (Number.isFinite(createdAtMs) && createdAtMs >= todayStartMs) {
        totalAmount += transaction.amount;
        totalCount += 1;
      }
    }
    return { totalAmount, totalCount };
  }, [giftTransactions]);

  async function submitAdjustment(userId: string, multiplier: 1 | -1) {
    const rawAmount = Number.parseInt(amountByUserId[userId] ?? "", 10);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      setFeedback({ type: "error", message: "Miktar 0'dan buyuk bir tam sayi olmali." });
      return;
    }

    try {
      setSubmittingUserId(userId);
      setFeedback(null);
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setFeedback({ type: "error", message: "Oturum bulunamadi. Tekrar giris yap." });
        return;
      }

      const response = await fetch("/api/admin/wallets/adjust", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId,
          amount: rawAmount * multiplier,
          reason: reasonByUserId[userId]?.trim() || null,
        }),
      });

      const payload = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) {
        setFeedback({ type: "error", message: payload.message || "Coin duzenleme basarisiz oldu." });
        return;
      }

      setAmountByUserId((previous) => ({ ...previous, [userId]: "" }));
      setReasonByUserId((previous) => ({ ...previous, [userId]: "" }));
      setFeedback({ type: "success", message: "Coin duzenleme basariyla kaydedildi." });
      await loadFinanceData();
    } catch {
      setFeedback({ type: "error", message: "Coin duzenleme basarisiz oldu." });
    } finally {
      setSubmittingUserId(null);
    }
  }

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout
      title="Kazanc / Finans"
      description="Gelir, gider, coin hareketleri ve yayinci kazanclari."
      onLogout={signOut}
    >
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Toplam wallet bakiye</p>
          <p className="mt-2 text-2xl font-bold text-indigo-800">{totalWalletBalance} coin</p>
        </article>
        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Bugunku gift coin</p>
          <p className="mt-2 text-2xl font-bold text-indigo-800">{todayGiftStats.totalAmount} coin</p>
        </article>
        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Bugunku gift adedi</p>
          <p className="mt-2 text-2xl font-bold text-indigo-800">{todayGiftStats.totalCount}</p>
        </article>
      </section>

      {feedback ? (
        <p
          className={`rounded-2xl border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-indigo-800">Manuel coin yukleme / dusme</h2>
        <p className="mt-1 text-sm text-slate-500">Maksimum 50 kullanici listelenir.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="px-3 py-2 font-semibold">Kullanici</th>
                <th className="px-3 py-2 font-semibold">Rol</th>
                <th className="px-3 py-2 font-semibold">Bakiye</th>
                <th className="px-3 py-2 font-semibold">Miktar</th>
                <th className="px-3 py-2 font-semibold">Not</th>
                <th className="px-3 py-2 font-semibold">Islem</th>
              </tr>
            </thead>
            <tbody>
              {walletSummaries.map((walletSummary) => (
                <tr key={walletSummary.userId} data-testid={`wallet-row-${walletSummary.userId}`} className="border-t border-cyan-100">
                  <td className="px-3 py-3 text-slate-700">
                    <p className="font-semibold text-slate-800">{walletSummary.displayName}</p>
                    <p className="text-xs text-slate-500">{walletSummary.userId}</p>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{walletSummary.role}</td>
                  <td className="px-3 py-3 font-semibold text-indigo-700">{walletSummary.balance} coin</td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min={1}
                      value={amountByUserId[walletSummary.userId] ?? ""}
                      onChange={(event) =>
                        setAmountByUserId((previous) => ({
                          ...previous,
                          [walletSummary.userId]: event.target.value,
                        }))
                      }
                      className="w-28 rounded-xl border border-cyan-200 px-3 py-2 text-sm outline-none"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="text"
                      maxLength={300}
                      placeholder="Test bakiye"
                      value={reasonByUserId[walletSummary.userId] ?? ""}
                      onChange={(event) =>
                        setReasonByUserId((previous) => ({
                          ...previous,
                          [walletSummary.userId]: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-cyan-200 px-3 py-2 text-sm outline-none"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={submittingUserId === walletSummary.userId}
                        onClick={() => void submitAdjustment(walletSummary.userId, 1)}
                        className="rounded-xl bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-200 disabled:opacity-60"
                      >
                        Coin Ekle
                      </button>
                      <button
                        type="button"
                        disabled={submittingUserId === walletSummary.userId}
                        onClick={() => void submitAdjustment(walletSummary.userId, -1)}
                        className="rounded-xl bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-200 disabled:opacity-60"
                      >
                        Coin Dus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-indigo-800">Son gift islemleri</h2>
        <div className="mt-4 space-y-2">
          {giftTransactions.slice(0, 20).map((giftTransaction) => (
            <article key={giftTransaction.id} className="rounded-2xl border border-cyan-100 px-4 py-3 text-sm">
              <p className="font-semibold text-slate-800">
                {profileNameById[giftTransaction.sender_id] ?? "Uye"} →{" "}
                {profileNameById[giftTransaction.receiver_id] ?? "Yayinci"} | {giftNameById[giftTransaction.gift_id] ?? "🎁 Hediye"}
              </p>
              <p className="text-slate-500">
                {giftTransaction.amount} coin • {new Date(giftTransaction.created_at).toLocaleString("tr-TR")}
              </p>
            </article>
          ))}
          {giftTransactions.length === 0 ? <p className="text-sm text-slate-500">Henuz gift islemi yok.</p> : null}
        </div>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-indigo-800">Son wallet adjustment kayitlari</h2>
        <div className="mt-4 space-y-2">
          {walletAdjustments.map((walletAdjustment) => (
            <article key={walletAdjustment.id} className="rounded-2xl border border-cyan-100 px-4 py-3 text-sm">
              <p className="font-semibold text-slate-800">
                {walletAdjustment.displayName} • {walletAdjustment.amount > 0 ? "+" : ""}
                {walletAdjustment.amount} coin
              </p>
              <p className="text-slate-500">
                {walletAdjustment.reason || "Not yok"} • {new Date(walletAdjustment.createdAt).toLocaleString("tr-TR")}
              </p>
            </article>
          ))}
          {walletAdjustments.length === 0 ? <p className="text-sm text-slate-500">Henuz adjustment kaydi yok.</p> : null}
        </div>
      </section>
    </AdminLayout>
  );
}
