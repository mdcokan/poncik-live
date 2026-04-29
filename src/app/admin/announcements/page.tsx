"use client";

import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";

const announcements = [
  { title: "Yeni coin kampanyasi", audience: "Tum uyeler", status: "taslak" },
  { title: "Yayinci odul programi", audience: "Yayincilar", status: "yayinda" },
  { title: "Bakim bildirimi", audience: "Tum uyeler", status: "planli" },
  { title: "Moderasyon duyurusu", audience: "Tum uyeler", status: "yayinda" },
  { title: "Yeni yayin kurallari", audience: "Yayincilar", status: "taslak" },
];

export default function AdminAnnouncementsPage() {
  const { loading, authorized, message, signOut } = useAdminAccess();

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout
      title="Duyurular"
      description="Uye ve yayincilara gosterilecek duyurular."
      onLogout={signOut}
    >
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <ul className="space-y-2">
          {announcements.map((item) => (
            <li
              key={item.title}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cyan-50 px-4 py-3 text-sm"
            >
              <span className="font-semibold text-slate-700">{item.title}</span>
              <span className="text-slate-500">{item.audience}</span>
              <span className="rounded-full bg-pink-100 px-3 py-1 text-xs font-semibold text-pink-600">
                {item.status}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </AdminLayout>
  );
}
