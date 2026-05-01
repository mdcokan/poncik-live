"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { fetchCurrentUserWallet } from "@/lib/wallets";

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
  const [walletMinutes, setWalletMinutes] = useState<number | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          window.location.href = "/login";
          return;
        }

        setEmail(user.email ?? null);

        const [profileResult, balance] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, display_name, username, avatar_url, role, is_banned, created_at")
            .eq("id", user.id)
            .single(),
          fetchCurrentUserWallet(supabase),
        ]);

        if (profileResult.error) {
          setMessage(profileResult.error.message);
          setLoading(false);
          return;
        }

        setProfile(profileResult.data as Profile);
        setWalletMinutes(balance ?? 0);
        setLoading(false);
      } catch {
        setMessage("Profil yüklenemedi.");
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main
      data-testid="profile-page"
      className="min-h-screen bg-gradient-to-b from-cyan-50 via-pink-50/40 to-violet-50/50 px-4 py-8 text-slate-800 sm:px-6"
    >
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="rounded-3xl border border-cyan-100/80 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-500">Poncik Live</p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-indigo-900 sm:text-3xl">Profilim</h1>
          <p className="mt-2 text-sm text-slate-600">Hesap ve rol bilgilerin.</p>
        </header>

        <div className="rounded-3xl border border-cyan-100/80 bg-white p-6 shadow-sm sm:p-8">
          {loading ? (
            <p className="text-sm text-slate-500">Profil yükleniyor...</p>
          ) : message ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</p>
          ) : profile ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Görünen ad</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {profile.display_name ?? "İsimsiz kullanıcı"}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">E-posta</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{email ?? "—"}</p>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Rol</p>
                <p className="mt-2 inline-flex rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-800">
                  {profile.role}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Ban durumu</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {profile.is_banned ? "Kısıtlı" : "Aktif"}
                </p>
              </div>

              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Dakika bakiyesi</p>
                <p className="mt-1 text-lg font-semibold text-indigo-900">
                  {walletMinutes !== null ? `${walletMinutes} dk` : "—"}
                </p>
              </div>

              <p className="text-xs text-slate-500">Profil düzenleme yakında.</p>

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap">
                <Link
                  data-testid="profile-return-member-button"
                  href="/member"
                  className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Üye Paneline Dön
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center justify-center rounded-full border-2 border-pink-300 bg-pink-50 px-5 py-2.5 text-sm font-semibold text-pink-700 transition hover:bg-pink-100"
                >
                  Çıkış Yap
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
