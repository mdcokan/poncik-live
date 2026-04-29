"use client";

import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";

const settingsCards = [
  { title: "Genel Platform Ayari", detail: "Site gorunurluk, bakim ve surum notlari." },
  { title: "Ödeme Ayarlari", detail: "Coin fiyat politikasi ve odeme kanallari." },
  { title: "Bildirim Ayarlari", detail: "Mail, push ve sistem ici bildirim tercihleri." },
  { title: "Guvenlik Ayarlari", detail: "Oturum, sifre ve risk kontrol stratejileri." },
  { title: "Moderasyon Ayarlari", detail: "Kelime filtresi ve otomatik yaptirim parametreleri." },
];

export default function AdminSettingsPage() {
  const { loading, authorized, message, signOut } = useAdminAccess();

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
    </AdminLayout>
  );
}
