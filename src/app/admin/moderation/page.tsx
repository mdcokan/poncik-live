"use client";

import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";

const columns = ["Hedef", "Tip", "Neden", "Baslangic", "Durum", "Islem"];
const rows = [
  ["luna_live", "mute", "Sohbet spam", "18:04", "aktif", "Duzenle"],
  ["user_129", "engel", "Taciz", "17:40", "aktif", "Duzenle"],
  ["room_44", "ban", "Kural ihlali", "16:15", "incelemede", "Duzenle"],
  ["nora_glow", "uyari", "Dil ihlali", "15:09", "aktif", "Duzenle"],
  ["user_888", "ban", "Sahte odeme", "14:22", "kapatildi", "Duzenle"],
];

export default function AdminModerationPage() {
  const { loading, authorized, message, signOut } = useAdminAccess();

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout
      title="Ban / Engel Yonetimi"
      description="Ban, engel, mute ve guvenlik mudahaleleri."
      onLogout={signOut}
    >
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="text-slate-500">
                {columns.map((column) => (
                  <th key={column} className="px-3 py-2 font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row[0]}-${row[3]}`} className="border-t border-cyan-100">
                  {row.map((cell) => (
                    <td key={`${row[0]}-${cell}`} className="px-3 py-3 text-slate-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  );
}
