"use client";

import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";

const columns = ["Sikayet Eden", "Sikayet Edilen", "Sebep", "Durum", "Islem"];
const rows = [
  ["mavi_ay", "luna_live", "Hakaret", "beklemede", "Incele"],
  ["doga_user", "nora_glow", "Uygunsuz icerik", "degerlendiriliyor", "Incele"],
  ["fatma_u", "kirmizi_oda", "Dolandiricilik", "acil", "Incele"],
  ["mehmet34", "ada_stream", "Spam", "kapatildi", "Incele"],
  ["seda84", "room_1204", "Taciz", "beklemede", "Incele"],
];

export default function AdminReportsPage() {
  const { loading, authorized, message, signOut } = useAdminAccess();

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout
      title="Sikayetler"
      description="Kullanici ve yayinci sikayetleri burada incelenecek."
      onLogout={signOut}
    >
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
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
                <tr key={`${row[0]}-${row[1]}`} className="border-t border-cyan-100">
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
