"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

export default function StudioPage() {
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
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

  async function handleStartLive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!ownerId) {
      setStatus("error");
      setMessage("Yayın başlatmak için giriş yapmalısın.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const supabase = getSupabase();

      const finalTitle =
        title.trim().length >= 3
          ? title.trim()
          : `${displayName ?? "Yayıncı"} canlı yayında`;

      const { error } = await supabase.from("rooms").insert({
        owner_id: ownerId,
        title: finalTitle,
        description: "Genel canlı yayın odası",
        status: "live",
        is_private: false,
      });

      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }

      setStatus("success");
      setMessage("Canlı yayın başlatıldı. Online odalara yönlendiriliyorsun...");
      window.location.href = "/rooms";
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Beklenmeyen hata oluştu.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-5 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-pink-950/20">
        <p className="text-xs font-medium uppercase tracking-[0.35em] text-pink-300">
          Poncik Live
        </p>

        <h1 className="mt-4 text-3xl font-bold tracking-tight">Yayını Başlat</h1>

        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Yayını başlattığında sistem senin canlı yayın odanı otomatik açar.
          İzleyiciler seni Odaları Keşfet ekranında online olarak görür.
        </p>

        {loadingUser ? (
          <p className="mt-8 text-sm text-zinc-300">Kullanıcı kontrol ediliyor...</p>
        ) : (
          <form onSubmit={handleStartLive} className="mt-8 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-zinc-300">
                Yayın başlığı
              </span>
              <input
                type="text"
                minLength={3}
                maxLength={80}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Örn: Akşam sohbeti"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-pink-400"
              />
            </label>

            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full rounded-full bg-pink-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "loading" ? "Yayın başlatılıyor..." : "Canlı yayını başlat"}
            </button>
          </form>
        )}

        {message ? (
          <p
            className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
              status === "success"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : "border-red-400/30 bg-red-400/10 text-red-200"
            }`}
          >
            {message}
          </p>
        ) : null}

        <Link
          href="/rooms"
          className="mt-6 inline-flex rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Online yayıncıları gör
        </Link>
      </section>
    </main>
  );
}
