"use client";

import { useEffect, useState } from "react";
import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";
import { getSupabaseClient } from "@/app/admin/_lib/supabase";

const settingsCards = [
  { title: "Genel Platform Ayari", detail: "Site gorunurluk, bakim ve surum notlari." },
  { title: "Ödeme Ayarlari", detail: "Coin fiyat politikasi ve odeme kanallari." },
  { title: "Bildirim Ayarlari", detail: "Mail, push ve sistem ici bildirim tercihleri." },
  { title: "Guvenlik Ayarlari", detail: "Oturum, sifre ve risk kontrol stratejileri." },
  { title: "Moderasyon Ayarlari", detail: "Kelime filtresi ve otomatik yaptirim parametreleri." },
];

export default function AdminSettingsPage() {
  const { loading, authorized, message, signOut } = useAdminAccess();
  const [pricePerMinute, setPricePerMinute] = useState("1");
  const [streamerSharePercent, setStreamerSharePercent] = useState("70");
  const [statusText, setStatusText] = useState("");
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!authorized) {
      return;
    }
    let cancelled = false;
    async function loadPrivateRoomSettings() {
      setIsLoadingSettings(true);
      setStatusText("");
      try {
        const supabase = getSupabaseClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const accessToken = session?.access_token;
        if (!accessToken) {
          if (!cancelled) {
            setStatusText("Oturum bulunamadı.");
          }
          return;
        }
        const response = await fetch("/api/admin/platform-settings/private-room", {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          pricing?: { pricePerMinute?: number; streamerSharePercent?: number };
          message?: string;
        };
        if (!response.ok || !payload.ok) {
          if (!cancelled) {
            setStatusText(payload.message || "Ayarlar yüklenemedi.");
          }
          return;
        }
        if (!cancelled) {
          setPricePerMinute(`${payload.pricing?.pricePerMinute ?? 1}`);
          setStreamerSharePercent(`${payload.pricing?.streamerSharePercent ?? 70}`);
        }
      } catch {
        if (!cancelled) {
          setStatusText("Ayarlar yüklenemedi.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSettings(false);
        }
      }
    }
    void loadPrivateRoomSettings();
    return () => {
      cancelled = true;
    };
  }, [authorized]);

  async function handleSavePrivateRoomSettings() {
    setIsSaving(true);
    setStatusText("");
    try {
      const parsedPrice = Number.parseInt(pricePerMinute, 10);
      const parsedShare = Number.parseInt(streamerSharePercent, 10);
      const normalizedPrice = Number.isFinite(parsedPrice) ? Math.max(1, parsedPrice) : 1;
      const normalizedShare = Number.isFinite(parsedShare) ? Math.min(100, Math.max(0, parsedShare)) : 70;

      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setStatusText("Oturum bulunamadı.");
        return;
      }

      const response = await fetch("/api/admin/platform-settings/private-room", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pricePerMinute: normalizedPrice,
          streamerSharePercent: normalizedShare,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        pricing?: { pricePerMinute?: number; streamerSharePercent?: number };
        message?: string;
      };
      if (!response.ok || !payload.ok) {
        setStatusText(payload.message || "Ayarlar kaydedilemedi.");
        return;
      }
      setPricePerMinute(`${payload.pricing?.pricePerMinute ?? normalizedPrice}`);
      setStreamerSharePercent(`${payload.pricing?.streamerSharePercent ?? normalizedShare}`);
      setStatusText(payload.message || "Özel oda ayarları kaydedildi.");
    } catch {
      setStatusText("Ayarlar kaydedilemedi.");
    } finally {
      setIsSaving(false);
    }
  }

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout
      title="Sistem Ayarlari"
      description="Platform genel ayarlari."
      onLogout={signOut}
    >
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {settingsCards.map((card) => (
          <article key={card.title} className="rounded-3xl bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-indigo-800">{card.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{card.detail}</p>
          </article>
        ))}
      </section>
      <section className="mt-4 rounded-3xl bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-indigo-800">Özel Oda Ayarları</h3>
        <p className="mt-2 text-sm text-slate-600">Özel oda ücretlendirmesini genel odadan bağımsız yönet.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-700">
            Özel oda dakika ücreti
            <input
              data-testid="admin-private-room-price-input"
              type="number"
              min={1}
              value={pricePerMinute}
              onChange={(event) => setPricePerMinute(event.target.value)}
              disabled={isLoadingSettings || isSaving}
              className="mt-1 w-full rounded-xl border border-cyan-200 px-3 py-2 outline-none"
            />
          </label>
          <label className="text-sm text-slate-700">
            Yayıncı payı yüzdesi
            <input
              data-testid="admin-private-room-share-input"
              type="number"
              min={0}
              max={100}
              value={streamerSharePercent}
              onChange={(event) => setStreamerSharePercent(event.target.value)}
              disabled={isLoadingSettings || isSaving}
              className="mt-1 w-full rounded-xl border border-cyan-200 px-3 py-2 outline-none"
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            data-testid="admin-private-room-settings-save"
            onClick={() => void handleSavePrivateRoomSettings()}
            disabled={isLoadingSettings || isSaving}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isSaving ? "Kaydediliyor..." : "Kaydet"}
          </button>
          <p data-testid="admin-private-room-settings-status" className="text-sm text-slate-600">
            {isLoadingSettings ? "Ayarlar yükleniyor..." : statusText}
          </p>
        </div>
      </section>
    </AdminLayout>
  );
}
