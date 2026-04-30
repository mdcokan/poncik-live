"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveRoom } from "@/lib/live-rooms";
import {
  getSupabaseBrowserClient,
  LIVE_ROOMS_BROADCAST_CHANNEL,
  LIVE_ROOMS_CHANGED_EVENT,
} from "@/lib/supabase-browser";

type UseRealtimeLiveRoomsOptions = {
  initialRooms: LiveRoom[];
  initialHasError?: boolean;
  limit?: number;
  channelKey: string;
};

type LiveRoomsBroadcastPayload = {
  action?: "started" | "stopped";
  roomId?: string;
  status?: "live" | "offline";
  at?: number;
};

function ensureLiveRooms(rooms: LiveRoom[]) {
  return rooms.filter((room) => room.status === "live");
}

export function useRealtimeLiveRooms({
  initialRooms,
  initialHasError = false,
  limit = 24,
  channelKey,
}: UseRealtimeLiveRoomsOptions) {
  const [rooms, setRooms] = useState<LiveRoom[]>(ensureLiveRooms(initialRooms));
  const [warning, setWarning] = useState(initialHasError ? "Canli liste su an yenilenemedi." : "");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const latestRequestIdRef = useRef(0);
  const activeRequestControllerRef = useRef<AbortController | null>(null);

  const refreshRooms = useCallback(async () => {
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;

    activeRequestControllerRef.current?.abort();
    const controller = new AbortController();
    activeRequestControllerRef.current = controller;

    try {
      setIsRefreshing(true);
      const response = await fetch(`/api/live-rooms?limit=${limit}&t=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Canli odalar alinamadi.");
      }

      const json = (await response.json()) as { rooms?: LiveRoom[] };
      if (requestId !== latestRequestIdRef.current) {
        return;
      }

      setRooms(Array.isArray(json.rooms) ? ensureLiveRooms(json.rooms) : []);
      setWarning("");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      if (requestId !== latestRequestIdRef.current) {
        return;
      }

      setWarning("Canli liste su an yenilenemedi.");
    } finally {
      if (requestId === latestRequestIdRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [limit]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const postgresChannel = supabase
      .channel(`public:rooms:live-list:${channelKey}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
        },
        (payload) => {
          const newRow = (payload.new ?? null) as { id?: string; status?: string } | null;
          const oldRow = (payload.old ?? null) as { id?: string; status?: string } | null;

          if (payload.eventType === "DELETE") {
            if (oldRow?.id) {
              setRooms((prev) => prev.filter((room) => room.id !== oldRow.id));
            }
            return;
          }

          if (payload.eventType === "UPDATE") {
            if (newRow?.id && newRow.status !== "live") {
              setRooms((prev) => prev.filter((room) => room.id !== newRow.id));
              void refreshRooms();
              return;
            }

            if (newRow?.status === "live") {
              void refreshRooms();
            }
            return;
          }

          if (payload.eventType === "INSERT" && newRow?.status === "live") {
            void refreshRooms();
          }
        },
      )
      .subscribe();

    const broadcastChannel = supabase
      .channel(LIVE_ROOMS_BROADCAST_CHANNEL)
      .on("broadcast", { event: LIVE_ROOMS_CHANGED_EVENT }, ({ payload }) => {
        const liveRoomsPayload = (payload ?? null) as LiveRoomsBroadcastPayload | null;

        if (!liveRoomsPayload) {
          return;
        }

        if (liveRoomsPayload.action === "stopped" && liveRoomsPayload.roomId) {
          setRooms((prev) => prev.filter((room) => room.id !== liveRoomsPayload.roomId));
          void refreshRooms();
          return;
        }

        if (liveRoomsPayload.action === "started") {
          void refreshRooms();
          return;
        }

        void refreshRooms();
      })
      .subscribe();

    return () => {
      activeRequestControllerRef.current?.abort();
      void supabase.removeChannel(postgresChannel);
      void supabase.removeChannel(broadcastChannel);
    };
  }, [channelKey, refreshRooms]);

  return {
    rooms,
    warning,
    isRefreshing,
  };
}
