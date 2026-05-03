"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export type PrivateRoomSignalType = "offer" | "answer" | "ice_candidate" | "ready_ping" | "hangup";

export type PrivateRoomSignal = {
  id: string;
  sessionId: string;
  senderId: string;
  receiverId: string;
  signalType: PrivateRoomSignalType;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
};

export function parseWebRtcSessionDescription(payload: Record<string, unknown>): RTCSessionDescriptionInit | null {
  const sdp = typeof payload.sdp === "string" ? payload.sdp : null;
  const typeRaw = typeof payload.type === "string" ? payload.type : null;
  if (!sdp?.trim() || !typeRaw) {
    return null;
  }
  if (typeRaw !== "offer" && typeRaw !== "answer" && typeRaw !== "pranswer" && typeRaw !== "rollback") {
    return null;
  }
  return { type: typeRaw as RTCSdpType, sdp };
}

export function parseWebRtcIceCandidate(payload: Record<string, unknown>): RTCIceCandidateInit | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const init: RTCIceCandidateInit = {};
  if ("candidate" in payload) {
    const c = payload.candidate;
    if (c !== null && typeof c !== "string") {
      return null;
    }
    if (typeof c === "string") {
      init.candidate = c;
    }
  }
  if (typeof payload.sdpMid === "string") {
    init.sdpMid = payload.sdpMid;
  } else if (payload.sdpMid === null) {
    init.sdpMid = null;
  }
  if (typeof payload.sdpMLineIndex === "number") {
    init.sdpMLineIndex = payload.sdpMLineIndex;
  } else if (payload.sdpMLineIndex === null) {
    init.sdpMLineIndex = null;
  }
  if (typeof payload.usernameFragment === "string") {
    init.usernameFragment = payload.usernameFragment;
  }
  if (Object.keys(init).length === 0) {
    return null;
  }
  return init;
}

type UsePrivateRoomSignalingOptions = {
  sessionId: string;
  enabled: boolean;
};

type ApiSignalClient = {
  id: string;
  sessionId: string;
  senderId: string;
  receiverId: string;
  signalType: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  readAt?: string | null;
};

function isParticipantSignal(row: ApiSignalClient, userId: string) {
  return row.senderId === userId || row.receiverId === userId;
}

function normalizeSignal(row: ApiSignalClient): PrivateRoomSignal | null {
  const t = row.signalType;
  if (t !== "offer" && t !== "answer" && t !== "ice_candidate" && t !== "ready_ping" && t !== "hangup") {
    return null;
  }
  return {
    id: row.id,
    sessionId: row.sessionId,
    senderId: row.senderId,
    receiverId: row.receiverId,
    signalType: t,
    payload: row.payload ?? {},
    createdAt: row.createdAt,
    readAt: row.readAt ?? null,
  };
}

export function usePrivateRoomSignaling({ sessionId, enabled }: UsePrivateRoomSignalingOptions) {
  const [signals, setSignals] = useState<PrivateRoomSignal[]>([]);
  const [lastSignal, setLastSignal] = useState<PrivateRoomSignal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seenIdsRef = useRef(new Set<string>());

  const mergeIncoming = useCallback((row: PrivateRoomSignal) => {
    if (seenIdsRef.current.has(row.id)) {
      setLastSignal(row);
      return;
    }
    seenIdsRef.current.add(row.id);
    setSignals((prev) => {
      const next = [...prev, row].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return next.slice(-100);
    });
    setLastSignal(row);
  }, []);

  const refreshSignals = useCallback(async () => {
    if (!sessionId.trim() || !enabled) {
      return;
    }
    setError(null);
    const supabase = getSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      setError("Giriş doğrulaması yapılamadı.");
      return;
    }

    const response = await fetch(`/api/private-sessions/${encodeURIComponent(sessionId)}/signals`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      signals?: ApiSignalClient[];
      message?: string;
    };
    if (!response.ok || !payload.ok || !Array.isArray(payload.signals)) {
      setError(payload.message || "Sinyaller alınamadı.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id;
    if (!userId) {
      setError("Giriş doğrulaması yapılamadı.");
      return;
    }

    const normalized: PrivateRoomSignal[] = [];
    for (const raw of payload.signals) {
      if (!isParticipantSignal(raw, userId)) {
        continue;
      }
      const n = normalizeSignal(raw);
      if (n) {
        normalized.push(n);
      }
    }
    normalized.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    seenIdsRef.current = new Set(normalized.map((s) => s.id));
    setSignals(normalized);
    setLastSignal(normalized.length ? normalized[normalized.length - 1] : null);
  }, [enabled, sessionId]);

  const sendSignal = useCallback(
    async (signalType: PrivateRoomSignalType, payload: Record<string, unknown> = {}) => {
      if (!sessionId.trim()) {
        throw new Error("SESSION_NOT_FOUND");
      }
      setError(null);
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setError("Giriş doğrulaması yapılamadı.");
        throw new Error("AUTH_REQUIRED");
      }

      const response = await fetch(`/api/private-sessions/${encodeURIComponent(sessionId)}/signals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ signalType, payload }),
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        signal?: ApiSignalClient;
        message?: string;
        code?: string;
      };
      if (!response.ok || !body.ok || !body.signal) {
        setError(body.message || "Sinyal gönderilemedi.");
        throw new Error(body.code || "SEND_FAILED");
      }
      const normalized = normalizeSignal({ ...body.signal, payload: body.signal.payload ?? payload });
      if (normalized) {
        mergeIncoming(normalized);
      }
    },
    [mergeIncoming, sessionId],
  );

  useEffect(() => {
    if (!enabled || !sessionId.trim()) {
      seenIdsRef.current = new Set();
      setSignals([]);
      setLastSignal(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id || cancelled) {
        return;
      }
      await refreshSignals();
    })();

    const channel = supabase
      .channel(`private-room-signals:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "private_room_signals",
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row || typeof row.id !== "string") {
            return;
          }
          if (String(row.session_id) !== sessionId) {
            return;
          }
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const userId = user?.id;
          if (!userId) {
            return;
          }
          const senderId = row.sender_id;
          const receiverId = row.receiver_id;
          if (senderId !== userId && receiverId !== userId) {
            return;
          }
          const raw: ApiSignalClient = {
            id: row.id as string,
            sessionId: row.session_id as string,
            senderId: row.sender_id as string,
            receiverId: row.receiver_id as string,
            signalType: String(row.signal_type),
            payload: (row.payload as Record<string, unknown>) ?? {},
            createdAt: String(row.created_at),
            readAt: (row.read_at as string | null) ?? null,
          };
          const normalized = normalizeSignal(raw);
          if (normalized) {
            mergeIncoming(normalized);
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void refreshSignals();
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [enabled, mergeIncoming, refreshSignals, sessionId]);

  return {
    signals,
    lastSignal,
    error,
    sendSignal,
    refreshSignals,
  };
}
