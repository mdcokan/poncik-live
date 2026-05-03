"use client";

import { useEffect, useRef, useState } from "react";
import { useLocalMediaPreview } from "@/hooks/use-local-media-preview";

type PrivateRoomMediaPrepProps = {
  roleLabel: string;
  participantName: string;
  initialReady?: boolean;
  onReadyChange?: (ready: boolean) => void | Promise<void>;
  onStreamChange?: (stream: MediaStream | null) => void;
};

export default function PrivateRoomMediaPrep({
  roleLabel,
  participantName,
  initialReady = false,
  onReadyChange,
  onStreamChange,
}: PrivateRoomMediaPrepProps) {
  const {
    isSupported,
    isRequesting,
    permissionState,
    errorMessage,
    stream,
    videoDevices,
    audioDevices,
    selectedVideoDeviceId,
    selectedAudioDeviceId,
    isCameraEnabled,
    isMicEnabled,
    requestMedia,
    toggleCamera,
    toggleMic,
    selectVideoDevice,
    selectAudioDevice,
  } = useLocalMediaPreview();

  const [isReady, setIsReady] = useState(initialReady);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }
    videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    setIsReady(initialReady);
  }, [initialReady]);

  useEffect(() => {
    onStreamChange?.(stream ?? null);
  }, [stream, onStreamChange]);

  return (
    <section className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm" data-testid="private-media-prep">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-500">{roleLabel}</p>
      <h3 className="mt-1 text-base font-black text-zinc-900">Kamera ve Mikrofon Hazırlığı</h3>
      <p className="mt-1 text-xs text-zinc-600">Özel oda başlamadan önce kameranızı ve mikrofonunuzu kontrol edin.</p>
      <p className="mt-1 text-xs text-zinc-500">{participantName}</p>

      <div className="relative mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950">
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          className={stream ? "aspect-video w-full object-cover" : "hidden"}
          data-testid="private-media-video"
          data-has-stream={stream ? "true" : "false"}
          data-camera-enabled={stream ? (isCameraEnabled ? "true" : "false") : "false"}
        />
        {stream && !isCameraEnabled ? (
          <div
            className="absolute inset-0 flex aspect-video w-full items-center justify-center bg-zinc-950/95 px-4 text-center text-xs font-semibold text-zinc-200"
            data-testid="private-media-camera-off-overlay"
          >
            Kamera kapalı
          </div>
        ) : null}
        {!stream ? (
          <div
            className="flex aspect-video w-full items-center justify-center px-4 text-center text-xs font-medium text-zinc-300"
            data-testid="private-media-placeholder"
          >
            Kamera önizlemesi burada görünecek
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold text-zinc-700">
          Kamera
          <select
            data-testid="private-media-video-select"
            value={selectedVideoDeviceId}
            onChange={(event) => {
              void selectVideoDevice(event.target.value);
            }}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none"
          >
            {videoDevices.length === 0 ? (
              <option value="">Cihaz bulunamadı</option>
            ) : (
              videoDevices.map((device, index) => (
                <option key={device.deviceId || `video-${index}`} value={device.deviceId}>
                  {device.label || `Kamera ${index + 1}`}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="grid gap-1 text-xs font-semibold text-zinc-700">
          Mikrofon
          <select
            data-testid="private-media-audio-select"
            value={selectedAudioDeviceId}
            onChange={(event) => {
              void selectAudioDevice(event.target.value);
            }}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none"
          >
            {audioDevices.length === 0 ? (
              <option value="">Cihaz bulunamadı</option>
            ) : (
              audioDevices.map((device, index) => (
                <option key={device.deviceId || `audio-${index}`} value={device.deviceId}>
                  {device.label || `Mikrofon ${index + 1}`}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="private-media-request-button"
          onClick={() => {
            void requestMedia();
          }}
          disabled={isRequesting}
          className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {isRequesting ? "İzin İsteniyor..." : "Kamera/Mikrofon İzni Ver"}
        </button>
        <button
          type="button"
          data-testid="private-media-camera-toggle"
          onClick={toggleCamera}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700"
        >
          {isCameraEnabled ? "Kamerayı Kapat" : "Kamerayı Aç"}
        </button>
        <button
          type="button"
          data-testid="private-media-mic-toggle"
          onClick={toggleMic}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700"
        >
          {isMicEnabled ? "Mikrofonu Kapat" : "Mikrofonu Aç"}
        </button>
        <button
          type="button"
          data-testid="private-media-ready-toggle"
          onClick={() => {
            const nextReady = !isReady;
            setIsReady(nextReady);
            void onReadyChange?.(nextReady);
          }}
          className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white"
        >
          {isReady ? "Hazır Değilim" : "Hazırım"}
        </button>
      </div>

      {!isSupported ? (
        <p className="mt-2 text-xs text-amber-700">Tarayıcı desteği yok. Simülasyon olarak hazır durumuna geçebilirsiniz.</p>
      ) : null}
      {permissionState !== "granted" && isReady ? (
        <p className="mt-2 text-xs text-amber-700">Medya izni olmadan da hazırlık durumuna geçtiniz (simülasyon).</p>
      ) : null}
      {errorMessage ? (
        <p className="mt-2 text-xs font-semibold text-rose-700" data-testid="private-media-error">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-2">
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${isReady ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>
          {isReady ? "Ben hazırım" : "Hazırlık bekleniyor"}
        </span>
      </div>
    </section>
  );
}
