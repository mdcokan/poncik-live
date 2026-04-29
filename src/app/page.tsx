import Link from "next/link";
import { fetchLiveRooms } from "@/lib/live-rooms";

const sidebarLinks = [
  { label: "Uye Girisi", href: "/login" },
  { label: "Kayit Ol", href: "/signup" },
  { label: "Yayinci Girisi", href: "/streamer-login" },
  { label: "Canli Destek", href: "#" },
];

export default async function HomePage() {
  const { rooms: liveRooms, hasError } = await fetchLiveRooms(24);
  const featuredStreamers = liveRooms.slice(0, 5);

  return (
    <main className="min-h-screen bg-cyan-100 text-slate-800">
      <header className="border-b border-indigo-200 bg-gradient-to-r from-indigo-600 to-sky-500 px-4 py-4 text-white sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-pink-200">Poncik Live</p>
            <h1 className="mt-1 text-lg font-semibold sm:text-xl">Misafir Ana Ekran</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">0 dk</span>
            <button
              type="button"
              className="h-8 w-8 rounded-full bg-pink-400 text-lg font-bold leading-none text-white"
            >
              +
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[250px_1fr]">
        <aside className="rounded-3xl bg-gradient-to-b from-indigo-700 to-violet-700 p-4 text-white shadow-lg">
          <h2 className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-pink-200">
            Menu
          </h2>
          <nav className="mt-3 space-y-2">
            {sidebarLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="block rounded-2xl bg-white/10 px-4 py-3 text-sm font-medium transition hover:bg-white/20"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <div className="space-y-4">
          <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-indigo-800">Gunun Populer Yayincilari</h2>
              <span className="rounded-full bg-pink-100 px-3 py-1 text-xs font-semibold text-pink-600">
                trend
              </span>
            </div>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
              {featuredStreamers.length > 0 ? (
                featuredStreamers.map((room) => (
                  <article
                    key={room.id}
                    className="min-w-[160px] rounded-2xl border border-cyan-100 bg-cyan-50 p-3"
                  >
                    <div className="h-14 w-14 rounded-full bg-gradient-to-br from-pink-300 to-violet-400" />
                    <p className="mt-3 text-sm font-semibold text-slate-700">{room.streamerName}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      <span className="text-xs text-slate-500">canli</span>
                      <span className="ml-auto rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                        HD
                      </span>
                    </div>
                  </article>
                ))
              ) : (
                <div className="w-full rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-5 text-sm text-slate-600">
                  <p className="font-semibold text-indigo-700">Su an canli yayin yok</p>
                  <p className="mt-1 text-slate-500">Yayincilar online oldugunda burada gorunecek.</p>
                  {hasError ? (
                    <p className="mt-2 text-xs text-slate-400">Canli liste simdilik yenilenemedi.</p>
                  ) : null}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-indigo-800">Online Yayincilar</h2>
            {liveRooms.length > 0 ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {liveRooms.map((room) => (
                  <article key={room.id} className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3">
                    <div className="h-16 rounded-xl bg-gradient-to-br from-indigo-300 to-pink-300" />
                    <p className="mt-3 text-sm font-semibold text-slate-700">{room.streamerName}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      <span className="text-xs text-slate-500">canli</span>
                      <span className="ml-auto rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                        HD
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-5 text-sm text-slate-600">
                <p className="font-semibold text-indigo-700">Su an canli yayin yok</p>
                <p className="mt-1 text-slate-500">Yayincilar online oldugunda burada gorunecek.</p>
                {hasError ? (
                  <p className="mt-2 text-xs text-slate-400">Canli liste simdilik yenilenemedi.</p>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

