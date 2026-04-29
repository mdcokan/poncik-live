"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, useState } from "react";

export default function SignupPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
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

    if (password !== passwordRepeat) {
      setStatus("error");
      setMessage("Sifreler eslesmiyor.");
      return;
    }

    setStatus("loading");
    setMessage("");

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data, error } = await supabase.auth.signUp({
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
    const needsConfirmation = !data.session;
    setMessage(
      needsConfirmation
        ? "Kayit tamamlandi. Mail onayi gerekebilir."
        : "Kayit basarili. Uye paneline yonlendiriliyorsun...",
    );

    window.location.href = "/member";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-cyan-100 px-4 py-4 text-slate-800 sm:px-6">
      <section className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-pink-500">Poncik Live</p>
        <h1 className="mt-4 text-3xl font-bold text-indigo-800">Hesap olustur</h1>
        <p className="mt-2 text-sm text-slate-500">ve bu renkli dunyaya ilk adimini at!</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-600">Kullanici adi / gorunen ad</span>
            <input
              type="text"
              required
              minLength={2}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Poncik kullanici adi"
              className="mt-2 w-full rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm outline-none transition focus:border-pink-400"
            />
          </label>

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

          <label className="block">
            <span className="text-sm font-medium text-slate-600">Sifre tekrar</span>
            <input
              type="password"
              required
              minLength={6}
              value={passwordRepeat}
              onChange={(event) => setPasswordRepeat(event.target.value)}
              placeholder="Sifreni tekrar gir"
              className="mt-2 w-full rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm outline-none transition focus:border-pink-400"
            />
          </label>

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-full bg-pink-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading" ? "Kayit olusturuluyor..." : "Kayit Ol"}
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
          Zaten hesabin var mi?{" "}
          <Link href="/login" className="font-semibold text-pink-600">
            Uye girisi
          </Link>
        </p>
      </section>
    </main>
  );
}
