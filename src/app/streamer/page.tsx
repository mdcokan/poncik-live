"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useState } from "react";

type UserRole = "viewer" | "streamer" | "admin" | "owner";

const menuItems = [
  { label: "Online OL", href: "/studio" },
  { label: "Mesajlarim", href: "#" },
  { label: "Ozel Oda Kazanclarim", href: "#" },
  { label: "Yayin Ozetim", href: "#" },
  { label: "Profil Guncelle", href: "/profile" },
  { label: "Engellediklerim", href: "#" },
  { label: "Sifre Degistir", href: "#" },
  { label: "Duyurular", href: "#" },
  { label: "Yayin Kurallari", href: "#" },
  { label: "Canli Destek", href: "#" },
];

type GiftSummaryRow = {
  id: string;
  sender_id: string;
  gift_id: string;
  amount: number;
  created_at: string;
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
  const [errorMessage, setErrorMessage] = useState("");
  const [streamerId, setStreamerId] = useState<string | null>(null);
  const [todayGiftTotal, setTodayGiftTotal] = useState(0);
  const [overallGiftTotal, setOverallGiftTotal] = useState(0);
  const [recentGifts, setRecentGifts] = useState<
    Array<{ id: string; senderName: string; giftName: string; amount: number; createdAt: string }>
  >([]);

  useEffect(() => {
    async function checkRole() {
      try {
        const supabase = getSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = "/streamer-login";
          return;
        }
        setStreamerId(user.id);

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single<{ role: UserRole }>();

        if (profile?.role === "viewer") {
          window.location.href = "/member";
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Beklenmeyen bir hata olustu.");
      }
    }

    checkRole();
  }, []);

  useEffect(() => {
    async function loadGiftSummary() {
      if (!streamerId) {
        return;
      }
      try {
        const supabase = getSupabaseClient();
        const { data: giftRows } = await supabase
          .from("gift_transactions")
          .select("id, sender_id, gift_id, amount, created_at")
          .eq("receiver_id", streamerId)
          .order("created_at", { ascending: false })
          .limit(20);

        const rows = (giftRows as GiftSummaryRow[] | null) ?? [];
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStartMs = todayStart.getTime();
        let todayTotal = 0;
        let total = 0;
        for (const row of rows) {
          total += row.amount;
          if (new Date(row.created_at).getTime() >= todayStartMs) {
            todayTotal += row.amount;
          }
        }
        setTodayGiftTotal(todayTotal);
        setOverallGiftTotal(total);

        const senderIds = Array.from(new Set(rows.map((row) => row.sender_id)));
        const giftIds = Array.from(new Set(rows.map((row) => row.gift_id)));
        const [{ data: senders }, { data: gifts }] = await Promise.all([
          senderIds.length
            ? supabase.from("profiles").select("id, display_name").in("id", senderIds)
            : Promise.resolve({ data: [] }),
          giftIds.length ? supabase.from("gift_catalog").select("id, name, emoji").in("id", giftIds) : Promise.resolve({ data: [] }),
        ]);

        const senderNameById = new Map<string, string>(
          (((senders ?? []) as Array<{ id: string; display_name: string | null }>).map((row) => [
            row.id,
            row.display_name?.trim() || "Uye",
          ])),
        );
        const giftById = new Map<string, string>(
          (((gifts ?? []) as Array<{ id: string; name: string; emoji: string }>).map((row) => [row.id, `${row.emoji} ${row.name}`])),
        );
        setRecentGifts(
          rows.map((row) => ({
            id: row.id,
            senderName: senderNameById.get(row.sender_id) ?? "Uye",
            giftName: giftById.get(row.gift_id) ?? "🎁 Hediye",
            amount: row.amount,
            createdAt: row.created_at,
          })),
        );
      } catch {
        setTodayGiftTotal(0);
        setOverallGiftTotal(0);
        setRecentGifts([]);
      }
    }
    void loadGiftSummary();
  }, [streamerId]);

  async function handleLogout() {
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/streamer-login";
    }
  }

  return (
    <main className="min-h-screen bg-cyan-100 px-4 py-4 text-slate-800 sm:px-6">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-3xl bg-gradient-to-b from-indigo-700 to-violet-700 p-4 text-white">
          <h2 className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-pink-200">
            Yayinci Paneli
          </h2>
          <nav className="mt-3 space-y-2">
            {menuItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="block rounded-2xl bg-white/10 px-4 py-2.5 text-sm transition hover:bg-white/20"
              >
                {item.label}
              </Link>
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
          <header className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <h1 className="text-xl font-semibold text-indigo-800">Yayinci Ana Ekran</h1>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-700">0 dk</span>
              <button type="button" className="h-8 w-8 rounded-full bg-pink-400 text-white">
                +
              </button>
            </div>
          </header>

          {errorMessage ? (
            <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600">
              {errorMessage}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-sm font-semibold text-slate-500">Bugunku gelen hediye</h2>
              <p className="mt-2 text-3xl font-bold text-indigo-800">{todayGiftTotal} dk</p>
            </article>
            <article className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-sm font-semibold text-slate-500">Toplam gelen hediye</h2>
              <p className="mt-2 text-3xl font-bold text-indigo-800">{overallGiftTotal} dk</p>
            </article>
          </div>

          <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-indigo-800">Son gelen hediyeler</h2>
            <div className="mt-4 space-y-2">
              {recentGifts.map((gift) => (
                <article key={gift.id} className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3">
                  <p className="text-sm font-semibold text-slate-800">
                    {gift.senderName} {gift.giftName} gonderdi
                  </p>
                  <p className="text-xs text-slate-500">
                    {gift.amount} dk • {new Date(gift.createdAt).toLocaleString("tr-TR")}
                  </p>
                </article>
              ))}
              {recentGifts.length === 0 ? (
                <p className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm text-slate-500">
                  Henuz hediye kaydi yok.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
