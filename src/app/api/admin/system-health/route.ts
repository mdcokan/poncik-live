import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getRtcIceServers, hasTurnServer } from "@/lib/rtc/ice-servers";

const ADMIN_ROLES = new Set(["admin", "owner"]);

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

function parseBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader;
}

function rtcNote(iceCount: number, turn: boolean, envSet: boolean): string {
  if (!envSet) {
    return "NEXT_PUBLIC_RTC_ICE_SERVERS tanımlı değil; varsayılan STUN kullanılıyor.";
  }
  if (!turn) {
    return "Env tanımlı; TURN/relay URL’si yok — zorlu ağlarda bağlantı sorunları yaşanabilir.";
  }
  return "Env tanımlı ve TURN/relay sunucusu algılandı.";
}

function buildRealtimeTables(): Array<{ name: string; expected: boolean; note: string }> {
  return [
    { name: "rooms", expected: true, note: "Yayın durumu ve liste." },
    { name: "room_messages", expected: true, note: "Oda sohbeti." },
    { name: "room_presence", expected: true, note: "İzleyici varlığı." },
    { name: "gift_transactions", expected: true, note: "Hediye akışı." },
    { name: "wallets", expected: true, note: "Bakiye." },
    { name: "private_room_requests", expected: true, note: "Özel oda talepleri." },
    { name: "private_room_sessions", expected: true, note: "Özel oda oturumları." },
    { name: "private_room_signals", expected: true, note: "WebRTC işaretleri." },
    { name: "dm_messages", expected: true, note: "DM mesajları." },
    { name: "dm_conversations", expected: true, note: "DM konuşmaları." },
    { name: "room_mutes", expected: true, note: "Sessize alma." },
    { name: "room_bans", expected: true, note: "Yasaklama." },
    { name: "room_kicks", expected: true, note: "Atma." },
  ];
}

function buildLimitations(): string[] {
  return [
    "Test route'lar production'da 404 guard ile korunur (bu bayrak runtime introspection ile doğrulanmaz).",
    "Bu ekran anlık veri akışı sunmaz; Yenile ile güncellenir.",
    "Son DM zamanı, oturumdaki yöneticinin RLS ile görebildiği mesajlara göredir (tüm sistem DM’leri değil).",
    "Service role anahtarı istemciye verilmez; sunucu tarafı kullanımlar deploy checklist ile doğrulanmalıdır.",
  ];
}

type RowOne = { updated_at?: string; created_at?: string };

