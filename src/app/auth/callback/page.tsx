"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Giriş doğrulanıyor...");

  useEffect(() => {
    async function completeAuth() {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        setMessage("Supabase ortam değişkenleri eksik.");
        return;
      }

      const hashParams = new URLSearchParams(window.location.hash.replace("#", ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const error = hashParams.get("error_description") || hashParams.get("error");

      if (error) {
        setMessage(decodeURIComponent(error.replaceAll("+", " ")));
        return;
      }

      if (!accessToken || !refreshToken) {
        setMessage("Giriş bağlantısı geçersiz veya süresi dolmuş. Lütfen tekrar giriş bağlantısı iste.");
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey);

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        setMessage(sessionError.message);
        return;
      }

      window.location.href = "/profile";
    }

    completeAuth();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-5 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center shadow-2xl shadow-pink-950/20">
        <p className="text-xs font-medium uppercase tracking-[0.35em] text-pink-300">
          Poncik Live
        </p>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Auth kontrolü
        </h1>
        <p className="mt-4 text-sm leading-6 text-zinc-300">{message}</p>
        <a
          href="/login"
          className="mt-6 inline-flex rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Giriş sayfasına dön
        </a>
      </section>
    </main>
  );
}
