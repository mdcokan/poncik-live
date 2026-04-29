"use client";

import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";

const messageItems = [
  "Sistem: Bakim bildirimi taslagi hazirlandi.",
  "Supheli mesaj kaydi #4412 inceleme sirasinda.",
  "Yayinci destek talebi #120 yanit bekliyor.",
  "Kullanici geri bildirimi #984 etiketlendi.",
  "Moderasyon notu #208 guncellendi.",
];

export default function AdminMessagesPage() {
  const { loading, authorized, message, signOut } = useAdminAccess();

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout
      title="Mesajlar"
      description="Sistem mesajlari ve supheli konusma kayitlari burada incelenecek."
      onLogout={signOut}
    >
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <ul className="space-y-2">
          {messageItems.map((item) => (
            <li key={item} className="rounded-2xl bg-cyan-50 px-4 py-3 text-sm text-slate-700">
              {item}
            </li>
          ))}
        </ul>
      </section>
    </AdminLayout>
  );
}
