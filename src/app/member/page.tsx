"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useState } from "react";

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

const featuredStreamers = ["LunaMavi", "NoraGlow", "PapatyaLive", "MiraSohbet"];
const onlineStreamers = ["RoseMoon", "LilaWave", "MintQueen", "NehirTalk", "VioletSky", "CosmoAda"];

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase ortam degiskenleri eksik.");
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

export default function MemberPage() {
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function checkUser() {
      try {
        const supabase = getSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = "/login";
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Beklenmeyen bir hata olustu.");
      }
    }

    checkUser();
  }, []);

  async function handleLogout() {
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <main className="min-h-screen bg-cyan-100 px-4 py-4 text-slate-800 sm:px-6">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-3xl bg-gradient-to-b from-indigo-700 to-violet-700 p-4 text-white">
          <h2 className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-pink-200">
            Uye Paneli
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
            <h1 className="text-xl font-semibold text-indigo-800">Uye Ana Ekran</h1>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-700">
                0 dk
              </span>
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

          <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-indigo-800">Gunun Populer Yayincilari</h2>
            <div className="mt-4 flex gap-3 overflow-x-auto">
              {featuredStreamers.map((name) => (
                <article key={name} className="min-w-[160px] rounded-2xl bg-cyan-50 p-3">
                  <div className="h-14 w-14 rounded-full bg-gradient-to-br from-pink-300 to-violet-400" />
                  <p className="mt-3 text-sm font-semibold">{name}</p>
                  <p className="mt-1 text-xs text-emerald-600">online • HD</p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-indigo-800">Online Yayincilar</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {onlineStreamers.map((name) => (
                <article key={name} className="rounded-2xl bg-cyan-50 p-3">
                  <div className="h-16 rounded-xl bg-gradient-to-br from-indigo-300 to-pink-300" />
                  <p className="mt-3 text-sm font-semibold">{name}</p>
                  <p className="mt-1 text-xs text-emerald-600">canli • HD</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
