"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, useState } from "react";

export default function SignupPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      setStatus("error");
      setMessage("Supabase ortam değişkenleri eksik.");
      return;
    }

    setStatus("loading");
    setMessage("");

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("success");
    setMessage("Kayıt başarılı. Profile yönlendiriliyorsun...");
    window.location.href = "/profile";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-5 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-pink-950/20">
        <p className="text-xs font-medium uppercase tracking-[0.35em] text-pink-300">
          Poncik Live
        </p>

        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          Yeni hesap oluştur
        </h1>

        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Yayınlara katılmak, profil oluşturmak ve odaları keşfetmek için kayıt ol.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-zinc-300">Ad / Görünen ad</span>
            <input
              type="text"
              required
              minLength={2}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Poncik kullanıcı adı"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-pink-400"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-300">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ornek@email.com"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-pink-400"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-300">Şifre</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="En az 6 karakter"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-pink-400"
            />
          </label>

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-full bg-pink-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading" ? "Kayıt oluşturuluyor..." : "Kayıt ol"}
          </button>
        </form>

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

        <p className="mt-6 text-center text-sm text-zinc-400">
          Zaten hesabın var mı?{" "}
          <Link href="/login" className="font-semibold text-pink-300">
            Giriş yap
          </Link>
        </p>
      </section>
    </main>
  );
}
