import Link from "next/link";
import { fetchLiveRooms, formatUpdatedAtShort } from "@/lib/live-rooms";

export default async function RoomsPage() {
  const { rooms: liveRooms, hasError } = await fetchLiveRooms(24);

  return (
    <main className="min-h-screen bg-cyan-100 px-4 py-6 text-slate-800 sm:px-6">
      <section className="mx-auto w-full max-w-5xl">
        <div className="rounded-3xl border border-pink-100 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-pink-400">Poncik Live</p>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-indigo-800 sm:text-4xl">
                Online Yayincilar
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                Canli odalar en guncel aktiviteye gore listelenir. Yayin bitince liste otomatik olarak
                sade bir sekilde bosalir.
              </p>
            </div>

            <Link
              href="/profile"
              className="inline-flex rounded-full bg-pink-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-pink-400"
            >
              Profilime git
            </Link>
          </div>
        </div>

        {liveRooms.length > 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {liveRooms.map((room) => (
              <article key={room.id} className="rounded-3xl border border-cyan-100 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold text-slate-800">{room.streamerName}</h2>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-rose-100 px-3 py-1 text-[11px] font-bold text-rose-700">
                      CANLI
                    </span>
                    <span className="rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-bold text-indigo-700">
                      HD
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-500">{formatUpdatedAtShort(room.updatedAt)}</p>

                <button
                  type="button"
                  disabled
                  className="mt-5 w-full rounded-full border border-indigo-100 bg-indigo-50 px-5 py-3 text-sm font-semibold text-indigo-400"
                >
                  Odaya gir
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-cyan-100 bg-white p-6 text-center shadow-sm">
            <p className="text-base font-semibold text-indigo-700">Su an canli yayin yok</p>
            <p className="mt-2 text-sm text-slate-500">Yayincilar online oldugunda burada gorunecek.</p>
            {hasError ? <p className="mt-3 text-xs text-slate-400">Canli liste su an yenilenemedi.</p> : null}
          </div>
        )}

        <Link
          href="/"
          className="mt-6 inline-flex rounded-full border border-indigo-100 bg-white px-5 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
        >
          Ana sayfaya dön
        </Link>
      </section>
    </main>
  );
}
