"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

type AdminRole = "viewer" | "streamer" | "admin" | "owner";

const adminCards = [
  "Uyeler",
  "Yayincilar",
  "Online Odalar",
  "Coin / Odeme",
  "Sikayet / Ban",
  "Duyurular",
  "Sistem Ayarlari",
];

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase ortam degiskenleri eksik.");
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function checkAccess() {
      try {
        const supabase = getSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setMessage("Yetkisiz erisim.");
          setLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single<{ role: AdminRole }>();

        if (profile?.role === "admin" || profile?.role === "owner") {
          setAuthorized(true);
        } else {
          setMessage("Yetkisiz erisim.");
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Beklenmeyen bir hata olustu.");
      } finally {
        setLoading(false);
      }
    }

    checkAccess();
  }, []);

  return (
    <main className="min-h-screen bg-cyan-100 px-4 py-6 text-slate-800 sm:px-6">
      <section className="mx-auto w-full max-w-6xl rounded-3xl bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-pink-500">Poncik Live</p>
        <h1 className="mt-4 text-3xl font-bold text-indigo-800">Admin Panel</h1>

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Yetkiler kontrol ediliyor...</p>
        ) : null}

        {!loading && !authorized ? (
          <p className="mt-6 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600">
            {message || "Yetkisiz erisim"}
          </p>
        ) : null}

        {!loading && authorized ? (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {adminCards.map((card) => (
              <article key={card} className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
                <h2 className="font-semibold text-indigo-700">{card}</h2>
                <p className="mt-2 text-sm text-slate-500">Placeholder panel karti</p>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
