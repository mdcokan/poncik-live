"use client";

import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";

const summaryCards = [
  { label: "Toplam Uye", value: "12.480", note: "+120 bugun" },
  { label: "Toplam Yayinci", value: "348", note: "42 aktif" },
  { label: "Online Yayin", value: "27", note: "anlik takip" },
  { label: "Bugunku Coin Hareketi", value: "89.400", note: "mock veri" },
  { label: "Bugunku Kazanc", value: "48.250 TL", note: "mock veri" },
  { label: "Bekleyen Sikayet", value: "14", note: "8 kritik" },
];

const recentActions = [
  "Yeni yayinci basvurusu onaya alindi.",
  "3 kullanici sikayeti inceleme kuyuguna eklendi.",
  "Coin paketi kampanya etiketi guncellendi.",
  "Sistem duyurusu taslaga kaydedildi.",
  "Canli odada moderasyon uyarisi verildi.",
];

const quickActions = [
  "Yayinci basvurulari",
  "Sikayet merkezi",
  "Duyuru olustur",
  "Finans ozeti",
];

export default function AdminPage() {
  const { loading, authorized, message, signOut } = useAdminAccess();

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout
      title="Dashboard"
      description="Yonetim akisini hizli takip etmek icin ozet metrikler ve kritik paneller."
      onLogout={signOut}
    >
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((card) => (
          <article key={card.label} className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
            <p className="mt-3 text-2xl font-bold text-indigo-800">{card.value}</p>
            <p className="mt-2 text-xs text-pink-600">{card.note}</p>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-indigo-800">Son Hareketler</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            {recentActions.map((action) => (
              <li key={action} className="rounded-2xl bg-cyan-50 px-3 py-2">
                {action}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-indigo-800">Hizli Yonetim</h2>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {quickActions.map((action) => (
              <button
                key={action}
                type="button"
                className="rounded-2xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-pink-400"
              >
                {action}
              </button>
            ))}
          </div>
        </article>
      </section>
    </AdminLayout>
  );
}
