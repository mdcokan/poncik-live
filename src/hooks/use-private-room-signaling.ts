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

const MAX_SIGNALS = 50;

/** Dedupe by id, chronological order, keep the newest 50; last entry is the newest signal. */
function mergePrivateRoomSignals(prev: PrivateRoomSignal[], incoming: PrivateRoomSignal[]): PrivateRoomSignal[] {
  const byId = new Map<string, PrivateRoomSignal>();
  for (const s of prev) {
    byId.set(s.id, s);
  }
  for (const s of incoming) {
    byId.set(s.id, s);
  }
  const merged = Array.from(byId.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return merged.slice(-MAX_SIGNALS);
}

export function usePrivateRoomSignaling({ sessionId, enabled }: UsePrivateRoomSignalingOptions) {
  const [signals, setSignals] = useState<PrivateRoomSignal[]>([]);
  const [lastSignal, setLastSignal] = useState<PrivateRoomSignal | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshError, setLastRefreshError] = useState<string | null>(null);
  const [lastSendError, setLastSendError] = useState<string | null>(null);

  const signalsRef = useRef<PrivateRoomSignal[]>([]);
  signalsRef.current = signals;

  const applyMergedSignals = useCallback((merged: PrivateRoomSignal[]) => {
    setSignals(merged);
    setLastSignal(merged.length ? merged[merged.length - 1]! : null);
  }, []);

  const addSignals = useCallback(
    (incoming: PrivateRoomSignal[]) => {
      if (!incoming.length) {
        return;
      }
      const merged = mergePrivateRoomSignals(signalsRef.current, incoming);
      applyMergedSignals(merged);
    },
    [applyMergedSignals],
  );

  const refreshSignals = useCallback(async () => {
    if (!sessionId.trim() || !enabled) {
      return;
    }
    setLastRefreshError(null);
    setIsRefreshing(true);
    const supabase = getSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      setLastRefreshError("Giriş doğrulaması yapılamadı.");
      setIsRefreshing(false);
      return;
    }

    try {
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
        setLastRefreshError(payload.message || "Sinyaller alınamadı.");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userId = user?.id;
      if (!userId) {
        setLastRefreshError("Giriş doğrulaması yapılamadı.");
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

      const merged = mergePrivateRoomSignals(signalsRef.current, normalized);
      applyMergedSignals(merged);
    } catch {
      setLastRefreshError("Sinyaller alınamadı.");
    } finally {
      setIsRefreshing(false);
    }
  }, [applyMergedSignals, enabled, sessionId]);

  const sendSignal = useCallback(
    async (signalType: PrivateRoomSignalType, payload: Record<string, unknown> = {}) => {
      if (!sessionId.trim()) {
        setLastSendError("Özel oda oturumu bulunamadı.");
        throw new Error("SESSION_NOT_FOUND");
      }
      setLastSendError(null);
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setLastSendError("Giriş doğrulaması yapılamadı.");
        throw new Error("AUTH_REQUIRED");
      }

      let rejectedByApi = false;
      try {
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
          rejectedByApi = true;
          const msg = body.message || "Sinyal gönderilemedi.";
          setLastSendError(msg);
          throw new Error(body.code || "SEND_FAILED");
        }
        const normalized = normalizeSignal({
          ...body.signal,
          payload: body.signal.payload ?? payload,
        });
        if (normalized) {
          addSignals([normalized]);
        }
      } catch (err) {
        if (!rejectedByApi && err instanceof Error) {
          setLastSendError(err.message || "Sinyal gönderilemedi.");
        }
        throw err;
      }
    },
    [addSignals, sessionId],
  );

  useEffect(() => {
    if (!enabled || !sessionId.trim()) {
      signalsRef.current = [];
      setSignals([]);
      setLastSignal(null);
      setLastRefreshError(null);
      setLastSendError(null);
      setIsRefreshing(false);
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
            addSignals([normalized]);
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
  }, [addSignals, enabled, refreshSignals, sessionId]);

  const signalCount = signals.length;
  const lastSignalAt = lastSignal?.createdAt ?? null;

  return {
    signals,
    lastSignal,
    signalCount,
    lastSignalAt,
    isRefreshing,
    lastRefreshError,
    lastSendError,
    sendSignal,
    refreshSignals,
  };
}
