"use client";

import type { RefObject, ReactNode } from "react";

type LiveStageProps = {
  stageTestId: string;
  stageOverlayRef: RefObject<HTMLDivElement | null>;
  streamerName: string;
  giftOverlayText?: string | null;
  isLive?: boolean;
  privatePill?: ReactNode;
  children?: ReactNode;
  actionRail?: ReactNode;
  chatOverlay?: ReactNode;
  streamNav?: ReactNode;
  className?: string;
};

export default function LiveStage({
  stageTestId,
  stageOverlayRef,
  streamerName,
  giftOverlayText,
  isLive = true,
  privatePill,
  children,
  actionRail,
  chatOverlay,
  streamNav,
  className = "",
}: LiveStageProps) {
  return (
    <div
      className={`relative flex min-h-0 flex-1 overflow-hidden rounded-3xl border border-zinc-800/70 bg-zinc-950 ${className}`}
      data-testid={stageTestId}
    >
      <div className="relative h-full w-full">
        <div
          ref={stageOverlayRef}
          className="relative h-full w-full overflow-hidden bg-gradient-to-br from-zinc-950 via-black to-pink-950/40"
        >
          <div className="absolute left-3 top-3 z-20 flex max-w-[calc(100%-5rem)] flex-wrap items-center gap-1.5">
            {isLive ? (
              <span className="rounded-full bg-rose-500/90 px-2.5 py-0.5 text-[10px] font-bold text-white">Canlı</span>
            ) : null}
            {privatePill}
          </div>

          {giftOverlayText ? (
            <div className="absolute bottom-3 left-3 right-16 z-20 rounded-xl border border-pink-200/70 bg-black/60 px-3 py-2 text-xs font-semibold text-pink-100">
              {giftOverlayText}
            </div>
          ) : null}

          {chatOverlay}
          {streamNav}

          <div className="flex h-full items-center justify-center text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,44,122,0.2),transparent_60%)]" />
            <div className="relative w-full max-w-2xl px-4">
              {isLive ? (
                <span className="inline-flex rounded-full bg-rose-500 px-4 py-1 text-xs font-black tracking-wide text-white shadow-lg">
                  CANLI
                </span>
              ) : null}
              <h1 className="mt-3 text-xl font-black text-white sm:text-2xl">{streamerName}</h1>
            </div>
          </div>

          {children}
        </div>
      </div>

      {actionRail}
    </div>
  );
}
