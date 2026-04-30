"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";
import { getSupabaseClient } from "@/app/admin/_lib/supabase";

type AdminLiveRoom = {
  id: string;
  title: string | null;
  status: string;
  ownerId: string;
  streamer: {
    displayName: string;
  };
  updatedAt: string | null;
  createdAt: string | null;
  viewerCount: number;
  lastMessages: Array<{
    senderName: string;
    body: string;
    createdAt: string;
  }>;
  lastGifts: Array<{
    senderName: string;
    giftName: string;
    giftEmoji: string;
    amount: number;
    createdAt: string;
  }>;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
  rooms?: AdminLiveRoom[];
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return "-";
  }
  return new Date(timestamp).toLocaleString("tr-TR");
}

function getAccessToken() {
  const supabase = getSupabaseClient();
  return supabase.auth.getSession().then(({ data: { session } }) => session?.access_token ?? null);
}

export default function AdminLivePage() {
  const { loading, authorized, message, signOut } = useAdminAccess();
  const [rooms, setRooms] = useState<AdminLiveRoom[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [closingRoomId, setClosingRoomId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const summary = useMemo(() => {
    const totalViewers = rooms.reduce((total, room) => total + room.viewerCount, 0);
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    let giftsLastTenMinutes = 0;
    let messagesLastTenMinutes = 0;

    for (const room of rooms) {
      for (const gift of room.lastGifts) {
        const timestamp = new Date(gift.createdAt).getTime();
        if (Number.isFinite(timestamp) && timestamp >= tenMinutesAgo) {
          giftsLastTenMinutes += 1;
        }
      }

      for (const messageItem of room.lastMessages) {
        const timestamp = new Date(messageItem.createdAt).getTime();
        if (Number.isFinite(timestamp) && timestamp >= tenMinutesAgo) {
          messagesLastTenMinutes += 1;
        }
      }
    }

    return {
      liveRoomCount: rooms.length,
      totalViewers,
      giftsLastTenMinutes,
      messagesLastTenMinutes,
    };
  }, [rooms]);

  async function loadRooms(showRefreshState: boolean) {
    if (showRefreshState) {
      setIsRefreshing(true);
    } else {
      setIsLoadingRooms(true);
    }
    setFeedback(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setFeedback({ type: "error", message: "Oturum bulunamadı. Tekrar giriş yap." });
        setRooms([]);
        return;
      }

      const response = await fetch("/api/admin/live", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as ApiResponse;
      if (!response.ok || !payload.ok) {
        setFeedback({ type: "error", message: payload.message || "Canlı yayın verisi yüklenemedi." });
        setRooms([]);
        return;
      }

      setRooms(payload.rooms ?? []);
    } catch {
      setFeedback({ type: "error", message: "Canlı yayın verisi yüklenemedi." });
      setRooms([]);
    } finally {
      setIsLoadingRooms(false);
      setIsRefreshing(false);
    }
  }

  async function handleCloseRoom(roomId: string) {
    if (!window.confirm("Bu canlı yayını kapatmak istediğine emin misin?")) {
      return;
    }

    try {
      setClosingRoomId(roomId);
      setFeedback(null);
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setFeedback({ type: "error", message: "Oturum bulunamadı. Tekrar giriş yap." });
        return;
      }

      const response = await fetch("/api/admin/live/close", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ roomId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) {
        setFeedback({ type: "error", message: payload.message || "Canlı yayın kapatılamadı." });
        return;
      }

      setRooms((previous) => previous.filter((room) => room.id !== roomId));
      setFeedback({ type: "success", message: "Canlı yayın kapatıldı." });
    } catch {
      setFeedback({ type: "error", message: "Canlı yayın kapatılamadı." });
    } finally {
      setClosingRoomId(null);
    }
  }

  useEffect(() => {
    if (!authorized) {
      return;
    }
    void loadRooms(false);
  }, [authorized]);

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout
      title="Canlı Yayınlar"
      description="Anlık canlı odaları, izleyici hareketlerini ve son etkileşimleri buradan takip edebilirsin."
      onLogout={signOut}
    >
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Canlı oda sayısı</p>
          <p className="mt-2 text-2xl font-bold text-indigo-800">{summary.liveRoomCount}</p>
        </article>
        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Toplam odadaki kişi</p>
          <p className="mt-2 text-2xl font-bold text-indigo-800">{summary.totalViewers}</p>
        </article>
        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Son 10 dakikada hediye sayısı</p>
          <p className="mt-2 text-2xl font-bold text-indigo-800">{summary.giftsLastTenMinutes}</p>
        </article>
        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Son 10 dakikada mesaj sayısı</p>
          <p className="mt-2 text-2xl font-bold text-indigo-800">{summary.messagesLastTenMinutes}</p>
        </article>
      </section>

      {feedback ? (
        <p
          className={`rounded-2xl border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      <section className="flex items-center justify-between rounded-3xl bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-indigo-800">Canlı oda listesi</h2>
          <p className="text-sm text-slate-500">{isLoadingRooms ? "Yükleniyor..." : `${rooms.length} oda listeleniyor`}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void loadRooms(true);
          }}
          disabled={isLoadingRooms || isRefreshing}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {isRefreshing ? "Yenileniyor..." : "Yenile"}
        </button>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {!isLoadingRooms && rooms.length === 0 ? (
          <article className="rounded-3xl bg-white p-5 shadow-sm xl:col-span-2">
            <p className="text-sm text-slate-500">Canlı oda yok.</p>
          </article>
        ) : null}

        {rooms.map((room) => (
          <article key={room.id} className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{room.title?.trim() || "Başlıksız oda"}</p>
                <h3 className="mt-2 text-lg font-semibold text-indigo-800">{room.streamer.displayName}</h3>
              </div>
              <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">Canlı</span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <p>Odadakiler: {room.viewerCount} kişi</p>
              <p>Güncellenme zamanı: {formatDateTime(room.updatedAt)}</p>
            </div>

            <section className="mt-4 rounded-2xl border border-cyan-100 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Son mesajlar</p>
              {room.lastMessages.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Henüz mesaj yok.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {room.lastMessages.map((messageItem, index) => (
                    <article key={`${room.id}-message-${index}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                      <p className="font-semibold text-slate-800">{messageItem.senderName}</p>
                      <p className="text-slate-600">{messageItem.body}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-3 rounded-2xl border border-cyan-100 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Son hediyeler</p>
              {room.lastGifts.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Henüz hediye yok.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {room.lastGifts.map((giftItem, index) => (
                    <article key={`${room.id}-gift-${index}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      {giftItem.senderName} {giftItem.giftEmoji} {giftItem.giftName} · {giftItem.amount} dk
                    </article>
                  ))}
                </div>
              )}
            </section>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href={`/rooms/${room.id}`}
                className="rounded-xl bg-indigo-100 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-200"
              >
                Odayı Aç
              </Link>
              <button
                type="button"
                onClick={() => {
                  void handleCloseRoom(room.id);
                }}
                disabled={closingRoomId === room.id}
                className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:opacity-60"
              >
                {closingRoomId === room.id ? "Kapatılıyor..." : "Yayını Kapat"}
              </button>
            </div>
          </article>
        ))}
      </section>
    </AdminLayout>
  );
}
