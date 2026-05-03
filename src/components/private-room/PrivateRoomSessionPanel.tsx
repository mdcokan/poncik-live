"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PrivateRoomMediaPrep from "@/components/private-room/PrivateRoomMediaPrep";
import type { PrivateRoomSignal, PrivateRoomSignalType } from "@/hooks/use-private-room-signaling";
import { usePrivateRoomWebRtc } from "@/hooks/use-private-room-webrtc";

type PrivateRoomSessionPanelProps = {
  sessionId: string;
  viewerName: string;
  streamerName: string;
  startedAt: string;
  currentUserRole: "viewer" | "streamer";
  onEnd: () => Promise<void>;
  viewerReady?: boolean;
  streamerReady?: boolean;
  onReadyChange?: (ready: boolean) => Promise<void>;
  isEnding?: boolean;
  resultText?: string;
  errorText?: string;
  viewerBalanceMinutes?: number | null;
  initialEstimatedRemainingMinutes?: number | null;
  lowBalanceThresholdMinutes?: number;
  autoEndWhenBalanceLikelyDepleted?: boolean;
  onAutoEnd?: () => Promise<void>;
  autoEndReason?: string;
  onSendSignal?: (signalType: PrivateRoomSignalType, payload?: Record<string, unknown>) => Promise<void>;
  lastSignalLabel?: string | null;
  /** Latest signaling row for WebRTC exchange (optional). Debug label can fall back to `lastSignal?.signalType`. */
  lastSignal?: PrivateRoomSignal | null;
  enableWebRtc?: boolean;
  currentUserId?: string | null;
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

function getRemotePlaceholderMessage(connectionState: string) {
  if (connectionState === "connected") {
    return "Bağlantı kuruldu, görüntü bekleniyor.";
  }
  if (connectionState === "failed" || connectionState === "disconnected") {
    return "Görüntülü bağlantı kurulamadı. Yeniden deneyebilirsiniz.";
  }
  return "Karşı taraf görüntüsü burada görünecek.";
}

function getLocalWebRtcStatusLabel(stream: MediaStream | null) {
  if (!stream) {
    return "Kamera bekleniyor";
  }
  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack && videoTrack.enabled) {
    return "Kameranız açık";
  }
  return "Kamera bekleniyor";
}

function getRemoteWebRtcStatusLabel(hasRemoteStream: boolean) {
  return hasRemoteStream ? "Karşı taraf görüntüsü bağlı" : "Karşı taraf bekleniyor";
}

