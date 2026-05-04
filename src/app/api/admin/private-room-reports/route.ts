import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const ADMIN_ROLES = new Set(["admin", "owner"]);
const DEFAULT_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const SUMMARY_MAX_ROWS = 1000;
const WITHDRAWAL_FETCH_LIMIT = 5000;

const RANGE_VALUES = new Set(["7d", "30d", "90d", "all"]);
const STATUS_VALUES = new Set(["all", "active", "ended", "cancelled"]);

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

function parseListLimit(raw: string | null) {
  const n = Number.parseInt(raw ?? `${DEFAULT_LIMIT}`, 10);
  if (!Number.isFinite(n)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(n, 1), MAX_LIST_LIMIT);
}

function uuidOrNull(raw: string | null) {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRe.test(trimmed) ? trimmed : false;
}

function rangeStartIso(range: string): string | null {
  if (range === "all") {
    return null;
  }
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

type SessionListRow = {
  id: string;
  status: string;
  room_id: string;
  streamer_id: string;
  viewer_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  charged_minutes: number;
  viewer_spent_minutes: number;
  streamer_earned_minutes: number;
  platform_fee_minutes: number;
  end_reason: string | null;
};

type SessionSummaryRow = {
  status: string;
  duration_seconds: number;
  charged_minutes: number;
  viewer_spent_minutes: number;
  streamer_earned_minutes: number;
  platform_fee_minutes: number;
  streamer_id: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type WithdrawalMinuteRow = {
  requested_minutes: number;
  status: string;
};

function displayNameOrFallback(name: string | null) {
  return name?.trim() || "Uye";
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, message: "Rapor yuklenemedi." }, { status: 500 });
  }

  const authHeader = parseBearerToken(request);
  if (!authHeader) {
    return noStoreJson({ ok: false, message: "Giris gerekli." }, { status: 401 });
  }

  const url = new URL(request.url);
  const rangeRaw = url.searchParams.get("range")?.trim() ?? "30d";
  const range = RANGE_VALUES.has(rangeRaw) ? rangeRaw : "30d";
  const statusRaw = url.searchParams.get("status")?.trim() ?? "all";
  const status = STATUS_VALUES.has(statusRaw) ? statusRaw : "all";
  const streamerParsed = uuidOrNull(url.searchParams.get("streamerId"));
  if (streamerParsed === false) {
    return noStoreJson({ ok: false, message: "Gecersiz streamerId." }, { status: 400 });
  }
  const viewerParsed = uuidOrNull(url.searchParams.get("viewerId"));
  if (viewerParsed === false) {
    return noStoreJson({ ok: false, message: "Gecersiz viewerId." }, { status: 400 });
  }
  const listLimit = parseListLimit(url.searchParams.get("limit"));
  const rangeStart = rangeStartIso(range);

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
      return noStoreJson({ ok: false, message: "Giris gerekli." }, { status: 401 });
    }

    const { data: actorProfile, error: actorProfileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single<{ role: string }>();
    if (actorProfileError || !actorProfile || !ADMIN_ROLES.has(actorProfile.role)) {
      return noStoreJson({ ok: false, message: "Bu islem icin yetkin yok." }, { status: 403 });
    }

    let summaryQuery = supabase
      .from("private_room_sessions")
      .select(
        "status, duration_seconds, charged_minutes, viewer_spent_minutes, streamer_earned_minutes, platform_fee_minutes, streamer_id",
      )
      .order("started_at", { ascending: false })
      .limit(SUMMARY_MAX_ROWS);

    if (rangeStart) {
      summaryQuery = summaryQuery.gte("started_at", rangeStart);
    }
    if (status !== "all") {
      summaryQuery = summaryQuery.eq("status", status);
    }
    if (streamerParsed) {
      summaryQuery = summaryQuery.eq("streamer_id", streamerParsed);
    }
    if (viewerParsed) {
      summaryQuery = summaryQuery.eq("viewer_id", viewerParsed);
    }

    let listQuery = supabase
      .from("private_room_sessions")
      .select(
        "id, status, room_id, streamer_id, viewer_id, started_at, ended_at, duration_seconds, charged_minutes, viewer_spent_minutes, streamer_earned_minutes, platform_fee_minutes, end_reason",
      )
      .order("started_at", { ascending: false })
      .limit(listLimit);

    if (rangeStart) {
      listQuery = listQuery.gte("started_at", rangeStart);
    }
    if (status !== "all") {
      listQuery = listQuery.eq("status", status);
    }
    if (streamerParsed) {
      listQuery = listQuery.eq("streamer_id", streamerParsed);
    }
    if (viewerParsed) {
      listQuery = listQuery.eq("viewer_id", viewerParsed);
    }

    const [{ data: summaryRows, error: summaryError }, { data: listRows, error: listError }, { data: withdrawalRows, error: withdrawalError }] =
      await Promise.all([
        summaryQuery,
        listQuery,
        supabase
          .from("streamer_withdrawal_requests")
          .select("requested_minutes, status")
          .in("status", ["pending", "approved"])
          .limit(WITHDRAWAL_FETCH_LIMIT),
      ]);

    if (summaryError || listError) {
      return noStoreJson({ ok: false, message: "Oturum verileri yuklenemedi." }, { status: 500 });
    }
    if (withdrawalError) {
      return noStoreJson({ ok: false, message: "Cekim verileri yuklenemedi." }, { status: 500 });
    }

    const summaryData = (summaryRows as SessionSummaryRow[] | null) ?? [];
    const sessionsData = (listRows as SessionListRow[] | null) ?? [];
    const withdrawalData = (withdrawalRows as WithdrawalMinuteRow[] | null) ?? [];

    let totalSessions = 0;
    let activeSessions = 0;
    let endedSessions = 0;
    let totalDurationSeconds = 0;
    let totalChargedMinutes = 0;
    let totalViewerSpentMinutes = 0;
    let totalStreamerEarnedMinutes = 0;
    let totalPlatformFeeMinutes = 0;

    const streamerAgg = new Map<
      string,
      { sessionCount: number; earnedMinutes: number; platformFeeMinutes: number }
    >();

    for (const row of summaryData) {
      totalSessions += 1;
      if (row.status === "active") {
        activeSessions += 1;
      } else if (row.status === "ended") {
        endedSessions += 1;
      }
      totalDurationSeconds += row.duration_seconds ?? 0;
      totalChargedMinutes += row.charged_minutes ?? 0;
      totalViewerSpentMinutes += row.viewer_spent_minutes ?? 0;
      totalStreamerEarnedMinutes += row.streamer_earned_minutes ?? 0;
      totalPlatformFeeMinutes += row.platform_fee_minutes ?? 0;

      const sid = row.streamer_id;
      const prev = streamerAgg.get(sid) ?? { sessionCount: 0, earnedMinutes: 0, platformFeeMinutes: 0 };
      prev.sessionCount += 1;
      prev.earnedMinutes += row.streamer_earned_minutes ?? 0;
      prev.platformFeeMinutes += row.platform_fee_minutes ?? 0;
      streamerAgg.set(sid, prev);
    }

    let pendingWithdrawalMinutes = 0;
    let approvedWithdrawalMinutes = 0;
    for (const w of withdrawalData) {
      if (w.status === "pending") {
        pendingWithdrawalMinutes += w.requested_minutes ?? 0;
      } else if (w.status === "approved") {
        approvedWithdrawalMinutes += w.requested_minutes ?? 0;
      }
    }

    const profileIds = new Set<string>();
    for (const s of sessionsData) {
      profileIds.add(s.streamer_id);
      profileIds.add(s.viewer_id);
    }
    for (const sid of streamerAgg.keys()) {
      profileIds.add(sid);
    }

    const { data: profileRows, error: profileError } =
      profileIds.size > 0
        ? await supabase.from("profiles").select("id, display_name").in("id", Array.from(profileIds))
        : { data: [] as ProfileRow[], error: null };

    if (profileError) {
      return noStoreJson({ ok: false, message: "Profil verileri yuklenemedi." }, { status: 500 });
    }

    const nameById = new Map<string, string>(
      ((profileRows as ProfileRow[] | null) ?? []).map((p) => [p.id, displayNameOrFallback(p.display_name)]),
    );

    const sessions = sessionsData.map((row) => ({
      id: row.id,
      status: row.status,
      roomId: row.room_id,
      streamerId: row.streamer_id,
      streamerName: nameById.get(row.streamer_id) ?? "Uye",
      viewerId: row.viewer_id,
      viewerName: nameById.get(row.viewer_id) ?? "Uye",
      startedAt: row.started_at,
      endedAt: row.ended_at,
      durationSeconds: row.duration_seconds,
      chargedMinutes: row.charged_minutes,
      viewerSpentMinutes: row.viewer_spent_minutes,
      streamerEarnedMinutes: row.streamer_earned_minutes,
      platformFeeMinutes: row.platform_fee_minutes,
      endReason: row.end_reason,
    }));

    const topStreamers = Array.from(streamerAgg.entries())
      .map(([streamerId, agg]) => ({
        streamerId,
        streamerName: nameById.get(streamerId) ?? "Uye",
        sessionCount: agg.sessionCount,
        earnedMinutes: agg.earnedMinutes,
        platformFeeMinutes: agg.platformFeeMinutes,
      }))
      .sort((a, b) => b.earnedMinutes - a.earnedMinutes);

    return noStoreJson({
      ok: true,
      summary: {
        totalSessions,
        activeSessions,
        endedSessions,
        totalDurationSeconds,
        totalChargedMinutes,
        totalViewerSpentMinutes,
        totalStreamerEarnedMinutes,
        totalPlatformFeeMinutes,
        pendingWithdrawalMinutes,
        approvedWithdrawalMinutes,
      },
      sessions,
      topStreamers,
    });
  } catch {
    return noStoreJson({ ok: false, message: "Rapor yuklenemedi." }, { status: 500 });
  }
}
