"use client";

type StudioCameraControlsProps = {
  mutedStart: boolean;
  mirrorVideo: boolean;
  onMutedStartChange: (value: boolean) => void;
  onMirrorVideoChange: (value: boolean) => void;
  variant?: "prelive" | "live";
  compact?: boolean;
};

export default function StudioCameraControls({
  mutedStart,
  mirrorVideo,
  onMutedStartChange,
  onMirrorVideoChange,
  variant = "prelive",
  compact = false,
}: StudioCameraControlsProps) {
  const isLive = variant === "live";
  const heading = isLive ? "Kamera Ayarları" : "Kamera ve mikrofon";
  const selectClassName = compact
    ? "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-pink-400"
    : "rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none transition focus:border-pink-400";
  const labelClassName = compact
    ? "grid gap-1 text-xs font-semibold text-zinc-700"
    : "grid gap-2 text-sm font-semibold text-zinc-700";
  const toggleClassName = compact ? "grid gap-2 text-xs text-zinc-700" : "grid gap-2 text-sm text-zinc-700";

  return (
    <div className={compact ? "space-y-3" : "space-y-3"} data-testid="studio-camera-controls">
      {!compact ? <h2 className="text-base font-black text-zinc-900">{heading}</h2> : null}
      <div className={`grid gap-2 ${compact ? "sm:grid-cols-2" : "lg:grid-cols-2"}`}>
        <label className={labelClassName}>
          Kamera
          <select
            className={selectClassName}
            data-testid="studio-camera-select"
            defaultValue=""
            aria-label="Kamera seçimi"
          >
            <option value="">Kamera seçiniz</option>
          </select>
        </label>
        <label className={labelClassName}>
          Mikrofon
          <select
            className={selectClassName}
            data-testid="studio-microphone-select"
            defaultValue=""
            aria-label="Mikrofon seçimi"
          >
            <option value="">Mikrofonsuz devam et</option>
          </select>
        </label>
      </div>
      <div className={toggleClassName}>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={mutedStart}
            onChange={(event) => onMutedStartChange(event.target.checked)}
            className="h-4 w-4 accent-pink-500"
            data-testid="studio-muted-start-toggle"
          />
          {isLive ? "Yayını ses kapalı başlat" : "Yayını ses kapalı olarak başlat"}
        </label>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={mirrorVideo}
            onChange={(event) => onMirrorVideoChange(event.target.checked)}
            className="h-4 w-4 accent-pink-500"
            data-testid="studio-mirror-video-toggle"
          />
          Video aynalama aktif/pasif
        </label>
      </div>
    </div>
  );
}
