"use client";

import { useEffect, useRef } from "react";

type PrivateLocalPipProps = {
  stream: MediaStream | null;
  visible: boolean;
  expanded: boolean;
  onToggleSize: () => void;
  onClose: () => void;
  mirror?: boolean;
  testId?: string;
  videoTestId?: string;
};

export default function PrivateLocalPip({
  stream,
  visible,
  expanded,
  onToggleSize,
  onClose,
  mirror = false,
  testId = "private-local-pip",
  videoTestId = "private-local-pip-video",
}: PrivateLocalPipProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) {
      return;
    }
    element.srcObject = stream;
  }, [stream]);

  if (!visible || !stream) {
    return null;
  }

  const sizeClass = expanded
    ? "w-[min(70vw,18rem)] max-w-[70vw] max-h-[30vh] sm:w-72"
    : "w-28 sm:w-40 md:w-48";

  return (
    <div
      className={`pointer-events-auto absolute z-30 overflow-hidden rounded-xl border border-white/20 bg-zinc-950 shadow-lg ${sizeClass}`}
      style={{
        right: "max(0.75rem, env(safe-area-inset-right))",
        bottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
      data-testid={testId}
    >
      <div className="relative aspect-video w-full overflow-hidden">
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          className={`h-full w-full object-cover ${mirror ? "scale-x-[-1]" : ""}`}
          data-testid={videoTestId}
        />
        <div className="absolute right-1 top-1 flex gap-1">
          <button
            type="button"
            data-testid="private-local-pip-toggle-size"
            onClick={onToggleSize}
            className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white"
            aria-label={expanded ? "PiP kucult" : "PiP buyut"}
          >
            {expanded ? "-" : "+"}
          </button>
          <button
            type="button"
            data-testid="private-local-pip-close"
            onClick={onClose}
            className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white"
            aria-label="Kamerayi kapat"
          >
            x
          </button>
        </div>
      </div>
    </div>
  );
}
