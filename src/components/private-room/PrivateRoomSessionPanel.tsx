"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useLocalMediaPreview } from "@/hooks/use-local-media-preview";
import type { PrivateRoomSignal, PrivateRoomSignalType } from "@/hooks/use-private-room-signaling";
import { usePrivateRoomWebRtc } from "@/hooks/use-private-room-webrtc";
import PrivateLocalPip from "@/components/private-room/PrivateLocalPip";

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
  stageOverlayRef?: RefObject<HTMLElement | null>;
  compact?: boolean;
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

function usePortalTarget(anchorRef?: RefObject<HTMLElement | null>, refreshKey?: string) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!anchorRef) {
      setTarget(null);
      return;
    }
    const syncTarget = () => {
      setTarget(anchorRef.current);
    };
    syncTarget();
    const timer = window.setTimeout(syncTarget, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [anchorRef, refreshKey]);

  return target;
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
  stageOverlayRef,
  compact = false,
}: PrivateRoomSessionPanelProps) {
  const { stream, isCameraEnabled, isMicEnabled, requestMedia, toggleCamera, toggleMic } = useLocalMediaPreview();
  const autoEndTriggeredRef = useRef(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isAutoEnding, setIsAutoEnding] = useState(false);
  const [isLocalPipExpanded, setIsLocalPipExpanded] = useState(false);
  const [isRemotePipExpanded, setIsRemotePipExpanded] = useState(false);
  const [isRemotePipVisible, setIsRemotePipVisible] = useState(true);
  const stagePortalTarget = usePortalTarget(stageOverlayRef, sessionId);

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

  useEffect(() => {
    if (webrtc.remoteStream) {
      setIsRemotePipVisible(true);
    }
  }, [webrtc.remoteStream]);

  const stagePipOverlay =
    stagePortalTarget && currentUserRole === "viewer" && stream && isCameraEnabled ? (
      <PrivateLocalPip
        stream={stream}
        visible
        expanded={isLocalPipExpanded}
        onToggleSize={() => {
          setIsLocalPipExpanded((previous) => !previous);
        }}
        onClose={() => {
          toggleCamera();
        }}
        mirror
      />
    ) : stagePortalTarget && currentUserRole === "streamer" && webrtc.remoteStream && isRemotePipVisible ? (
      <PrivateLocalPip
        stream={webrtc.remoteStream}
        visible
        expanded={isRemotePipExpanded}
        onToggleSize={() => {
          setIsRemotePipExpanded((previous) => !previous);
        }}
        onClose={() => {
          setIsRemotePipVisible(false);
        }}
        testId="private-remote-pip"
        videoTestId="private-remote-pip-video"
      />
    ) : null;

  return (
  <>
    {stagePortalTarget && stagePipOverlay ? createPortal(stagePipOverlay, stagePortalTarget) : null}
    <section
      className={compact ? "mt-0 border-0 bg-transparent p-0" : "mt-1 rounded-xl border border-violet-200 bg-violet-50/80 p-2.5"}
      data-testid="private-session-panel"
      data-session-id={sessionId}
      data-current-role={currentUserRole}
    >
      <div className="flex flex-wrap items-center gap-1.5" data-testid="private-session-control-bar">
        <span
          data-testid="private-session-active-badge"
          className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-bold text-violet-700"
        >
          Özel görüşme
        </span>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700">{displayOtherUserName}</span>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700" data-testid="private-session-timer">
          Geçen süre: {formatElapsed(elapsedSeconds)}
        </span>
        <span
          data-testid="private-session-rate-badge"
          className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
        >
          {`${estimatedChargedMinutes} dk`}
        </span>
        {typeof estimatedRemainingMinutes === "number" ? (
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700" data-testid="private-session-remaining">
            {currentUserRole === "viewer" ? `Kalan ${estimatedRemainingMinutes} dk` : `Üye kalan ${estimatedRemainingMinutes} dk`}
          </span>
        ) : null}

        {currentUserRole === "viewer" ? (
          <>
            <button
              type="button"
              data-testid="private-session-open-camera"
              onClick={() => {
                if (!stream) {
                  void requestMedia();
                  return;
                }
                toggleCamera();
              }}
              className="rounded-lg bg-violet-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-400"
            >
              Kamera
            </button>
            <button
              type="button"
              data-testid="private-session-mic-toggle"
              onClick={toggleMic}
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700"
            >
              Mikrofon
            </button>
            <button
              type="button"
              data-testid="private-session-camera-toggle"
              onClick={toggleCamera}
              className="hidden"
              aria-hidden
            >
              {isCameraEnabled ? "Kamera Kapat" : "Kamera Ac"}
            </button>
          </>
        ) : null}

        {enableWebRtc && onSendSignal ? (
          <button
            type="button"
            data-testid="private-webrtc-start-button"
            data-connection-state={webrtc.connectionState}
            disabled={webrtc.connectionState === "creating" || webrtc.connectionState === "connecting"}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 disabled:opacity-60"
            onClick={() => {
              if (webrtc.connectionState === "connected") {
                webrtc.closeConnection();
                return;
              }
              void webrtc.startConnection();
            }}
          >
            {webrtc.connectionState === "connected" ? "Bağlantıyı Kapat" : "Bağlan"}
          </button>
        ) : null}

        <button
          type="button"
          data-testid="private-session-end-button"
          onClick={() => {
            void onEnd();
          }}
          disabled={isEnding || isAutoEnding}
          className="rounded-lg bg-rose-500 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
        >
          {isEnding ? "Bitiriliyor..." : "Özeli Bitir"}
        </button>
      </div>

      <p className="sr-only" data-testid="private-session-participants">
        Yayıncı: {streamerName || "Yayıncı"} • Üye: {viewerName || "Üye"}
      </p>

      <span className="sr-only" data-testid="private-webrtc-state" data-connection-state={webrtc.connectionState}>
        {mapWebRtcConnectionLabel(webrtc.connectionState)}
      </span>

      {webrtc.errorMessage ? (
        <p className="mt-1.5 text-xs font-semibold text-rose-700" data-testid="private-webrtc-error">
          {webrtc.errorMessage}
        </p>
      ) : null}
      {signalingErrorText ? (
        <p className="mt-1.5 text-xs font-semibold text-amber-700" data-testid="private-signal-error">
          {signalingErrorText}
        </p>
      ) : null}
      {showLowBalanceWarning ? (
        <p className="mt-1.5 text-[11px] font-medium text-amber-700" data-testid="private-session-low-balance-warning">
          Dakika bakiyeniz azalıyor. Özel görüşme kısa süre içinde kapanabilir.
        </p>
      ) : null}
      {isAutoEnding ? (
        <p className="mt-1.5 text-xs font-medium text-rose-700" data-testid="private-session-auto-ending">
          {autoEndReason}
        </p>
      ) : null}
      {resultText ? (
        <p className="mt-1.5 text-xs font-semibold text-violet-700" data-testid="private-session-result">
          {resultText}
        </p>
      ) : null}
      {errorText ? (
        <p className="mt-1.5 text-xs font-semibold text-rose-700" data-testid="private-session-error">
          {errorText}
        </p>
      ) : null}
    </section>
  </>
  );
}
