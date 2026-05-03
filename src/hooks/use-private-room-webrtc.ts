"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type PrivateRoomSignal,
  type PrivateRoomSignalType,
  parseWebRtcIceCandidate,
  parseWebRtcSessionDescription,
} from "@/hooks/use-private-room-signaling";

export type PrivateRoomWebRtcConnectionState =
  | "idle"
  | "creating"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed";

export type PrivateRoomWebRtcLastSignal = PrivateRoomSignal | null;

type SendSignalFn = (signalType: PrivateRoomSignalType, payload?: Record<string, unknown>) => Promise<void>;

type UsePrivateRoomWebRtcOptions = {
  sessionId: string | null;
  enabled: boolean;
  currentUserRole: "viewer" | "streamer";
  /** Required to ignore signals we sent ourselves (lastSignal mirrors outbound sends). */
  currentUserId: string | null;
  localStream: MediaStream | null;
  sendSignal: SendSignalFn;
  lastSignal: PrivateRoomWebRtcLastSignal;
};

const PeerConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function stopRemoteStreamTracks(stream: MediaStream | null) {
  if (!stream) {
    return;
  }
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function usePrivateRoomWebRtc({
  sessionId,
  enabled,
  currentUserRole,
  currentUserId,
  localStream,
  sendSignal,
  lastSignal,
}: UsePrivateRoomWebRtcOptions) {
  const isCaller = currentUserRole === "streamer";

  const [connectionState, setConnectionState] = useState<PrivateRoomWebRtcConnectionState>("idle");
  const [iceConnectionState, setIceConnectionState] = useState<string>("");
  const [signalingState, setSignalingState] = useState<string>("");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const processedSignalIdsRef = useRef(new Set<string>());
  const remoteIceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const startInFlightRef = useRef(false);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const flushRemoteIceQueue = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc?.remoteDescription) {
      return;
    }
    const queued = remoteIceQueueRef.current.splice(0);
    for (const init of queued) {
      try {
        await pc.addIceCandidate(init);
      } catch {
        setErrorMessage((prev) => prev ?? "Bağlantı bilgisi işlenemedi.");
      }
    }
  }, []);

  const pushRemoteIce = useCallback(
    async (init: RTCIceCandidateInit) => {
      const pc = pcRef.current;
      if (!pc) {
        remoteIceQueueRef.current.push(init);
        return;
      }
      if (!pc.remoteDescription) {
        remoteIceQueueRef.current.push(init);
        return;
      }
      try {
        await pc.addIceCandidate(init);
      } catch {
        setErrorMessage((prev) => prev ?? "Bağlantı bilgisi işlenemedi.");
      }
    },
    [],
  );

  const syncStatesFromPc = useCallback((pc: RTCPeerConnection) => {
    setIceConnectionState(pc.iceConnectionState ?? "");
    setSignalingState(pc.signalingState ?? "");
    const cs = pc.connectionState;
    if (cs === "connected") {
      setConnectionState("connected");
      setErrorMessage(null);
    } else if (cs === "disconnected") {
      setConnectionState("disconnected");
      setErrorMessage("Bağlantı kesildi.");
    } else if (cs === "failed") {
      setConnectionState("failed");
      setErrorMessage("Görüntülü bağlantı kurulamadı. Lütfen tekrar deneyin.");
    } else if (cs === "closed") {
      setConnectionState("closed");
    } else if (cs === "connecting") {
      setConnectionState((prev) => (prev === "creating" ? "connecting" : prev === "idle" ? "connecting" : "connecting"));
    }
  }, []);

  const attachLocalTracks = useCallback((pc: RTCPeerConnection, stream: MediaStream | null) => {
    if (!stream) {
      return;
    }
    const senderTrackIds = new Set(
      pc
        .getSenders()
        .map((s) => s.track?.id)
        .filter((id): id is string => Boolean(id)),
    );
    for (const track of stream.getTracks()) {
      if (senderTrackIds.has(track.id)) {
        continue;
      }
      try {
        pc.addTrack(track, stream);
        senderTrackIds.add(track.id);
      } catch {
        setErrorMessage((prev) => prev ?? "Yerel medya bağlanamadı.");
      }
    }
  }, []);

  const closeConnection = useCallback(() => {
    remoteIceQueueRef.current = [];
    const pc = pcRef.current;
    if (!pc) {
      return;
    }
    pcRef.current = null;
    pc.onconnectionstatechange = null;
    pc.onicecandidate = null;
    pc.oniceconnectionstatechange = null;
    pc.onnegotiationneeded = null;
    pc.onsignalingstatechange = null;
    pc.ontrack = null;
    try {
      pc.close();
    } catch {
      // ignore
    }
    remoteStreamRef.current = null;
    setRemoteStream((prev) => {
      stopRemoteStreamTracks(prev);
      return null;
    });
    setConnectionState("closed");
    setIceConnectionState("");
    setSignalingState("");
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(PeerConfig);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (!sessionId) {
        return;
      }
      const cand = event.candidate;
      if (!cand) {
        return;
      }
      try {
        void sendSignal("ice_candidate", cand.toJSON() as Record<string, unknown>);
      } catch {
        setErrorMessage((m) => m ?? "ICE adayı gönderilemedi.");
      }
    };

    pc.ontrack = (event) => {
      const [firstFromEvent] = event.streams;

      if (firstFromEvent) {
        const existing = remoteStreamRef.current;
        if (!existing || existing.id !== firstFromEvent.id) {
          if (existing && existing !== firstFromEvent) {
            stopRemoteStreamTracks(existing);
          }
          remoteStreamRef.current = firstFromEvent;
          setRemoteStream((prev) => (prev === firstFromEvent ? prev : firstFromEvent));
          return;
        }
        if (!existing.getTracks().some((t) => t.id === event.track.id)) {
          try {
            existing.addTrack(event.track);
          } catch {
            setErrorMessage((prev) => prev ?? "Uzak medya akışı güncellenemedi.");
          }
        }
        return;
      }

      let working = remoteStreamRef.current;
      if (!working) {
        working = new MediaStream();
        remoteStreamRef.current = working;
        setRemoteStream(working);
      }
      if (!working.getTracks().some((t) => t.id === event.track.id)) {
        try {
          working.addTrack(event.track);
        } catch {
          setErrorMessage((prev) => prev ?? "Uzak medya akışı güncellenemedi.");
        }
      }
    };

    pc.onconnectionstatechange = () => {
      syncStatesFromPc(pc);
    };
    pc.oniceconnectionstatechange = () => {
      setIceConnectionState(pc.iceConnectionState ?? "");
    };
    pc.onsignalingstatechange = () => {
      setSignalingState(pc.signalingState ?? "");
    };

    attachLocalTracks(pc, localStream);
    return pc;
  }, [attachLocalTracks, localStream, sendSignal, sessionId, syncStatesFromPc]);

  const startConnection = useCallback(async () => {
    if (typeof window === "undefined" || typeof RTCPeerConnection === "undefined") {
      return;
    }
    if (startInFlightRef.current) {
      return;
    }
    if (!enabled || !sessionId?.trim()) {
      setErrorMessage("Özel oda oturumu aktif değil.");
      return;
    }

    const existing = pcRef.current;
    if (existing) {
      const ecs = existing.connectionState;
      if (ecs === "connected" || ecs === "connecting") {
        return;
      }
    }

    setErrorMessage(null);
    startInFlightRef.current = true;

    try {
      if (pcRef.current) {
        closeConnection();
      }

      setConnectionState("creating");

      const pc = createPeerConnection();

      if (isCaller) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        setConnectionState("connecting");
        await sendSignal("offer", {
          type: offer.type,
          sdp: offer.sdp ?? "",
        });
      } else {
        setConnectionState("connecting");
      }

      syncStatesFromPc(pc);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bağlantı başlatılamadı.";
      setErrorMessage(msg);
      setConnectionState("failed");
      closeConnection();
    } finally {
      startInFlightRef.current = false;
    }
  }, [closeConnection, createPeerConnection, enabled, isCaller, sendSignal, sessionId, syncStatesFromPc]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!enabled || !sessionId?.trim()) {
      closeConnection();
      setConnectionState("idle");
      processedSignalIdsRef.current.clear();
      setErrorMessage(null);
    }
  }, [closeConnection, enabled, sessionId]);

  useEffect(() => {
    processedSignalIdsRef.current.clear();
  }, [sessionId]);

  useEffect(() => {
    if (typeof window === "undefined" || !enabled || !sessionId?.trim()) {
      return;
    }
    const pc = pcRef.current;
    if (!pc || !localStream) {
      return;
    }
    const senderTrackIds = new Set(
      pc
        .getSenders()
        .map((s) => s.track?.id)
        .filter((id): id is string => Boolean(id)),
    );
    for (const track of localStream.getTracks()) {
      if (senderTrackIds.has(track.id)) {
        continue;
      }
      try {
        pc.addTrack(track, localStream);
        senderTrackIds.add(track.id);
      } catch {
        setErrorMessage((p) => p ?? "Yerel medya bağlanamadı.");
      }
    }
  }, [enabled, localStream, sessionId]);

  useEffect(() => {
    return () => {
      closeConnection();
    };
  }, [closeConnection]);

  useEffect(() => {
    if (typeof window === "undefined" || !enabled || !sessionId?.trim() || !lastSignal) {
      return;
    }
    if (!currentUserId || lastSignal.senderId === currentUserId) {
      return;
    }
    const signalId = lastSignal.id;
    if (signalId && processedSignalIdsRef.current.has(signalId)) {
      return;
    }

    const type = lastSignal.signalType;
    if (type === "ready_ping") {
      return;
    }
    if (type === "hangup") {
      closeConnection();
      setConnectionState("closed");
      if (signalId) {
        processedSignalIdsRef.current.add(signalId);
      }
      return;
    }

    void (async () => {
      try {
        if (type === "offer") {
          if (!isCaller) {
            const desc = parseWebRtcSessionDescription(lastSignal.payload);
            if (!desc) {
              if (signalId) {
                processedSignalIdsRef.current.add(signalId);
              }
              return;
            }
            let pc = pcRef.current;
            if (!pc) {
              setConnectionState("connecting");
              pc = createPeerConnection();
            }
            await pc.setRemoteDescription(desc);
            await flushRemoteIceQueue();
            if (pc.signalingState === "have-remote-offer") {
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await sendSignal("answer", {
                type: answer.type,
                sdp: answer.sdp ?? "",
              });
            }
            syncStatesFromPc(pc);
            if (signalId) {
              processedSignalIdsRef.current.add(signalId);
            }
          } else if (signalId) {
            processedSignalIdsRef.current.add(signalId);
          }
          return;
        }

        if (type === "answer") {
          if (isCaller && pcRef.current) {
            const desc = parseWebRtcSessionDescription(lastSignal.payload);
            if (!desc) {
              if (signalId) {
                processedSignalIdsRef.current.add(signalId);
              }
              return;
            }
            const pc = pcRef.current;
            await pc.setRemoteDescription(desc);
            await flushRemoteIceQueue();
            syncStatesFromPc(pc);
            if (signalId) {
              processedSignalIdsRef.current.add(signalId);
            }
          } else if (signalId) {
            processedSignalIdsRef.current.add(signalId);
          }
          return;
        }

        if (type === "ice_candidate") {
          const init = parseWebRtcIceCandidate(lastSignal.payload);
          if (!init) {
            if (signalId) {
              processedSignalIdsRef.current.add(signalId);
            }
            return;
          }
          await pushRemoteIce(init);
          if (signalId) {
            processedSignalIdsRef.current.add(signalId);
          }
          return;
        }
      } catch (e) {
        const raw = e instanceof Error ? e.message : "Sinyal işlenemedi.";
        const friendly = /setRemoteDescription|setLocalDescription|addIceCandidate|createAnswer|createOffer/i.test(raw)
          ? "Uzak bağlantı ayarı güncellenemedi."
          : raw;
        setErrorMessage(friendly);
        if (signalId) {
          processedSignalIdsRef.current.add(signalId);
        }
      }
    })();
  }, [
    closeConnection,
    createPeerConnection,
    currentUserId,
    enabled,
    flushRemoteIceQueue,
    isCaller,
    lastSignal,
    pushRemoteIce,
    sendSignal,
    sessionId,
    syncStatesFromPc,
  ]);

  if (typeof window === "undefined") {
    return {
      connectionState: "idle" as const,
      iceConnectionState: "",
      signalingState: "",
      remoteStream: null,
      errorMessage: null,
      isCaller,
      startConnection: async () => {},
      closeConnection: () => {},
    };
  }

  return {
    connectionState,
    iceConnectionState,
    signalingState,
    remoteStream,
    errorMessage,
    isCaller,
    startConnection,
    closeConnection,
  };
}
