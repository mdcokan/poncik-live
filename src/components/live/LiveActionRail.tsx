"use client";

type LiveActionRailItem = {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  tone?: "default" | "accent" | "danger" | "violet";
};

type LiveActionRailProps = {
  items: LiveActionRailItem[];
  testId?: string;
  className?: string;
};

const toneClasses: Record<NonNullable<LiveActionRailItem["tone"]>, string> = {
  default: "border-white/20 bg-black/55 text-white",
  accent: "border-pink-200/40 bg-pink-500/90 text-white",
  danger: "border-rose-200/40 bg-rose-500/90 text-white",
  violet: "border-violet-200/40 bg-violet-500/90 text-white",
};

export default function LiveActionRail({ items, testId = "room-mobile-action-rail", className = "" }: LiveActionRailProps) {
  return (
    <div
      className={`pointer-events-none absolute right-1.5 top-1/2 z-30 flex max-h-[calc(100%-1rem)] -translate-y-1/2 flex-col gap-1 overflow-hidden lg:hidden ${className}`}
      data-testid={testId}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          data-testid={item.testId}
          disabled={item.disabled}
          onClick={item.onClick}
          className={`pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-[9px] font-black leading-none shadow-lg backdrop-blur-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses[item.tone ?? "default"]}`}
          aria-label={item.label}
          title={item.label}
        >
          <span className="max-w-[2.25rem] truncate text-center">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
