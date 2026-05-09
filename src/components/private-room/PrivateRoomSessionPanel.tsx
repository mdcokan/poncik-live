"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalMediaPreview } from "@/hooks/use-local-media-preview";
import type { PrivateRoomSignal, PrivateRoomSignalType } from "@/hooks/use-private-room-signaling";
import { usePrivateRoomWebRtc } from "@/hooks/use-private-room-webrtc";

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
  viewerBalanceMinutes?: number | null;
  initialEstimatedRemainingMinutes?: number | null;
  lowBalanceThresholdMinutes?: number;
  autoEndWhenBalanceLikelyDepleted?: boolean;
  onAutoEnd?: () => Promise<void>;
  autoEndReason?: string;
  onSendSignal?: (signalType: PrivateRoomSignalType, payload?: Record<string, unknown>) => Promise<void>;
  lastSignal?: PrivateRoomSignal | null;
  signalingErrorText?: string | null;
  enableWebRtc?: boolean;
  currentUserId?: string | null;
};

function formatElapsed(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`;
}

function mapWebRtcConnectionLabel(state: string) {
  switch (state) {
    case "creating":
    case "connecting":
      return "Bağlanıyor";
    case "connected":
      return "Bağlandı";
    case "failed":
      return "Bağlantı hatası";
    case "disconnected":
      return "Bağlantı kesildi";
    case "closed":
    case "idle":
    default:
      return "Beklemede";
  }
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
  viewerBalanceMinutes = null,
  initialEstimatedRemainingMinutes = null,
  lowBalanceThresholdMinutes = 2,
  autoEndWhenBalanceLikelyDepleted = false,
  onAutoEnd,
  autoEndReason = "Süre bittiği için özel görüşme kapatılıyor...",
  onSendSignal,
  lastSignal = null,
  signalingErrorText = null,
  enableWebRtc = true,
  currentUserId = null,
}: PrivateRoomSessionPanelProps) {
  const { stream, isCameraEnabled, isMicEnabled, requestMedia, toggleCamera, toggleMic } = useLocalMediaPreview();
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const autoEndTriggeredRef = useRef(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isAutoEnding, setIsAutoEnding] = useState(false);

  const displayOtherUserName =
    currentUserRole === "viewer" ? (streamerName.trim() || "Yayıncı") : (viewerName.trim() || "Üye");

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

  const webRtcHookEnabled = Boolean(enableWebRtc && onSendSignal && currentUserId);
  const webrtc = usePrivateRoomWebRtc({
    sessionId,
    enabled: webRtcHookEnabled,
    currentUserRole,
    currentUserId,
    localStream: stream,
    sendSignal: onSendSignal ?? (async () => {}),
    lastSignal,
  });

  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el) {
      return;
    }
    el.srcObject = webrtc.remoteStream;
  }, [webrtc.remoteStream]);

  useEffect(() => {
    const el = localVideoRef.current;
    if (!el) {
      return;
    }
    el.srcObject = stream;
  }, [stream]);

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
    if (estimatedRemainingMinutes === null || estimatedRemainingMinutes > 0 || elapsedSeconds < 60 || autoEndTriggeredRef.current || isEnding) {
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
    elapsedSeconds,
    estimatedRemainingMinutes,
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
    >
      <div className="flex flex-wrap items-center gap-2" data-testid="private-session-control-bar">
        <span data-testid="private-session-active-badge" className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">
          {currentUserRole === "viewer" ? "Yayıncı ile özel görüşmedesin" : `Özel görüşme aktif: ${displayOtherUserName}`}
        </span>
        <span data-testid="private-session-rate-badge" className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
          Tarife aktif
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-600" data-testid="private-session-participants">
        Yayıncı: {streamerName || "Yayıncı"} • Üye: {viewerName || "Üye"}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {currentUserRole === "viewer" ? (
          <>
            <button
              type="button"
              data-testid="private-session-open-camera"
              onClick={() => {
                void requestMedia();
              }}
              className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-400"
            >
              Kameramı Aç
            </button>
            <button
              type="button"
              data-testid="private-session-mic-toggle"
              onClick={toggleMic}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700"
            >
              {isMicEnabled ? "Mikrofonu Kapat" : "Mikrofonu Aç"}
            </button>
            <button
              type="button"
              data-testid="private-session-camera-toggle"
              onClick={toggleCamera}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700"
            >
              {isCameraEnabled ? "Kamerayı Kapat" : "Kamerayı Aç"}
            </button>
          </>
        ) : null}

        {enableWebRtc && onSendSignal ? (
          <button
            type="button"
            data-testid="private-webrtc-start-button"
            disabled={
              webrtc.connectionState === "creating" ||
              webrtc.connectionState === "connecting" ||
              webrtc.connectionState === "connected"
            }
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-60"
            onClick={() => {
              void webrtc.startConnection();
            }}
          >
            Bağlantıyı Başlat
          </button>
        ) : null}

        <button
          type="button"
          data-testid="private-session-end-button"
          onClick={() => {
            void onEnd();
          }}
          disabled={isEnding || isAutoEnding}
          className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {isEnding ? "Bitiriliyor..." : "Özel Görüşmeyi Bitir"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {stream ? (
          <div className="w-28 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950">
            <video
              ref={localVideoRef}
              muted
              autoPlay
              playsInline
              className="aspect-video w-full object-cover"
              data-testid="private-session-local-preview"
            />
          </div>
        ) : null}
        {webrtc.remoteStream ? (
          <div className="w-28 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="aspect-video w-full object-cover"
              data-testid="private-session-remote-preview"
            />
          </div>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-zinc-600" data-testid="private-webrtc-state">
        WebRTC: {mapWebRtcConnectionLabel(webrtc.connectionState)}
      </p>
      {webrtc.errorMessage ? (
        <p className="mt-1 text-xs font-semibold text-rose-700" data-testid="private-webrtc-error">
          {webrtc.errorMessage}
        </p>
      ) : null}
      {signalingErrorText ? (
        <p className="mt-1 text-xs font-semibold text-amber-700" data-testid="private-signal-error">
          {signalingErrorText}
        </p>
      ) : null}

      <p className="mt-3 text-sm font-semibold text-zinc-800" data-testid="private-session-timer">
        Geçen süre: {formatElapsed(elapsedSeconds)}
      </p>
      {typeof estimatedRemainingMinutes === "number" ? (
        <p className="mt-1 text-sm font-semibold text-zinc-800" data-testid="private-session-remaining">
          {currentUserRole === "viewer" ? "Yaklaşık kalan süre" : "Üyenin yaklaşık kalan süresi"}: {estimatedRemainingMinutes} dk
        </p>
      ) : null}
      <p className="mt-1 text-xs text-zinc-600">Bu oturum en az 1 dk olarak ücretlendirilir.</p>
      {showLowBalanceWarning ? (
        <p className="mt-1 text-xs font-medium text-amber-700" data-testid="private-session-low-balance-warning">
          Dakika bakiyeniz azalıyor. Özel görüşme kısa süre içinde kapanabilir.
        </p>
      ) : null}
      {isAutoEnding ? (
        <p className="mt-1 text-xs font-medium text-rose-700" data-testid="private-session-auto-ending">
          {autoEndReason}
        </p>
      ) : null}
      {resultText ? (
        <p className="mt-2 text-xs font-semibold text-violet-700" data-testid="private-session-result">
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
