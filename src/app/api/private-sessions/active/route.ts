import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type SessionRow = {
  id: string;
  request_id: string;
  room_id: string;
  streamer_id: string;
  viewer_id: string;
  status: string;
  started_at: string;
  viewer_ready: boolean;
  streamer_ready: boolean;
  viewer_ready_at: string | null;
  streamer_ready_at: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type WalletRow = {
  balance: number | null;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}

function parseBearer(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return header;
}

export async function GET(request: Request) {
  const authHeader = parseBearer(request);
  if (!authHeader) {
    return noStoreJson({ ok: false, code: "AUTH_REQUIRED", message: "Giriş yapmalısın." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Aktif özel oda alınamadı." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: authHeader },
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return noStoreJson({ ok: false, code: "AUTH_REQUIRED", message: "Giriş yapmalısın." }, { status: 401 });
  }

  const { data: me } = await supabase.from("profiles").select("id, role").eq("id", user.id).maybeSingle<{ id: string; role: string }>();
  const role = me?.role ?? "viewer";
  const isAdmin = role === "admin" || role === "owner";

  const { searchParams } = new URL(request.url);
  const queryUserId = searchParams.get("userId")?.trim() || null;
  const targetUserId = isAdmin && queryUserId ? queryUserId : user.id;
  const filterColumn = role === "streamer" && !isAdmin ? "streamer_id" : "viewer_id";

  let query = supabase
    .from("private_room_sessions")
    .select(
      "id, request_id, room_id, streamer_id, viewer_id, status, started_at, viewer_ready, streamer_ready, viewer_ready_at, streamer_ready_at",
    )
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1);

  if (isAdmin && queryUserId) {
    query = query.or(`viewer_id.eq.${targetUserId},streamer_id.eq.${targetUserId}`);
  } else {
    query = query.eq(filterColumn, targetUserId);
  }

  const { data, error } = await query.maybeSingle<SessionRow>();
  if (error) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Aktif özel oda alınamadı." }, { status: 500 });
  }

  if (!data) {
    return noStoreJson({ ok: true, session: null });
  }

  const profileIds = [data.streamer_id, data.viewer_id];
  const [{ data: profiles }, { data: viewerWallet }] = await Promise.all([
    supabase.from("profiles").select("id, display_name").in("id", profileIds),
    supabase.from("wallets").select("balance").eq("user_id", data.viewer_id).maybeSingle<WalletRow>(),
  ]);
  const profileList = (profiles ?? []) as ProfileRow[];
  const streamerName =
    profileList.find((row) => row.id === data.streamer_id)?.display_name?.trim() || "Yayıncı";
  const viewerName = profileList.find((row) => row.id === data.viewer_id)?.display_name?.trim() || "Üye";
  const viewerBalanceMinutes = Math.max(0, Math.floor(viewerWallet?.balance ?? 0));
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(data.started_at).getTime()) / 1000));
  const estimatedChargedMinutes = Math.max(1, Math.ceil(elapsedSeconds / 60));
  const estimatedRemainingMinutes = Math.max(0, viewerBalanceMinutes - estimatedChargedMinutes);
  const isLowBalance = estimatedRemainingMinutes <= 2;

  return noStoreJson({
    ok: true,
    session: {
      sessionId: data.id,
      roomId: data.room_id,
      requestId: data.request_id,
      streamerId: data.streamer_id,
      streamerName,
      viewerId: data.viewer_id,
      viewerName,
      status: data.status,
      startedAt: data.started_at,
      viewerBalanceMinutes,
      elapsedSeconds,
      estimatedChargedMinutes,
      estimatedRemainingMinutes,
      isLowBalance,
      viewerReady: data.viewer_ready,
      streamerReady: data.streamer_ready,
      viewerReadyAt: data.viewer_ready_at,
      streamerReadyAt: data.streamer_ready_at,
    },
  });
}
