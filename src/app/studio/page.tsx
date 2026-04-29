"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function StudioPage() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [mutedStart, setMutedStart] = useState(false);
  const [mirrorVideo, setMirrorVideo] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  function getSupabase() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase ortam değişkenleri eksik.");
    }

    return createClient(supabaseUrl, supabaseAnonKey);
  }

  useEffect(() => {
    async function loadUser() {
      try {
        const supabase = getSupabase();

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          window.location.href = "/login";
          return;
        }

        setOwnerId(user.id);

        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", user.id)
          .single();

        setDisplayName(profile?.display_name ?? user.email ?? "Yayıncı");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Beklenmeyen hata oluştu.");
      } finally {
        setLoadingUser(false);
      }
    }

    loadUser();
  }, []);

  async function handleStartLive() {
    if (!ownerId) {
      setStatus("error");
      setMessage("Yayın başlatmak için giriş yapmalısın.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const supabase = getSupabase();

      const finalTitle = `${displayName ?? "Yayıncı"} canlı yayında`;

      const { error } = await supabase.from("rooms").insert({
        owner_id: ownerId,
        title: finalTitle,
        description: mutedStart
          ? "Genel canlı yayın odası - ses kapalı başlatıldı"
          : "Genel canlı yayın odası",
        status: "live",
        is_private: false,
      });

      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }

      setStatus("success");
      setMessage("Yayın genel odada başlatıldı. Online yayıncılar ekranına yönlendiriliyorsun...");
      window.location.href = "/rooms";
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Beklenmeyen hata oluştu.");
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-lg font-black tracking-tight text-white">
            Poncik<span className="text-pink-400">Live</span>
          </Link>

          <span className="rounded-full bg-yellow-300 px-3 py-1 text-xs font-black text-black">
            Genel
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/rooms"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
          >
            Online yayıncılar
          </Link>
          <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-black">
            0 coin
          </span>
        </div>
      </header>

      <section className="grid min-h-[calc(100vh-57px)] grid-cols-1 lg:grid-cols-[1fr_430px]">
        <div className="flex flex-col border-r border-emerald-500/50">
          <div className="relative flex min-h-[520px] flex-1 items-center justify-center bg-zinc-950">
            <div className="absolute left-4 top-4 flex items-center gap-2">
              <span className="rounded bg-yellow-300 px-3 py-1 text-sm font-black text-black">
                Genel
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-zinc-300">
                Kamera önizleme yakında
              </span>
            </div>

            <div
              className={`flex h-full min-h-[520px] w-full items-center justify-center bg-gradient-to-br from-zinc-950 via-black to-pink-950/20 ${
                mirrorVideo ? "scale-x-[-1]" : ""
              }`}
            >
              <div className="rounded-3xl border border-white/10 bg-black/50 p-8 text-center">
                <p className="text-xs font-medium uppercase tracking-[0.35em] text-pink-300">
                  Poncik Live
                </p>
                <h1 className="mt-4 text-3xl font-black">Yayıncı Paneli</h1>
                <p className="mt-3 max-w-md text-sm leading-6 text-zinc-400">
                  Kamera preview ve gerçek canlı yayın akışını bir sonraki katmanda ekleyeceğiz.
                  Şimdilik yayın odası oluşturma, sohbet alanı ve yayıncı panel düzenini kuruyoruz.
                </p>
              </div>
            </div>

            <div className="absolute bottom-4 left-4 right-4 rounded-3xl bg-zinc-300/90 p-4 text-black shadow-2xl">
              <h2 className="text-sm font-black text-white drop-shadow">Kamera Ayarları</h2>

              <div className="mt-3 grid gap-3">
                <label className="grid gap-1 text-sm font-semibold text-white drop-shadow sm:grid-cols-[140px_1fr] sm:items-center">
                  Kamera
                  <select className="rounded-full border border-black/10 bg-white px-4 py-3 text-black outline-none">
                    <option>Kamera seçiniz</option>
                    <option>Varsayılan kamera</option>
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-semibold text-white drop-shadow sm:grid-cols-[140px_1fr] sm:items-center">
                  Mikrofon
                  <select className="rounded-full border border-black/10 bg-white px-4 py-3 text-black outline-none">
                    <option>Mikrofonsuz devam et</option>
                    <option>Varsayılan mikrofon</option>
                  </select>
                </label>

                <label className="flex items-center gap-3 text-sm font-semibold text-white drop-shadow">
                  <input
                    type="checkbox"
                    checked={mutedStart}
                    onChange={(event) => setMutedStart(event.target.checked)}
                    className="h-5 w-5"
                  />
                  Yayını ses kapalı olarak başlat
                </label>

                <label className="flex items-center gap-3 text-sm font-semibold text-white drop-shadow">
                  <input
                    type="checkbox"
                    checked={mirrorVideo}
                    onChange={(event) => setMirrorVideo(event.target.checked)}
                    className="h-5 w-5"
                  />
                  Video aynalama aktif/pasif
                </label>

                <button
                  type="button"
                  onClick={handleStartLive}
                  disabled={loadingUser || status === "loading"}
                  className="rounded-full bg-emerald-400 px-6 py-3 text-sm font-black text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === "loading" ? "Yayın başlatılıyor..." : "YAYINA BAŞLA"}
                </button>
              </div>

              {message ? (
                <p
                  className={`mt-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                    status === "success"
                      ? "border-emerald-700 bg-emerald-100 text-emerald-900"
                      : "border-red-700 bg-red-100 text-red-900"
                  }`}
                >
                  {message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2 border-t border-white/10 bg-white/[0.03] p-2 sm:grid-cols-3">
            <button className="rounded-full bg-yellow-400 px-4 py-3 text-sm font-black text-black">
              CANLI DESTEK
            </button>
            <button className="rounded-full bg-orange-400 px-4 py-3 text-sm font-black text-white">
              HEDİYE LİSTESİ
            </button>
            <button className="rounded-full bg-rose-500 px-4 py-3 text-sm font-black text-white">
              MESAJLARIM
            </button>
          </div>
        </div>

        <aside className="flex min-h-[560px] flex-col bg-white text-zinc-900">
          <div className="grid grid-cols-2 border-b border-pink-300 text-center text-pink-500">
            <button className="border-b-2 border-pink-500 py-4 text-sm font-black">
              Sohbet
            </button>
            <button className="py-4 text-sm font-black">Hediye</button>
          </div>

          <div className="border-b border-pink-300 px-5 py-4 text-center text-lg font-black text-pink-500">
            Odadakiler
          </div>

          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-zinc-400">
            Yayın başladığında izleyiciler, sohbet ve hediye olayları burada görünecek.
          </div>

          <div className="border-t border-zinc-200 p-3">
            <div className="flex items-center gap-2 rounded-full bg-zinc-200 px-3 py-2">
              <span className="rounded bg-white px-2 py-1 text-sm font-black">A-</span>
              <span className="rounded bg-white px-2 py-1 text-sm font-black">A+</span>
              <input
                disabled
                placeholder="Mesajınızı buraya yazınız..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500"
              />
              <span className="text-2xl">🙂</span>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
