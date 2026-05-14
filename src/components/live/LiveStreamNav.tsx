"use client";

type LiveStreamNavProps = {
  onPrevious?: () => void;
  onNext?: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  hidden?: boolean;
};

export default function LiveStreamNav({
  onPrevious,
  onNext,
  previousDisabled = false,
  nextDisabled = false,
  hidden = false,
}: LiveStreamNavProps) {
  if (hidden) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-12 z-30 flex items-center justify-between px-2">
      <button
        type="button"
        data-testid="room-prev-live-button"
        disabled={previousDisabled}
        onClick={onPrevious}
        className="pointer-events-auto rounded-full border border-white/20 bg-black/55 px-3 py-1.5 text-[10px] font-black text-white shadow-lg backdrop-blur-sm transition disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Önceki yayıncı"
      >
        Önceki
      </button>
      <button
        type="button"
        data-testid="room-next-live-button"
        disabled={nextDisabled}
        onClick={onNext}
        className="pointer-events-auto rounded-full border border-white/20 bg-black/55 px-3 py-1.5 text-[10px] font-black text-white shadow-lg backdrop-blur-sm transition disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Sonraki yayıncı"
      >
        Sonraki
      </button>
    </div>
  );
}
