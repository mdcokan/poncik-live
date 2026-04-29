"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useState } from "react";

type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role: "viewer" | "streamer" | "admin" | "owner";
  is_banned: boolean;
  created_at: string;
};

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        setMessage("Supabase ortam değişkenleri eksik.");
        setLoading(false);
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        window.location.href = "/login";
        return;
      }

      setEmail(user.email ?? null);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url, role, is_banned, created_at")
        .eq("id", user.id)
        .single();

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      setProfile(data);
      setLoading(false);
    }

    loadProfile();
  }, []);

  async function handleLogout() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-pink-950/20">
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-pink-300">
            Poncik Live
          </p>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Profil</h1>
              <p className="mt-2 text-sm text-zinc-400">
                Hesap ve rol bilgilerin burada görünecek.
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Çıkış yap
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          {loading ? (
            <p className="text-sm text-zinc-300">Profil yükleniyor...</p>
          ) : message ? (
            <p className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {message}
            </p>
          ) : profile ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-zinc-500">Görünen ad</p>
                <p className="mt-1 text-lg font-semibold">
                  {profile.display_name ?? "İsimsiz kullanıcı"}
                </p>
              </div>

              <div>
                <p className="text-sm text-zinc-500">Email</p>
                <p className="mt-1 text-lg font-semibold">{email}</p>
              </div>

              <div>
                <p className="text-sm text-zinc-500">Rol</p>
                <p className="mt-1 inline-flex rounded-full border border-pink-400/30 bg-pink-400/10 px-3 py-1 text-sm font-semibold text-pink-200">
                  {profile.role}
                </p>
              </div>

              <div>
                <p className="text-sm text-zinc-500">Ban durumu</p>
                <p className="mt-1 text-lg font-semibold">
                  {profile.is_banned ? "Banlı" : "Aktif"}
                </p>
              </div>

              <div className="pt-4">
                <Link
                  href="/"
                  className="inline-flex rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-400"
                >
                  Ana sayfaya dön
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
