const features = [
  {
    title: "Genel Odalar",
    description:
      "Yayıncıların canlıya çıktığı, izleyicilerin sohbet ettiği açık yayın alanları.",
  },
  {
    title: "Özel Oda",
    description:
      "Yayıncı ve izleyici arasında davet, kabul/red ve dakika bazlı coin akışı.",
  },
  {
    title: "Coin & Hediye",
    description:
      "Cüzdan, hediye gönderimi ve yayıncı kazançlarının kayıt altına alındığı sistem.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-between px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.35em] text-pink-300">
              Poncik Live
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">
              Mobil öncelikli canlı yayın platformu
            </h1>
          </div>

          <span className="rounded-full border border-pink-400/30 bg-pink-400/10 px-3 py-1 text-xs font-medium text-pink-200">
            MVP kurulumu başladı
          </span>
        </header>

        <div className="py-16 sm:py-24">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
              Genel oda · Özel oda · Coin · Hediye · Admin
            </p>

            <h2 className="text-4xl font-bold tracking-tight sm:text-6xl">
              Canlı yayın, özel oda ve coin ekonomisi tek platformda.
            </h2>

            <p className="mt-6 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
              Poncik Live; yayıncıların oda açabildiği, izleyicilerin sohbet
              edebildiği, özel oda daveti gönderebildiği ve tüm coin
              hareketlerinin güvenli ledger mantığıyla takip edildiği modern
              bir canlı yayın altyapısıdır.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button className="rounded-full bg-pink-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-pink-400">
                Yayına Başla
              </button>
              <button className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                Odaları Keşfet
              </button>
            </div>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-pink-950/20"
              >
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </div>

        <footer className="border-t border-white/10 pt-5 text-xs text-zinc-500">
          Poncik Live MVP · Next.js + TypeScript + Tailwind + Supabase
        </footer>
      </section>
    </main>
  );
}