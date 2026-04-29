"use client";

import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";

const packages = [
  { name: "30 dk", type: "Sure", price: "89 TL" },
  { name: "60 dk", type: "Sure", price: "159 TL" },
  { name: "100 coin", type: "Coin", price: "119 TL" },
  { name: "500 coin", type: "Coin", price: "499 TL" },
];

export default function AdminPackagesPage() {
  const { loading, authorized, message, signOut } = useAdminAccess();

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout
      title="Coin & Sure Paketleri"
      description="Kullanicilarin satin alacagi paketler burada yonetilecek."
      onLogout={signOut}
    >
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {packages.map((item) => (
          <article key={item.name} className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{item.type}</p>
            <h3 className="mt-2 text-xl font-semibold text-indigo-800">{item.name}</h3>
            <p className="mt-2 text-pink-600">{item.price}</p>
          </article>
        ))}
      </section>
    </AdminLayout>
  );
}
