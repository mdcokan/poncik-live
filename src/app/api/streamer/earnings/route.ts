import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ApiError = {
  status: number;
  message: string;
};

type EarningRow = {
  id: string;
  source_id: string;
  gross_minutes: number;
  platform_fee_minutes: number;
  net_minutes: number;
  created_at: string;
};

type WithdrawalRow = {
  id: string;
  requested_minutes: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  payment_note: string | null;
  admin_note: string | null;
  created_at: string;
  decided_at: string | null;
};

const ALLOWED_ROLES = new Set(["streamer", "admin", "owner"]);

const ERROR_BY_CODE: Record<string, ApiError> = {
  AUTH_REQUIRED: { status: 401, message: "Giriş yapmalısın." },
  FORBIDDEN: { status: 403, message: "Bu işlem için yetkin yok." },
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

function parseBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader;
}

function sumFromRows(rows: unknown, field: string) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return 0;
  }
  return rows.reduce((accumulator, row) => {
    const value =
      row && typeof row === "object" && field in row
        ? (row as Record<string, unknown>)[field]
        : 0;
    const parsed = typeof value === "number" ? value : Number.parseFloat(`${value ?? 0}`);
    return accumulator + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Kazanç özeti yüklenemedi." }, { status: 500 });
  }

  const authHeader = parseBearerToken(request);
  if (!authHeader) {
    return noStoreJson({ ok: false, code: "AUTH_REQUIRED", message: ERROR_BY_CODE.AUTH_REQUIRED.message }, { status: 401 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: authHeader,
        },
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            cache: "no-store",
          }),
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return noStoreJson({ ok: false, code: "AUTH_REQUIRED", message: ERROR_BY_CODE.AUTH_REQUIRED.message }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single<{ role: string }>();
    if (profileError || !profile || !ALLOWED_ROLES.has(profile.role)) {
      return noStoreJson({ ok: false, code: "FORBIDDEN", message: ERROR_BY_CODE.FORBIDDEN.message }, { status: 403 });
    }

    const todayStartIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

    const [
      { data: totalPrivateRoomRows },
      { data: todayPrivateRoomRows },
      { data: pendingWithdrawalRows },
      { data: approvedWithdrawalRows },
      { data: totalGiftRows },
      { data: todayGiftRows },
      { data: recentPrivateRoomRows },
      { data: recentWithdrawalRows },
      { data: recentGiftRows },
    ] = await Promise.all([
      supabase
        .from("streamer_earnings")
        .select("net_minutes")
        .eq("streamer_id", user.id)
        .eq("source_type", "private_room"),
      supabase
        .from("streamer_earnings")
        .select("net_minutes")
        .eq("streamer_id", user.id)
        .eq("source_type", "private_room")
        .gte("created_at", todayStartIso),
      supabase
        .from("streamer_withdrawal_requests")
        .select("requested_minutes")
        .eq("streamer_id", user.id)
        .eq("status", "pending"),
      supabase
        .from("streamer_withdrawal_requests")
        .select("requested_minutes")
        .eq("streamer_id", user.id)
        .eq("status", "approved"),
      supabase.from("gift_transactions").select("amount").eq("receiver_id", user.id),
      supabase.from("gift_transactions").select("amount").eq("receiver_id", user.id).gte("created_at", todayStartIso),
      supabase
        .from("streamer_earnings")
        .select("id, source_id, gross_minutes, platform_fee_minutes, net_minutes, created_at")
        .eq("streamer_id", user.id)
        .eq("source_type", "private_room")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("streamer_withdrawal_requests")
        .select("id, requested_minutes, status, payment_note, admin_note, created_at, decided_at")
        .eq("streamer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("gift_transactions")
        .select("id, amount, created_at")
        .eq("receiver_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const totalPrivateRoomNetMinutes = sumFromRows(totalPrivateRoomRows, "net_minutes");
    const todayPrivateRoomNetMinutes = sumFromRows(todayPrivateRoomRows, "net_minutes");
    const pendingWithdrawalMinutes = sumFromRows(pendingWithdrawalRows, "requested_minutes");
    const approvedWithdrawalMinutes = sumFromRows(approvedWithdrawalRows, "requested_minutes");
    const todayGiftMinutes = sumFromRows(todayGiftRows, "amount");
    const totalGiftMinutes = sumFromRows(totalGiftRows, "amount");
    const availableWithdrawalMinutes = Math.max(0, totalPrivateRoomNetMinutes - pendingWithdrawalMinutes - approvedWithdrawalMinutes);

    return noStoreJson({
      ok: true,
      todayPrivateRoomNetMinutes,
      totalPrivateRoomNetMinutes,
      pendingWithdrawalMinutes,
      approvedWithdrawalMinutes,
      availableWithdrawalMinutes,
      todayGiftMinutes,
      totalGiftMinutes,
      recentPrivateRoomEarnings: ((recentPrivateRoomRows as EarningRow[] | null) ?? []).map((row) => ({
        id: row.id,
        sourceId: row.source_id,
        grossMinutes: row.gross_minutes,
        platformFeeMinutes: row.platform_fee_minutes,
        netMinutes: row.net_minutes,
        createdAt: row.created_at,
      })),
      recentWithdrawals: ((recentWithdrawalRows as WithdrawalRow[] | null) ?? []).map((row) => ({
        id: row.id,
        requestedMinutes: row.requested_minutes,
        status: row.status,
        paymentNote: row.payment_note,
        adminNote: row.admin_note,
        createdAt: row.created_at,
        decidedAt: row.decided_at,
      })),
      recentGifts: (
        (recentGiftRows as { id: string; amount: number; created_at: string }[] | null) ?? []
      ).map((row) => ({
        id: row.id,
        amount: row.amount,
        createdAt: row.created_at,
      })),
    });
  } catch {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Kazanç özeti yüklenemedi." }, { status: 500 });
  }
}
