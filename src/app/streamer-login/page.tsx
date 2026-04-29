"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, useState } from "react";

type UserRole = "viewer" | "streamer" | "admin" | "owner";

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase ortam degiskenleri eksik.");
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

export default function StreamerLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setStatus("loading");
      setMessage("");

      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.user) {
        setStatus("error");
        setMessage(error?.message ?? "Giris basarisiz.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single<{ role: UserRole }>();

      if (profileError) {
        setStatus("error");
        setMessage(profileError.message);
        return;
      }

      if (profile?.role === "viewer") {
        setStatus("error");
        setMessage("Bu hesap yayinci olarak yetkilendirilmemis.");
        return;
      }

      window.location.href = "/streamer";
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Beklenmeyen bir hata olustu.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-cyan-100 px-4 py-6">
      <section className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-pink-500">Poncik Live</p>
        <h1 className="mt-4 text-3xl font-bold text-indigo-800">Yayinci girisi yap</h1>
        <p className="mt-2 text-sm text-slate-500">ve keyfince takil!</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-600">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
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
              className="mt-2 w-full rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm outline-none transition focus:border-pink-400"
            />
          </label>

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-full bg-pink-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-pink-400 disabled:opacity-60"
          >
            {status === "loading" ? "Kontrol ediliyor..." : "Giris Yap"}
          </button>
        </form>

        {message ? (
          <p className="mt-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600">
            {message}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-500">
          <Link href="/login" className="font-semibold text-indigo-600">
            Uye girisi
          </Link>
          <Link href="/signup" className="font-semibold text-pink-600">
            Kayit ol
          </Link>
        </div>
      </section>
    </main>
  );
}
