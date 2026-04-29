"use client";

import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";

const financeSummary = [
  { label: "Bugunku gelir", value: "68.200 TL" },
  { label: "Bu ay gelir", value: "1.920.000 TL" },
  { label: "Yayinci payi", value: "1.110.000 TL" },
  { label: "Platform payi", value: "810.000 TL" },
];

export default function AdminFinancePage() {
  const { loading, authorized, message, signOut } = useAdminAccess();

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout
      title="Kazanc / Finans"
      description="Gelir, gider, coin hareketleri ve yayinci kazanclari."
      onLogout={signOut}
    >
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {financeSummary.map((item) => (
          <article key={item.label} className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-2 text-2xl font-bold text-indigo-800">{item.value}</p>
          </article>
        ))}
      </section>
    </AdminLayout>
  );
}
