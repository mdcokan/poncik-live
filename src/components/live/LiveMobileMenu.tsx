"use client";

import Link from "next/link";
import LiveBottomSheet from "@/components/live/LiveBottomSheet";

export type LiveMobileMenuItem = {
  id: string;
  label: string;
  href?: string;
  onClick?: () => void;
  testId?: string;
};

type LiveMobileMenuProps = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  title: string;
  items: LiveMobileMenuItem[];
  onLogout: () => void;
};

export default function LiveMobileMenu({ open, onOpen, onClose, title, items, onLogout }: LiveMobileMenuProps) {
  return (
    <>
      <button
        type="button"
        data-testid="mobile-live-menu-button"
        onClick={onOpen}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-pink-200 bg-white text-base text-pink-500 transition hover:bg-pink-50"
        aria-label="Menüyü aç"
      >
        ☰
      </button>
      <LiveBottomSheet open={open} title={title} testId="mobile-live-menu-sheet" onClose={onClose}>
        <nav className="space-y-1 px-4 py-3">
          {items.map((item) => {
            const className =
              "block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-zinc-700 transition hover:bg-pink-50";
            if (item.href) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  data-testid={item.testId}
                  onClick={onClose}
                  className={className}
                >
                  {item.label}
                </Link>
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                data-testid={item.testId}
                onClick={() => {
                  item.onClick?.();
                  onClose();
                }}
                className={className}
              >
                {item.label}
              </button>
            );
          })}
          <button
            type="button"
            data-testid="mobile-live-menu-item-logout"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="mt-2 block w-full rounded-xl bg-rose-500/10 px-3 py-2.5 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-500/20"
          >
            Çıkış Yap
          </button>
        </nav>
      </LiveBottomSheet>
    </>
  );
}