function mapWebRtcConnectionLabel(state: string) {
  switch (state) {
    case "idle":
      return "Hazırlanıyor";
    case "creating":
      return "Hazırlanıyor";
    case "connecting":
      return "Bağlanıyor";
    case "connected":
      return "Bağlandı";
    case "disconnected":
      return "Bağlantı kesildi";
    case "failed":
      return "Hata";
    case "closed":
      return "Bağlantı kapalı";
    default:
      return state;
  }
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
          <p className="text-xs text-zinc-500">Karşı taraf kamera bağlantısı sonraki fazda bağlanacak.</p>
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
  viewerReady = false,
  streamerReady = false,
  onReadyChange,
  isEnding = false,
  resultText,
  errorText,
  viewerBalanceMinutes = null,
  initialEstimatedRemainingMinutes = null,
  lowBalanceThresholdMinutes = 2,
  autoEndWhenBalanceLikelyDepleted = false,
  onAutoEnd,
  autoEndReason = "Süre bittiği için özel oda kapatılıyor...",
  onSendSignal,
  lastSignalLabel = null,
  lastSignal = null,
  enableWebRtc = true,
  currentUserId = null,
}: PrivateRoomSessionPanelProps) {
  const displayStreamerName = (streamerName ?? "").trim() || "Yayıncı";
  const displayViewerName = (viewerName ?? "").trim() || "Üye";
  const [localMediaStream, setLocalMediaStream] = useState<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isAutoEnding, setIsAutoEnding] = useState(false);
  const [localReady, setLocalReady] = useState(currentUserRole === "viewer" ? viewerReady : streamerReady);
  const [localReadyError, setLocalReadyError] = useState<string | null>(null);
  const [isReadyUpdating, setIsReadyUpdating] = useState(false);
  const autoEndTriggeredRef = useRef(false);
  const startedTimestamp = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const estimatedChargedMinutes = useMemo(() => Math.max(1, Math.ceil(elapsedSeconds / 60)), [elapsedSeconds]);
  const estimatedRemainingMinutes = useMemo(() => {
    if (typeof viewerBalanceMinutes !== "number") {
      return typeof initialEstimatedRemainingMinutes === "number" ? Math.max(0, Math.floor(initialEstimatedRemainingMinutes)) : null;
    }
    return Math.max(0, Math.floor(viewerBalanceMinutes) - estimatedChargedMinutes);
  }, [estimatedChargedMinutes, initialEstimatedRemainingMinutes, viewerBalanceMinutes]);
  const showLowBalanceWarning =
    currentUserRole === "viewer" &&
    typeof estimatedRemainingMinutes === "number" &&
    estimatedRemainingMinutes <= lowBalanceThresholdMinutes;
  const remoteReady = currentUserRole === "viewer" ? streamerReady : viewerReady;
  const bothReady = viewerReady && streamerReady;
  const webRtcHookEnabled = Boolean(enableWebRtc && bothReady && onSendSignal && currentUserId);

  const handleLocalStreamChange = useCallback((stream: MediaStream | null) => {
    setLocalMediaStream(stream);
  }, []);

  const signalingDebugLabel = lastSignalLabel ?? lastSignal?.signalType ?? null;

  const webrtc = usePrivateRoomWebRtc({
    sessionId,
    enabled: webRtcHookEnabled,
    currentUserRole,
    currentUserId,
    localStream: localMediaStream,
    sendSignal: onSendSignal ?? (async () => {}),
    lastSignal,
  });

  const localWebRtcStatusLabel = useMemo(() => getLocalWebRtcStatusLabel(localMediaStream), [localMediaStream]);
  const remoteWebRtcStatusLabel = useMemo(
    () => getRemoteWebRtcStatusLabel(Boolean(webrtc.remoteStream)),
    [webrtc.remoteStream],
  );

  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el) {
      return;
    }
    el.srcObject = webrtc.remoteStream;
  }, [webrtc.remoteStream]);

  useEffect(() => {
    setLocalMediaStream(null);
  }, [sessionId]);

  useEffect(() => {
    setLocalReady(currentUserRole === "viewer" ? viewerReady : streamerReady);
  }, [currentUserRole, streamerReady, viewerReady, sessionId]);

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

  useEffect(() => {
    if (!autoEndWhenBalanceLikelyDepleted || currentUserRole !== "viewer" || typeof viewerBalanceMinutes !== "number" || !onAutoEnd) {
      return;
    }
    if (
      estimatedRemainingMinutes === null ||
      estimatedRemainingMinutes > 0 ||
      elapsedSeconds < 60 ||
      autoEndTriggeredRef.current ||
      isEnding
    ) {
      return;
    }
    autoEndTriggeredRef.current = true;
    setIsAutoEnding(true);
    void onAutoEnd().finally(() => {
      setIsAutoEnding(false);
    });
  }, [
    autoEndWhenBalanceLikelyDepleted,
    currentUserRole,
    estimatedRemainingMinutes,
    elapsedSeconds,
    isEnding,
    onAutoEnd,
    viewerBalanceMinutes,
  ]);

  return (
    <section
      className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-4"
      data-testid="private-session-panel"
      data-session-id={sessionId}
      data-current-role={currentUserRole}
      data-viewer-ready={viewerReady ? "true" : "false"}
      data-streamer-ready={streamerReady ? "true" : "false"}
      data-webrtc-enabled={enableWebRtc && Boolean(onSendSignal) ? "true" : "false"}
    >
      <h2 className="text-lg font-black text-violet-900">Özel Oda Aktif</h2>
      <p className="mt-1 text-sm text-violet-800">Kamera hazırlığı ve görüntülü bağlantı (WebRTC) bu panelden yönetilir.</p>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {currentUserRole === "streamer" ? (
          <>
            <PrivateRoomMediaPrep
              roleLabel="Yayıncı"
              participantName={`Yayıncı ${displayStreamerName}`}
              onStreamChange={handleLocalStreamChange}
              initialReady={localReady}
              onReadyChange={async (ready) => {
                setLocalReadyError(null);
                const previousReady = localReady;
                setLocalReady(ready);
                if (!onReadyChange) {
                  return;
                }
                setIsReadyUpdating(true);
                try {
                  await onReadyChange(ready);
                } catch {
                  setLocalReady(previousReady);
                  setLocalReadyError("Hazır durumu güncellenemedi.");
                } finally {
                  setIsReadyUpdating(false);
                }
              }}
            />
            <PlaceholderCard title="Üye" name={`Üye ${displayViewerName}`} />
          </>
        ) : (
          <>
            <PlaceholderCard title="Yayıncı" name={`Yayıncı ${displayStreamerName}`} />
            <PrivateRoomMediaPrep
              roleLabel="Üye"
              participantName={`Üye ${displayViewerName}`}
              onStreamChange={handleLocalStreamChange}
              initialReady={localReady}
              onReadyChange={async (ready) => {
                setLocalReadyError(null);
                const previousReady = localReady;
                setLocalReady(ready);
                if (!onReadyChange) {
                  return;
                }
                setIsReadyUpdating(true);
                try {
                  await onReadyChange(ready);
                } catch {
                  setLocalReady(previousReady);
                  setLocalReadyError("Hazır durumu güncellenemedi.");
                } finally {
                  setIsReadyUpdating(false);
                }
              }}
            />
          </>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span
          data-testid="private-session-local-ready"
          className={`rounded-full px-3 py-1 text-xs font-semibold ${localReady ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}
        >
          {localReady ? "Ben hazırım" : "Hazır değilim"}
        </span>
        <span
          data-testid="private-session-remote-ready"
          className={`rounded-full px-3 py-1 text-xs font-semibold ${remoteReady ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}
        >
          {remoteReady ? "Karşı taraf hazır" : "Karşı taraf henüz hazır değil"}
        </span>
      </div>
      {bothReady ? (
        <p className="mt-2 text-xs font-semibold text-emerald-700" data-testid="private-session-both-ready">
          İki taraf da hazır. Görüntülü bağlantıyı aşağıdan başlatabilirsiniz.
        </p>
      ) : null}

      {enableWebRtc && onSendSignal ? (
        <div
          className="mt-4 rounded-xl border border-emerald-100 bg-white/90 p-4 shadow-sm"
          data-testid="private-webrtc-panel"
        >
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Görüntülü bağlantı</p>
          {!bothReady ? (
            <p className="mt-2 text-sm text-zinc-600">Görüntülü bağlantı için iki tarafın da hazır olması gerekir.</p>
          ) : null}
          {bothReady ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-zinc-700">Durum:</span>
              <span
                data-testid="private-webrtc-state"
                data-connection-state={webrtc.connectionState}
                className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-800"
              >
                {mapWebRtcConnectionLabel(webrtc.connectionState)}
              </span>
            </div>
          ) : null}
          {bothReady ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <span
                data-testid="private-webrtc-local-status"
                className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-900 ring-1 ring-violet-100"
              >
                {localWebRtcStatusLabel}
              </span>
              <span
                data-testid="private-webrtc-remote-status"
                className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-900 ring-1 ring-sky-100"
              >
                {remoteWebRtcStatusLabel}
              </span>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="private-webrtc-start-button"
              disabled={
                !bothReady ||
                webrtc.connectionState === "creating" ||
                webrtc.connectionState === "connecting" ||
                webrtc.connectionState === "connected"
              }
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-300"
              onClick={() => {
                void webrtc.startConnection();
              }}
            >
              Bağlantıyı Başlat
            </button>
            <button
              type="button"
              data-testid="private-webrtc-close-button"
              disabled={webrtc.connectionState === "idle" || webrtc.connectionState === "closed"}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                webrtc.closeConnection();
              }}
            >
              Bağlantıyı Kapat
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Bazı ağlarda görüntülü bağlantı kurulamayabilir; bu durumda yeniden deneyebilirsiniz.
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950">
            {webrtc.remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="aspect-video w-full object-cover"
                data-testid="private-webrtc-remote-video"
                data-has-remote-stream="true"
              />
            ) : (
              <div
                className="flex aspect-video w-full flex-col items-center justify-center gap-1 px-4 text-center text-xs font-medium text-zinc-400"
                data-testid="private-webrtc-remote-placeholder"
                data-has-remote-stream="false"
              >
                {getRemotePlaceholderMessage(webrtc.connectionState)}
              </div>
            )}
          </div>
          {webrtc.errorMessage ? (
            <p className="mt-2 text-xs font-semibold text-rose-700" data-testid="private-webrtc-error">
              {webrtc.errorMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      {onSendSignal ? (
        <div
          className="mt-3 rounded-xl border border-violet-100 bg-white/80 p-3 text-zinc-600"
          data-testid="private-signaling-panel"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-violet-500">Bağlantı Hazırlığı</p>
          <p className="mt-2 text-xs text-zinc-500">WebRTC öncesi sinyal taşıma (test).</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="private-signal-ready-ping"
              className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-800 hover:bg-violet-100"
              onClick={() => {
                void onSendSignal("ready_ping", { debug: true });
              }}
            >
              Ready Ping Gönder
            </button>
            <button
              type="button"
              data-testid="private-signal-offer"
              className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-800 hover:bg-violet-100"
              onClick={() => {
                void onSendSignal("offer", { test: true });
              }}
            >
              Test Offer Gönder
            </button>
            <button
              type="button"
              data-testid="private-signal-answer"
              className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-800 hover:bg-violet-100"
              onClick={() => {
                void onSendSignal("answer", { test: true });
              }}
            >
              Test Answer Gönder
            </button>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500" data-testid="private-signal-last">
            Son sinyal: {signalingDebugLabel ?? "—"}
          </p>
        </div>
      ) : null}
      {isReadyUpdating ? <p className="mt-2 text-xs text-zinc-600">Hazır durumu güncelleniyor...</p> : null}
      {localReadyError ? <p className="mt-2 text-xs font-semibold text-rose-700">{localReadyError}</p> : null}

      <p className="mt-4 text-sm font-semibold text-zinc-800" data-testid="private-session-timer">
        Geçen süre: {formatElapsed(elapsedSeconds)}
      </p>
      {typeof estimatedRemainingMinutes === "number" ? (
        <p className="mt-1 text-sm font-semibold text-zinc-800" data-testid="private-session-remaining">
          {currentUserRole === "viewer" ? "Yaklaşık kalan süre" : "Üyenin yaklaşık kalan süresi"}: {estimatedRemainingMinutes} dk
        </p>
      ) : null}
      <p className="mt-2 text-xs text-zinc-600">Bu oturum en az 1 dk olarak ücretlendirilir.</p>
      <p className="text-xs text-zinc-600">Kapatıldığında süre yukarı yuvarlanarak dakika bakiyenden düşer.</p>
      {showLowBalanceWarning ? (
        <p className="mt-1 text-xs font-medium text-amber-700" data-testid="private-session-low-balance-warning">
          Dakika bakiyeniz azalıyor. Özel oda kısa süre içinde kapanabilir.
        </p>
      ) : null}
      {isAutoEnding ? (
        <p className="mt-1 text-xs font-medium text-rose-700" data-testid="private-session-auto-ending">
          {autoEndReason}
        </p>
      ) : null}

      <button
        type="button"
        data-testid="private-session-end-button"
        onClick={() => {
          void onEnd();
        }}
        disabled={isEnding || isAutoEnding}
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
