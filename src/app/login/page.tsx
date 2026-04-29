"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, useState } from "react";

const sidebarLinks = [
  { label: "Uye Girisi", href: "/login" },
  { label: "Kayit Ol", href: "/signup" },
  { label: "Yayinci Girisi", href: "/streamer-login" },
  { label: "Canli Destek", href: "#" },
];

export default function LoginPage() {
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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("success");
    setMessage("Giris basarili. Uye paneline yonlendiriliyorsun...");
    window.location.href = "/member";
  }

  return (
    <main className="min-h-screen bg-cyan-100 px-4 py-4 text-slate-800 sm:px-6">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-3xl bg-gradient-to-b from-indigo-700 to-violet-700 p-4 text-white">
          <h2 className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-pink-200">
            Giris Menu
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

        <section className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-pink-500">Poncik Live</p>
          <h1 className="mt-4 text-3xl font-bold text-indigo-800">Uye girisi yap</h1>
          <p className="mt-2 text-sm text-slate-500">ve keyifli sohbetlerin tadini cikar!</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-600">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ornek@email.com"
                className="mt-2 w-full rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm outline-none transition focus:border-pink-400"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-600">Sifre</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="En az 6 karakter"
                className="mt-2 w-full rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm outline-none transition focus:border-pink-400"
              />
            </label>

            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full rounded-full bg-pink-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "loading" ? "Giris yapiliyor..." : "Giris Yap"}
            </button>
          </form>

          {message ? (
            <p
              className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                status === "success"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-red-300 bg-red-50 text-red-600"
              }`}
            >
              {message}
            </p>
          ) : null}

          <p className="mt-6 text-sm text-slate-500">
            Hesabin yok mu?{" "}
            <Link href="/signup" className="font-semibold text-pink-600">
              Kayit ol
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
