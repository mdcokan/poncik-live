"use client";

import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";

const liveCards = [
  { streamer: "Luna M.", room: "Genel-1204", viewers: "214", status: "canli", action: "Detay" },
  { streamer: "Nora G.", room: "VIP-8", viewers: "92", status: "canli", action: "Detay" },
  { streamer: "Mira S.", room: "Genel-14", viewers: "176", status: "uyarili", action: "Detay" },
  { streamer: "Ada R.", room: "Genel-2", viewers: "58", status: "canli", action: "Detay" },
  { streamer: "Ece P.", room: "VIP-3", viewers: "133", status: "izleniyor", action: "Detay" },
];

export default function AdminLivePage() {
  const { loading, authorized, message, signOut } = useAdminAccess();

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout
      title="Canli Yayinlar"
      description="Aktif yayinlar, oda durumu ve mudahale araclari."
      onLogout={signOut}
    >
      <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {liveCards.map((card) => (
          <article key={card.room} className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{card.room}</p>
            <h3 className="mt-2 text-lg font-semibold text-indigo-800">{card.streamer}</h3>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-600">
              <p>Izleyici: {card.viewers}</p>
              <p>Durum: {card.status}</p>
            </div>
            <button
              type="button"
              className="mt-4 rounded-2xl bg-pink-500 px-4 py-2 text-sm font-semibold text-white"
            >
              {card.action}
            </button>
          </article>
        ))}
      </section>
    </AdminLayout>
  );
}
