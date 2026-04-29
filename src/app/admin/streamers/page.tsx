"use client";

import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";

const columns = ["Yayinci", "Email", "Durum", "Bugunku Kazanc", "Toplam Kazanc", "Islem"];
const rows = [
  ["Luna M.", "luna@example.com", "onayli", "1.250 TL", "35.800 TL", "Incele"],
  ["Nora G.", "nora@example.com", "beklemede", "420 TL", "9.600 TL", "Incele"],
  ["Mira S.", "mira@example.com", "onayli", "1.980 TL", "51.230 TL", "Incele"],
  ["Ada R.", "ada@example.com", "askida", "0 TL", "6.300 TL", "Incele"],
  ["Ece P.", "ece@example.com", "onayli", "760 TL", "18.540 TL", "Incele"],
];

export default function AdminStreamersPage() {
  const { loading, authorized, message, signOut } = useAdminAccess();

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout
      title="Yayincilar"
      description="Yayinci onaylari, profil durumu ve kazanc takibi."
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
                <tr key={row[1]} className="border-t border-cyan-100">
                  {row.map((cell) => (
                    <td key={`${row[1]}-${cell}`} className="px-3 py-3 text-slate-700">
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
