"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

type AdminLayoutProps = {
  title: string;
  description: string;
  onLogout: () => void | Promise<void>;
  children: ReactNode;
};

const menuItems = [
  { label: "Dashboard", href: "/admin" },
  { label: "Uyeler", href: "/admin/users" },
  { label: "Yayincilar", href: "/admin/streamers" },
  { label: "Canli Yayinlar", href: "/admin/live" },
  { label: "Kazanc / Finans", href: "/admin/finance" },
  { label: "Dakika / Sure Paketleri", href: "/admin/packages" },
  { label: "Mesajlar", href: "/admin/messages" },
  { label: "Sikayetler", href: "/admin/reports" },
  { label: "Ban / Engel Yonetimi", href: "/admin/moderation" },
  { label: "Duyurular", href: "/admin/announcements" },
  { label: "Yayin Kurallari", href: "/admin/rules" },
  { label: "Sistem Ayarlari", href: "/admin/settings" },
];

export function AdminLayout({ title, description, onLogout, children }: AdminLayoutProps) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-cyan-100 px-4 py-4 text-slate-800 sm:px-6">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-3xl bg-gradient-to-b from-indigo-700 to-violet-700 p-4 text-white">
          <h2 className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-pink-200">
            Admin Panel
          </h2>

          <nav className="mt-3 space-y-2">
            {menuItems.map((item) => {
              const active = pathname === item.href;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`block rounded-2xl px-4 py-2.5 text-sm transition ${
                    active
                      ? "bg-pink-400 text-white"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Link
            href="/"
            className="mt-3 block rounded-2xl bg-cyan-300/20 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-200/30"
          >
            Siteye Don
          </Link>

          <button
            type="button"
            onClick={onLogout}
            className="mt-3 w-full rounded-2xl bg-pink-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pink-400"
          >
            Cikis Yap
          </button>
        </aside>

        <section className="space-y-4">
          <header className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-pink-500">Poncik Live</p>
            <h1 className="mt-3 text-2xl font-bold text-indigo-800 sm:text-3xl">{title}</h1>
            <p className="mt-2 text-sm text-slate-500">{description}</p>
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}
