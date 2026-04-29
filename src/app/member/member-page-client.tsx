"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LiveRoom } from "@/lib/live-rooms";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useRealtimeLiveRooms } from "@/hooks/use-realtime-live-rooms";

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

export default function MemberPageClient({ initialRooms, initialHasError }: MemberPageClientProps) {
  const [errorMessage, setErrorMessage] = useState("");
  const { rooms: liveRooms, warning: liveRoomsWarning } = useRealtimeLiveRooms({
    initialRooms,
    initialHasError,
    limit: 24,
    channelKey: "member",
  });

  useEffect(() => {
    async function checkUser() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = "/login";
        }
      } catch {
        setErrorMessage("Hesap kontrolu su an yapilamadi.");
      }
    }

    checkUser();
  }, []);

  async function handleLogout() {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/login";
    }
  }

  const featuredStreamers = liveRooms.slice(0, 5);
  const showEmptyState = liveRooms.length === 0;

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
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {errorMessage}
            </p>
          ) : null}

          <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-indigo-800">Gunun Populer Yayincilari</h2>
            <div className="mt-4 flex gap-3 overflow-x-auto">
              {featuredStreamers.length > 0 ? (
                featuredStreamers.map((room) => (
                  <Link
                    key={room.id}
                    href={`/rooms/${room.id}`}
                    className="block min-w-[160px] rounded-2xl bg-cyan-50 p-3 transition hover:bg-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
                {liveRooms.map((room) => (
                  <Link
                    key={room.id}
                    href={`/rooms/${room.id}`}
                    className="block rounded-2xl bg-cyan-50 p-3 transition hover:bg-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
    </main>
  );
}
