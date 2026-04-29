"use client";

type AdminAccessStateProps = {
  loading: boolean;
  authorized: boolean;
  message: string;
};

export function AdminAccessState({ loading, authorized, message }: AdminAccessStateProps) {
  if (loading) {
    return (
      <main className="min-h-screen bg-cyan-100 px-4 py-8 text-slate-800 sm:px-6">
        <section className="mx-auto w-full max-w-3xl rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm text-slate-500">Yetkiler kontrol ediliyor...</p>
        </section>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen bg-cyan-100 px-4 py-8 text-slate-800 sm:px-6">
        <section className="mx-auto w-full max-w-3xl rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600">
            {message || "Yetkisiz erisim"}
          </p>
        </section>
      </main>
    );
  }

  return null;
}
