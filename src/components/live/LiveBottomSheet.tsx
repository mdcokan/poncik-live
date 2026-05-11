"use client";

import type { ReactNode } from "react";

type LiveBottomSheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  testId: string;
  children: ReactNode;
};

export default function LiveBottomSheet({ open, title, onClose, testId, children }: LiveBottomSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
      <button
        type="button"
        aria-label="Sheet disini kapat"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <section
        className="relative flex max-h-[min(78dvh,720px)] flex-col overflow-hidden rounded-t-3xl border border-pink-100 bg-white shadow-2xl"
        data-testid={testId}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
          <h2 className="text-base font-black text-zinc-900">{title}</h2>
          <button
            type="button"
            data-testid={`${testId}-close-button`}
            onClick={onClose}
            className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-700"
          >
            Kapat
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
      </section>
    </div>
  );
}
