import Link from "next/link";

const rooms = [
  {
    title: "Genel Sohbet",
    status: "Yakında",
    description: "Yayıncıların canlıya çıkacağı, izleyicilerin sohbet edeceği açık oda alanı.",
  },
  {
    title: "Özel Oda",
    status: "Planlandı",
    description: "Yayıncı ve izleyici arasında davet, kabul/red ve dakika bazlı coin akışı.",
  },
  {
    title: "Coin & Hediye",
    status: "Planlandı",
    description: "Hediye gönderimi, cüzdan hareketleri ve yayıncı kazanç takibi.",
  },
];

export default function RoomsPage() {
  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white">
      <section className="mx-auto w-full max-w-5xl">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-pink-950/20">
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-pink-300">
            Poncik Live
          </p>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Odaları Keşfet
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                Bu ekran MVP oda deneyiminin başlangıcıdır. Önce sade ve hızlı bir liste
                kuruyoruz; sonra canlı oda, özel oda ve coin akışını kontrollü şekilde ekleyeceğiz.
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

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {rooms.map((room) => (
            <article
              key={room.title}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold">{room.title}</h2>
                <span className="rounded-full border border-pink-400/30 bg-pink-400/10 px-3 py-1 text-xs font-semibold text-pink-200">
                  {room.status}
                </span>
              </div>

              <p className="mt-4 text-sm leading-6 text-zinc-400">
                {room.description}
              </p>

              <button
                type="button"
                disabled
                className="mt-5 w-full rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-500"
              >
                Çok yakında
              </button>
            </article>
          ))}
        </div>

        <Link
          href="/"
          className="mt-6 inline-flex rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Ana sayfaya dön
        </Link>
      </section>
    </main>
  );
}
