"use client";

import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";

const rules = [
  "Siddet, nefret soylemi ve taciz icerikli yayinlar yasaktir.",
  "Yayinci kimlik dogrulama adimlarini tamamlamalidir.",
  "Yaniltici odeme ve coin talepleri kalici ban nedenidir.",
  "Gizli bilgileri ifsa eden icerikler aninda kaldirilir.",
  "Moderasyon uyarilarina tekrar eden ihlallerde yaptirim uygulanir.",
];

export default function AdminRulesPage() {
  const { loading, authorized, message, signOut } = useAdminAccess();

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout
      title="Yayin Kurallari"
      description="Yayincilarin uymasi gereken kurallar."
      onLogout={signOut}
    >
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <ol className="space-y-2 text-sm text-slate-700">
          {rules.map((rule) => (
            <li key={rule} className="rounded-2xl bg-cyan-50 px-4 py-3">
              {rule}
            </li>
          ))}
        </ol>
      </section>
    </AdminLayout>
  );
}
