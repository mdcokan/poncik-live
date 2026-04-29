"use client";

import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";

const rows = [
  ["Aylin K.", "aylin@example.com", "viewer", "aktif", "18:40", "Detay"],
  ["Mert V.", "mert@example.com", "streamer", "aktif", "18:12", "Detay"],
  ["Sena T.", "sena@example.com", "admin", "aktif", "17:58", "Detay"],
  ["Kerem A.", "kerem@example.com", "viewer", "pasif", "16:44", "Detay"],
  ["Lara P.", "lara@example.com", "streamer", "aktif", "15:21", "Detay"],
];

const columns = ["Kullanici", "Email", "Rol", "Durum", "Son Giris", "Islem"];

export default function AdminUsersPage() {
  const { loading, authorized, message, signOut } = useAdminAccess();

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout
      title="Uyeler"
      description="Uye hesaplari, roller ve durumlar burada yonetilecek."
      onLogout={signOut}
    >
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
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