function firstTimestamp(rows: RowOne[] | null, key: "updated_at" | "created_at"): string | null {
  const row = rows?.[0];
  if (!row) {
    return null;
  }
  const v = row[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, message: "Sunucu ayarları eksik." }, { status: 500 });
  }

  const authHeader = parseBearerToken(request);
  if (!authHeader) {
    return noStoreJson({ ok: false, message: "Giriş gerekli." }, { status: 401 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: { Authorization: authHeader },
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return noStoreJson({ ok: false, message: "Giriş gerekli." }, { status: 401 });
    }

    const { data: actorProfile, error: actorProfileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single<{ role: string }>();
    if (actorProfileError || !actorProfile || !ADMIN_ROLES.has(actorProfile.role)) {
      return noStoreJson({ ok: false, message: "Bu işlem için yetkin yok." }, { status: 403 });
    }

    const iceServers = getRtcIceServers();
    const rawRtc = process.env.NEXT_PUBLIC_RTC_ICE_SERVERS;
    const hasRtcEnv = typeof rawRtc === "string" && rawRtc.trim().length > 0;
    const turn = hasTurnServer(iceServers);

    const testFixtureSecret = process.env.TEST_FIXTURE_SECRET;
    const testFixtureSecretConfigured =
      typeof testFixtureSecret === "string" && testFixtureSecret.trim().length > 0;

    const [
      liveRoomLatest,
      privateSessionLatest,
      dmLatest,
      giftLatest,
      walletLatest,
      withdrawalLatest,
      liveRoomsCount,
      activePrivateSessions,
      pendingPrivateRequests,
      pendingWithdrawals,
    ] = await Promise.all([
      supabase.from("rooms").select("updated_at").eq("status", "live").order("updated_at", { ascending: false }).limit(1),
      supabase
        .from("private_room_sessions")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1),
      supabase.from("dm_messages").select("created_at").order("created_at", { ascending: false }).limit(1),
      supabase.from("gift_transactions").select("created_at").order("created_at", { ascending: false }).limit(1),
      supabase.from("wallet_adjustments").select("created_at").order("created_at", { ascending: false }).limit(1),
      supabase
        .from("streamer_withdrawal_requests")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1),
      supabase.from("rooms").select("*", { count: "exact", head: true }).eq("status", "live"),
      supabase.from("private_room_sessions").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("private_room_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("streamer_withdrawal_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    ]);

    const limitations = buildLimitations();
    if (liveRoomLatest.error) {
      limitations.push(`Canlı oda son aktivite sorgusu başarısız: ${liveRoomLatest.error.message}`);
    }
    if (privateSessionLatest.error) {
      limitations.push(`Özel oda oturumu son aktivite sorgusu başarısız: ${privateSessionLatest.error.message}`);
    }
    if (dmLatest.error) {
      limitations.push(`DM son aktivite sorgusu başarısız: ${dmLatest.error.message}`);
    }
    if (giftLatest.error) {
      limitations.push(`Hediye son aktivite sorgusu başarısız: ${giftLatest.error.message}`);
    }
    if (walletLatest.error) {
      limitations.push(`Cüzdan hareketi son aktivite sorgusu başarısız: ${walletLatest.error.message}`);
    }
    if (withdrawalLatest.error) {
      limitations.push(`Çekim talebi son aktivite sorgusu başarısız: ${withdrawalLatest.error.message}`);
    }
    if (liveRoomsCount.error) {
      limitations.push(`Canlı oda sayımı başarısız: ${liveRoomsCount.error.message}`);
    }
    if (activePrivateSessions.error) {
      limitations.push(`Aktif özel oda sayımı başarısız: ${activePrivateSessions.error.message}`);
    }
    if (pendingPrivateRequests.error) {
      limitations.push(`Bekleyen özel oda talebi sayımı başarısız: ${pendingPrivateRequests.error.message}`);
    }
    if (pendingWithdrawals.error) {
      limitations.push(`Bekleyen çekim sayımı başarısız: ${pendingWithdrawals.error.message}`);
    }

    return noStoreJson({
      rtc: {
        iceServersCount: iceServers.length,
        hasTurnServer: turn,
        hasRtcEnv,
        note: rtcNote(iceServers.length, turn, hasRtcEnv),
      },
      environment: {
        nodeEnv: process.env.NODE_ENV ?? "unknown",
        testRoutesProductionGuarded: true,
        testFixtureSecretConfigured,
      },
      recentActivity: {
        latestLiveRoomAt: firstTimestamp(liveRoomLatest.data as RowOne[] | null, "updated_at"),
        latestPrivateSessionAt: firstTimestamp(privateSessionLatest.data as RowOne[] | null, "updated_at"),
        latestDmMessageAt: firstTimestamp(dmLatest.data as RowOne[] | null, "created_at"),
        latestGiftAt: firstTimestamp(giftLatest.data as RowOne[] | null, "created_at"),
        latestWalletAdjustmentAt: firstTimestamp(walletLatest.data as RowOne[] | null, "created_at"),
        latestWithdrawalAt: firstTimestamp(withdrawalLatest.data as RowOne[] | null, "created_at"),
      },
      counts: {
        liveRooms: liveRoomsCount.count ?? 0,
        activePrivateSessions: activePrivateSessions.count ?? 0,
        pendingPrivateRequests: pendingPrivateRequests.count ?? 0,
        pendingWithdrawals: pendingWithdrawals.count ?? 0,
      },
      realtimeTables: buildRealtimeTables(),
      limitations,
    });
  } catch {
    return noStoreJson({ ok: false, message: "Sistem sağlığı yüklenemedi." }, { status: 500 });
  }
}
