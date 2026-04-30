"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";
import { fetchAdminWalletSummaries, type WalletSummary } from "@/lib/wallets";

const columns = ["Kullanici", "Rol", "Wallet", "Islem"];

export default function AdminUsersPage() {
  const { loading, authorized, message, signOut } = useAdminAccess();
  const [walletSummaries, setWalletSummaries] = useState<WalletSummary[]>([]);

  useEffect(() => {
    if (!authorized) {
      return;
    }
    void fetchAdminWalletSummaries(50).then((data) => {
      setWalletSummaries(data);
    });
  }, [authorized]);

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
          <table className="w-full min-w-[640px] text-left text-sm">
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
              {walletSummaries.map((walletSummary) => (
                <tr key={walletSummary.userId} className="border-t border-cyan-100">
                  <td className="px-3 py-3 text-slate-700">
                    <p className="font-semibold text-slate-800">{walletSummary.displayName}</p>
                    <p className="text-xs text-slate-500">{walletSummary.userId}</p>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{walletSummary.role}</td>
                  <td className="px-3 py-3 font-semibold text-indigo-700">{walletSummary.balance} dk</td>
                  <td className="px-3 py-3 text-slate-700">
                    <Link href="/admin/finance" className="font-semibold text-indigo-700 hover:underline">
                      Cuzdan yonetimi
                    </Link>
                  </td>
                </tr>
              ))}
              {walletSummaries.length === 0 ? (
                <tr className="border-t border-cyan-100">
                  <td className="px-3 py-4 text-sm text-slate-500" colSpan={4}>
                    Henuz kullanici verisi alinamadi.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  );
}
