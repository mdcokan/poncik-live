"use client";

import { useEffect, useMemo, useState } from "react";

type PrivateRoomSessionPanelProps = {
  sessionId: string;
  viewerName: string;
  streamerName: string;
  startedAt: string;
  currentUserRole: "viewer" | "streamer";
  onEnd: () => Promise<void>;
  isEnding?: boolean;
  resultText?: string;
  errorText?: string;
};

function getInitial(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return "?";
  }
  return trimmed.charAt(0).toUpperCase();
}

function formatElapsed(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`;
}

function PlaceholderCard({ title, name }: { title: string; name: string }) {
  return (
    <article className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-500">{title}</p>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-200 text-lg font-black text-violet-800">
          {getInitial(name)}
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-900">{name}</p>
          <p className="text-xs text-zinc-500">Kamera bağlantısı sonraki fazda bağlanacak</p>
        </div>
      </div>
    </article>
  );
}

export default function PrivateRoomSessionPanel({
  sessionId,
  viewerName,
  streamerName,
  startedAt,
  currentUserRole,
  onEnd,
  isEnding = false,
  resultText,
  errorText,
}: PrivateRoomSessionPanelProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedTimestamp = useMemo(() => new Date(startedAt).getTime(), [startedAt]);

  useEffect(() => {
    function syncElapsed() {
      if (!Number.isFinite(startedTimestamp)) {
        setElapsedSeconds(0);
        return;
      }
      const next = Math.floor((Date.now() - startedTimestamp) / 1000);
      setElapsedSeconds(Math.max(0, next));
    }

    syncElapsed();
    const timer = setInterval(syncElapsed, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [startedTimestamp, sessionId]);

  return (
    <section className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-4" data-testid="private-session-panel">
      <h2 className="text-lg font-black text-violet-900">Özel Oda Aktif</h2>
      <p className="mt-1 text-sm text-violet-800">Bu fazda kamera altyapısı hazırlık ekranı olarak gösteriliyor.</p>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PlaceholderCard title="Yayıncı" name={`Yayıncı ${streamerName}`} />
        <PlaceholderCard title="Üye" name={`Üye ${viewerName}`} />
      </div>

      <p className="mt-4 text-sm font-semibold text-zinc-800" data-testid="private-session-timer">
        Geçen süre: {formatElapsed(elapsedSeconds)}
      </p>
      <p className="mt-2 text-xs text-zinc-600">Bu oturum en az 1 dk olarak ücretlendirilir.</p>
      <p className="text-xs text-zinc-600">Kapatıldığında süre yukarı yuvarlanarak dakika bakiyenden düşer.</p>
      {currentUserRole === "viewer" ? (
        <p className="mt-1 text-xs font-medium text-amber-700">Dakika bakiyen düşükse özel oda kısa sürede kapanabilir.</p>
      ) : null}

      <button
        type="button"
        data-testid="private-session-end-button"
        onClick={() => {
          void onEnd();
        }}
        disabled={isEnding}
        className="mt-4 rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isEnding ? "Bitiriliyor..." : "Özel Odayı Bitir"}
      </button>

      {resultText ? (
        <p className="mt-3 text-xs font-semibold text-violet-700" data-testid="private-session-result">
          {resultText}
        </p>
      ) : null}
      {errorText ? (
        <p className="mt-2 text-xs font-semibold text-rose-700" data-testid="private-session-error">
          {errorText}
        </p>
      ) : null}
    </section>
  );
}
