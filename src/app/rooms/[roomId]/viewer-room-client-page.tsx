"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type RoomRow = {
  id: string;
  title: string | null;
  status: string;
  owner_id: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  role: string | null;
  is_banned: boolean | null;
};

type ViewerState = {
  room: RoomRow | null;
  ownerProfile: ProfileRow | null;
  isLoggedIn: boolean;
  isLoading: boolean;
};

function getStreamerName(room: RoomRow | null, profile: ProfileRow | null) {
  const profileName = profile?.display_name?.trim();
  const roomTitle = room?.title?.trim();
  return profileName || roomTitle || "Yayinci";
}

function RoomInfoState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="min-h-screen bg-cyan-100 px-4 py-6 text-slate-800 sm:px-6">
      <section className="mx-auto max-w-3xl rounded-3xl border border-pink-100 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-pink-400">Poncik Live</p>
        <h1 className="mt-4 text-3xl font-black text-indigo-800">{title}</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
        <Link
          href="/rooms"
          className="mt-7 inline-flex rounded-full bg-pink-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-pink-400"
        >
          Online yayincilara dön
        </Link>
      </section>
    </main>
  );
}

export default function ViewerRoomClientPage() {
  const params = useParams<{ roomId?: string }>();
  const roomId = useMemo(() => {
    const raw = params?.roomId;
    if (Array.isArray(raw)) {
      return raw[0] ?? "";
    }
    return raw ?? "";
  }, [params]);

  const [state, setState] = useState<ViewerState>({
    room: null,
    ownerProfile: null,
    isLoggedIn: false,
    isLoading: true,
  });
  const [hasFetchError, setHasFetchError] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "gift">("chat");

  useEffect(() => {
    if (!roomId) {
      setState((prev) => ({ ...prev, isLoading: false, room: null, ownerProfile: null }));
      return;
    }

    let cancelled = false;

    async function loadViewerRoom() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const { data: roomData, error: roomError } = await supabase
          .from("rooms")
          .select("id, title, status, owner_id")
          .eq("id", roomId)
          .maybeSingle();

        if (roomError || !roomData) {
          if (!cancelled) {
            setState({
              room: null,
              ownerProfile: null,
              isLoggedIn: Boolean(user),
              isLoading: false,
            });
          }
          return;
        }

        const { data: ownerProfileData } = await supabase
          .from("profiles")
          .select("id, display_name, role, is_banned")
          .eq("id", roomData.owner_id)
          .maybeSingle();

        if (!cancelled) {
          setState({
            room: roomData,
            ownerProfile: ownerProfileData ?? null,
            isLoggedIn: Boolean(user),
            isLoading: false,
          });
        }
      } catch {
        if (!cancelled) {
          setHasFetchError(true);
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      }
    }

    loadViewerRoom();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    async function refreshRoomState() {
      try {
        const { data: roomData, error: roomError } = await supabase
          .from("rooms")
          .select("id, title, status, owner_id")
          .eq("id", roomId)
          .maybeSingle();

        if (cancelled || roomError || !roomData) {
          return;
        }

        const { data: ownerProfileData } = await supabase
          .from("profiles")
          .select("id, display_name, role, is_banned")
          .eq("id", roomData.owner_id)
          .maybeSingle();

        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            room: roomData,
            ownerProfile: ownerProfileData ?? null,
          }));
        }
      } catch {
        // Do not replace current viewer state on transient realtime refresh errors.
      }
    }

    const channel = supabase
      .channel(`public:rooms:viewer:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        () => {
          void refreshRoomState();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [roomId]);

  if (state.isLoading) {
    return (
      <main className="min-h-screen bg-cyan-100 px-4 py-6 text-slate-800 sm:px-6">
        <section className="mx-auto max-w-3xl rounded-3xl border border-pink-100 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-indigo-700">Oda yukleniyor...</p>
        </section>
      </main>
    );
  }

  if (!state.room) {
    return (
      <RoomInfoState
        title="Oda bulunamadi"
        description={
          hasFetchError
            ? "Oda bilgisi su an alinamadi. Lutfen biraz sonra tekrar deneyin."
            : "Bu oda artik mevcut degil ya da gecersiz bir baglanti kullaniyorsun."
        }
      />
    );
  }

  if (state.room.status !== "live") {
    return (
      <RoomInfoState
        title="Bu yayin su an kapali"
        description="Yayinci yayini sonlandirdi. Yeni canli yayinlarda tekrar gorusebiliriz."
      />
    );
  }

  const streamerName = getStreamerName(state.room, state.ownerProfile);

  return (
    <main className="min-h-screen bg-[#eef7fb] text-zinc-900 lg:h-[100dvh] lg:overflow-hidden">
      <header className="h-16 border-b border-pink-100/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1800px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-lg font-black tracking-tight text-zinc-900 sm:text-xl">
              Poncik<span className="text-pink-400">Live</span>
            </Link>
            <span className="rounded-full bg-yellow-300 px-3 py-1 text-xs font-black text-black">Genel</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/rooms"
              className="rounded-full border border-pink-100 bg-white px-4 py-2 text-xs font-semibold transition hover:bg-pink-50"
            >
              Online yayincilar
            </Link>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-zinc-900 shadow-sm">0 coin</span>
          </div>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-64px)] max-w-[1800px] grid-cols-1 gap-3 p-3 lg:h-[calc(100dvh-64px)] lg:min-h-0 lg:grid-cols-[minmax(0,1.45fr)_minmax(420px,1fr)] lg:overflow-hidden lg:gap-3 lg:p-3">
        <div className="flex min-h-0 flex-col rounded-3xl border border-white/70 bg-white/60 p-3 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm lg:overflow-hidden">
          <div className="mb-2 flex h-10 shrink-0 items-center gap-2 rounded-2xl border border-pink-100 bg-white px-3">
            <span className="rounded-full bg-yellow-200 px-3 py-1 text-[11px] font-black text-zinc-800">Genel</span>
            <span className="rounded-full bg-rose-100 px-3 py-1 text-[11px] font-bold text-rose-700">CANLI</span>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-3xl border border-zinc-800/70 bg-zinc-950 p-3 sm:p-4">
            <div className="w-full max-w-[1100px]">
              <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-950 via-black to-pink-950/40 p-4">
                <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-rose-500/90 px-3 py-1 text-[11px] font-bold text-white">Canli yayin</span>
                </div>
                <div className="flex h-full items-center justify-center text-center">
                  <div className="absolute inset-0 rounded-3xl bg-[radial-gradient(circle_at_50%_30%,rgba(255,44,122,0.2),transparent_60%)]" />
                  <div className="relative w-full max-w-2xl">
                    <span className="inline-flex rounded-full bg-rose-500 px-5 py-1.5 text-sm font-black tracking-wide text-white shadow-lg">
                      CANLI
                    </span>
                    <h1 className="mt-4 text-2xl font-black text-white sm:text-3xl">{streamerName}</h1>
                    <p className="mt-3 text-sm text-zinc-300">
                      Yayin canli. Sohbet ve hediye ozellikleri bir sonraki fazda aktif edilecek.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid h-14 shrink-0 gap-2 sm:grid-cols-3">
            <button className="rounded-2xl bg-yellow-300 px-4 py-2 text-sm font-black text-zinc-800 transition hover:brightness-95">
              CANLI DESTEK
            </button>
            <button className="rounded-2xl bg-orange-300 px-4 py-2 text-sm font-black text-zinc-800 transition hover:brightness-95">
              HEDIYE LISTESI
            </button>
            <button className="rounded-2xl bg-pink-400 px-4 py-2 text-sm font-black text-white transition hover:bg-pink-300">
              MESAJLARIM
            </button>
          </div>
        </div>

        <aside className="flex min-h-[420px] flex-col rounded-3xl border border-pink-100 bg-gradient-to-b from-white to-rose-50/35 text-zinc-900 shadow-[0_8px_20px_rgba(219,39,119,0.08)] lg:min-h-0 lg:h-full lg:min-w-[420px] lg:overflow-hidden">
          <div className="flex shrink-0 border-b border-zinc-200">
            <button
              type="button"
              onClick={() => setActiveTab("chat")}
              className={`relative flex-1 py-3.5 text-sm font-black transition ${
                activeTab === "chat" ? "text-pink-500" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Sohbet
              {activeTab === "chat" ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-pink-500" /> : null}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("gift")}
              className={`relative flex-1 py-3.5 text-sm font-black transition ${
                activeTab === "gift" ? "text-pink-500" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Hediye
              {activeTab === "gift" ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-pink-500" /> : null}
            </button>
          </div>

          <div className="shrink-0 border-b border-zinc-200 px-6 py-3 text-center text-base font-black text-zinc-700">
            Odadakiler
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="flex h-full min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-pink-100 bg-pink-50/45 p-5 text-center text-sm text-zinc-500">
              Sohbet sistemi bir sonraki fazda aktif edilecek.
            </div>

            {!state.isLoggedIn ? (
              <div className="mt-4 rounded-2xl border border-pink-100 bg-white p-4 text-center">
                <p className="text-sm font-semibold text-zinc-700">Sohbete katilmak icin giris yapmalisin.</p>
                <Link
                  href="/login"
                  className="mt-3 inline-flex rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-400"
                >
                  Uye girisi
                </Link>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-zinc-200 p-4">
            <div className="flex items-center gap-2 rounded-full border border-pink-100 bg-zinc-100/90 px-3 py-2.5">
              <input
                disabled
                placeholder="Mesajinizi buraya yaziniz..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500"
              />
              <button
                type="button"
                disabled
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-base shadow-sm disabled:opacity-60"
              >
                🙂
              </button>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
