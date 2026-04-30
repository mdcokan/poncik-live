import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const ADMIN_ROLES = new Set(["admin", "owner"]);
const DETAIL_LIMIT = 20;

type ProfileRow = {
  id: string;
  display_name: string | null;
  role: "viewer" | "streamer" | "admin" | "owner";
  is_banned: boolean;
  updated_at: string;
};

type WalletRow = {
  user_id: string;
  balance: number;
  updated_at: string;
};

type MinuteOrderRow = {
  id: string;
  package_name: string;
  amount: number;
  price_try: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
};

type WalletAdjustmentRow = {
  id: string;
  amount: number;
  reason: string | null;
  admin_id: string;
  created_at: string;
};

type GiftTransactionRow = {
  id: string;
  room_id: string;
  gift_id: string;
  amount: number;
  created_at: string;
};

type GiftCatalogRow = {
  id: string;
  name: string;
  emoji: string;
};

type ActionLogRow = {
  id: string;
  action_type: string;
  description: string;
  admin_id: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ProfileNameRow = {
  id: string;
  display_name: string | null;
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

function displayNameOrFallback(name: string | null) {
  return name?.trim() || "Uye";
}

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, message: "Kullanıcı detayı yüklenemedi." }, { status: 500 });
  }

  const authHeader = parseBearerToken(request);
  if (!authHeader) {
    return noStoreJson({ ok: false, message: "Giriş gerekli." }, { status: 401 });
  }

  try {
    const { userId } = await context.params;
    if (!userId) {
      return noStoreJson({ ok: false, message: "Kullanıcı bulunamadı." }, { status: 404 });
    }

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

    const [{ data: profileRow, error: profileError }, { data: walletRow }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, role, is_banned, updated_at")
        .eq("id", userId)
        .maybeSingle<ProfileRow>(),
      supabase.from("wallets").select("user_id, balance, updated_at").eq("user_id", userId).maybeSingle<WalletRow>(),
    ]);

    if (profileError) {
      return noStoreJson({ ok: false, message: "Kullanıcı detayı yüklenemedi." }, { status: 500 });
    }
    if (!profileRow) {
      return noStoreJson({ ok: false, message: "Kullanıcı bulunamadı." }, { status: 404 });
    }

    const [
      { data: minuteOrdersRows, error: minuteOrdersError },
      { data: walletAdjustmentRows, error: walletAdjustmentsError },
      { data: sentGiftRows, error: sentGiftsError },
      { data: receivedGiftRows, error: receivedGiftsError },
      { data: actionLogRows, error: actionLogsError },
    ] = await Promise.all([
      supabase
        .from("minute_purchase_orders")
        .select("id, package_name, amount, price_try, status, created_at, decided_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(DETAIL_LIMIT),
      supabase
        .from("wallet_adjustments")
        .select("id, amount, reason, admin_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(DETAIL_LIMIT),
      supabase
        .from("gift_transactions")
        .select("id, room_id, gift_id, amount, created_at")
        .eq("sender_id", userId)
        .order("created_at", { ascending: false })
        .limit(DETAIL_LIMIT),
      supabase
        .from("gift_transactions")
        .select("id, room_id, gift_id, amount, created_at")
        .eq("receiver_id", userId)
        .order("created_at", { ascending: false })
        .limit(DETAIL_LIMIT),
      supabase
        .from("admin_action_logs")
        .select("id, action_type, description, admin_id, metadata, created_at")
        .eq("target_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(DETAIL_LIMIT),
    ]);

    if (minuteOrdersError || walletAdjustmentsError || sentGiftsError || receivedGiftsError || actionLogsError) {
      return noStoreJson({ ok: false, message: "Kullanıcı detayı yüklenemedi." }, { status: 500 });
    }

    const walletAdjustments = (walletAdjustmentRows as WalletAdjustmentRow[] | null) ?? [];
    const sentGifts = (sentGiftRows as GiftTransactionRow[] | null) ?? [];
    const receivedGifts = (receivedGiftRows as GiftTransactionRow[] | null) ?? [];
    const actionLogs = (actionLogRows as ActionLogRow[] | null) ?? [];

    const adminIds = Array.from(new Set([...walletAdjustments.map((row) => row.admin_id), ...actionLogs.map((row) => row.admin_id)]));
    const giftIds = Array.from(new Set([...sentGifts.map((row) => row.gift_id), ...receivedGifts.map((row) => row.gift_id)]));

    const [{ data: adminRows }, { data: giftRows }] = await Promise.all([
      adminIds.length
        ? supabase.from("profiles").select("id, display_name").in("id", adminIds)
        : Promise.resolve({ data: [] as ProfileNameRow[] }),
      giftIds.length
        ? supabase.from("gift_catalog").select("id, name, emoji").in("id", giftIds)
        : Promise.resolve({ data: [] as GiftCatalogRow[] }),
    ]);

    const adminNameById = new Map<string, string>(
      ((adminRows as ProfileNameRow[] | null) ?? []).map((row) => [row.id, displayNameOrFallback(row.display_name)]),
    );
    const giftById = new Map<string, { name: string; emoji: string }>(
      ((giftRows as GiftCatalogRow[] | null) ?? []).map((row) => [row.id, { name: row.name, emoji: row.emoji }]),
    );

    return noStoreJson({
      ok: true,
      profile: {
        id: profileRow.id,
        displayName: displayNameOrFallback(profileRow.display_name),
        role: profileRow.role,
        isBanned: profileRow.is_banned,
        updatedAt: profileRow.updated_at,
      },
      wallet: {
        balance: walletRow?.balance ?? 0,
        updatedAt: walletRow?.updated_at ?? null,
      },
      minuteOrders: ((minuteOrdersRows as MinuteOrderRow[] | null) ?? []).map((row) => ({
        id: row.id,
        packageName: row.package_name,
        amount: row.amount,
        priceTry: row.price_try,
        status: row.status,
        createdAt: row.created_at,
        decidedAt: row.decided_at,
      })),
      walletAdjustments: walletAdjustments.map((row) => ({
        id: row.id,
        amount: row.amount,
        reason: row.reason,
        adminName: adminNameById.get(row.admin_id) ?? "Admin",
        createdAt: row.created_at,
      })),
      sentGifts: sentGifts.map((row) => {
        const gift = giftById.get(row.gift_id);
        return {
          id: row.id,
          roomId: row.room_id,
          giftName: gift?.name ?? "Hediye",
          giftEmoji: gift?.emoji ?? "🎁",
          amount: row.amount,
          createdAt: row.created_at,
        };
      }),
      receivedGifts: receivedGifts.map((row) => {
        const gift = giftById.get(row.gift_id);
        return {
          id: row.id,
          roomId: row.room_id,
          giftName: gift?.name ?? "Hediye",
          giftEmoji: gift?.emoji ?? "🎁",
          amount: row.amount,
          createdAt: row.created_at,
        };
      }),
      actionLogs: actionLogs.map((row) => ({
        id: row.id,
        actionType: row.action_type,
        description: row.description,
        adminId: row.admin_id,
        adminName: adminNameById.get(row.admin_id) ?? "Admin",
        createdAt: row.created_at,
        metadata: row.metadata ?? {},
      })),
    });
  } catch {
    return noStoreJson({ ok: false, message: "Kullanıcı detayı yüklenemedi." }, { status: 500 });
  }
}
