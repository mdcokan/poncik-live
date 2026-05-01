"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PermissionState = "idle" | "granted" | "denied" | "error";

type MediaDeviceInfoList = {
  videoDevices: MediaDeviceInfo[];
  audioDevices: MediaDeviceInfo[];
};

function getUnsupportedMessage() {
  return "Tarayıcınız kamera/mikrofon erişimini desteklemiyor.";
}

function getDeniedMessage() {
  return "Kamera veya mikrofon izni alınamadı.";
}

function getDeviceLists(devices: MediaDeviceInfo[]): MediaDeviceInfoList {
  return {
    videoDevices: devices.filter((device) => device.kind === "videoinput"),
    audioDevices: devices.filter((device) => device.kind === "audioinput"),
  };
}

export function useLocalMediaPreview() {
  const isSupported = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return (
      typeof window.navigator?.mediaDevices?.getUserMedia === "function" &&
      typeof window.navigator?.mediaDevices?.enumerateDevices === "function"
    );
  }, []);

  const [isRequesting, setIsRequesting] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>("");
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>("");
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isMicEnabled, setIsMicEnabled] = useState(true);

  const stopMedia = useCallback(() => {
    setStream((previousStream) => {
      if (previousStream) {
        for (const track of previousStream.getTracks()) {
          track.stop();
        }
      }
      return null;
    });
  }, []);

  const refreshDeviceList = useCallback(async () => {
    if (!isSupported) {
      setVideoDevices([]);
      setAudioDevices([]);
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const { videoDevices: nextVideoDevices, audioDevices: nextAudioDevices } = getDeviceLists(devices);
      setVideoDevices(nextVideoDevices);
      setAudioDevices(nextAudioDevices);
      if (nextVideoDevices.length === 0) {
        setSelectedVideoDeviceId("");
      } else if (!nextVideoDevices.some((device) => device.deviceId === selectedVideoDeviceId)) {
        setSelectedVideoDeviceId(nextVideoDevices[0]?.deviceId ?? "");
      }
      if (nextAudioDevices.length === 0) {
        setSelectedAudioDeviceId("");
      } else if (!nextAudioDevices.some((device) => device.deviceId === selectedAudioDeviceId)) {
        setSelectedAudioDeviceId(nextAudioDevices[0]?.deviceId ?? "");
      }
    } catch {
      setVideoDevices([]);
      setAudioDevices([]);
    }
  }, [isSupported, selectedAudioDeviceId, selectedVideoDeviceId]);

  const requestMedia = useCallback(
    async (overrides?: { videoDeviceId?: string; audioDeviceId?: string }) => {
    if (!isSupported) {
      setPermissionState("error");
      setErrorMessage(getUnsupportedMessage());
      return;
    }

    setIsRequesting(true);
    setErrorMessage(null);
    try {
      const videoDeviceId = overrides?.videoDeviceId ?? selectedVideoDeviceId;
      const audioDeviceId = overrides?.audioDeviceId ?? selectedAudioDeviceId;
      const videoConstraint = videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true;
      const audioConstraint = audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true;
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: audioConstraint,
      });

      stopMedia();

      for (const track of nextStream.getVideoTracks()) {
        track.enabled = isCameraEnabled;
      }
      for (const track of nextStream.getAudioTracks()) {
        track.enabled = isMicEnabled;
      }

      setStream(nextStream);
      setPermissionState("granted");
      await refreshDeviceList();
    } catch (error) {
      const denied =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "PermissionDeniedError" || error.name === "SecurityError");
      setPermissionState(denied ? "denied" : "error");
      setErrorMessage(getDeniedMessage());
      stopMedia();
    } finally {
      setIsRequesting(false);
    }
    },
    [
      isCameraEnabled,
      isMicEnabled,
      isSupported,
      refreshDeviceList,
      selectedAudioDeviceId,
      selectedVideoDeviceId,
      stopMedia,
    ],
  );

  const toggleCamera = useCallback(() => {
    setIsCameraEnabled((previous) => {
      const next = !previous;
      if (stream) {
        for (const track of stream.getVideoTracks()) {
          track.enabled = next;
        }
      }
      return next;
    });
  }, [stream]);

  const toggleMic = useCallback(() => {
    setIsMicEnabled((previous) => {
      const next = !previous;
      if (stream) {
        for (const track of stream.getAudioTracks()) {
          track.enabled = next;
        }
      }
      return next;
    });
  }, [stream]);

  const selectVideoDevice = useCallback(
    async (deviceId: string) => {
      setSelectedVideoDeviceId(deviceId);
      if (permissionState === "granted") {
        await requestMedia({ videoDeviceId: deviceId });
      }
    },
    [permissionState, requestMedia],
  );

  const selectAudioDevice = useCallback(
    async (deviceId: string) => {
      setSelectedAudioDeviceId(deviceId);
      if (permissionState === "granted") {
        await requestMedia({ audioDeviceId: deviceId });
      }
    },
    [permissionState, requestMedia],
  );

  useEffect(() => {
    if (!isSupported) {
      setPermissionState("error");
      setErrorMessage(getUnsupportedMessage());
      return;
    }
    void refreshDeviceList();
  }, [isSupported, refreshDeviceList]);

  useEffect(() => {
    return () => {
      stopMedia();
    };
  }, [stopMedia]);

  return {
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
    stopMedia,
    toggleCamera,
    toggleMic,
    selectVideoDevice,
    selectAudioDevice,
  };
}
