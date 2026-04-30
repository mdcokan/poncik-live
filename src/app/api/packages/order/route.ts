import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type PackageType = "minute" | "duration";
type OrderStatus = "pending" | "approved" | "rejected";

type PurchasePackageRow = {
  id: string;
  type: PackageType;
  name: string;
  amount: number;
  price_try: number;
  is_active: boolean;
};

type MinutePurchaseOrderRow = {
  id: string;
  user_id: string;
  package_id: string;
  package_name: string;
  package_type: PackageType;
  amount: number;
  price_try: number;
  status: OrderStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
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

function mapOrderRow(row: MinutePurchaseOrderRow) {
  return {
    id: row.id,
    userId: row.user_id,
    packageId: row.package_id,
    packageName: row.package_name,
    packageType: row.package_type,
    amount: row.amount,
    priceTry: row.price_try,
    status: row.status,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at,
  };
}

function getClientFromRequest(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: noStoreJson({ ok: false, message: "Satın alma talebi oluşturulamadı." }, { status: 500 }) };
  }

  const authHeader = parseBearerToken(request);
  if (!authHeader) {
    return { error: noStoreJson({ ok: false, message: "Giriş yapmalısın." }, { status: 401 }) };
  }

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

  return { supabase };
}

export async function GET(request: Request) {
  const clientResult = getClientFromRequest(request);
  if ("error" in clientResult) {
    return clientResult.error;
  }

  const {
    data: { user },
    error: userError,
  } = await clientResult.supabase.auth.getUser();

  if (userError || !user) {
    return noStoreJson({ ok: false, message: "Giriş yapmalısın." }, { status: 401 });
  }

  const { data: profile } = await clientResult.supabase
    .from("profiles")
    .select("is_banned")
    .eq("id", user.id)
    .maybeSingle<{ is_banned: boolean }>();
  if (profile?.is_banned) {
    return noStoreJson({ ok: false, message: "Hesabınız kısıtlanmıştır." }, { status: 403 });
  }

  const { data, error } = await clientResult.supabase
    .from("minute_purchase_orders")
    .select("id, user_id, package_id, package_name, package_type, amount, price_try, status, admin_note, created_at, updated_at, decided_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return noStoreJson({ ok: false, message: "Satın alma talepleri getirilemedi." }, { status: 500 });
  }

  return noStoreJson({
    ok: true,
    orders: ((data ?? []) as MinutePurchaseOrderRow[]).map(mapOrderRow),
  });
}

export async function POST(request: Request) {
  const clientResult = getClientFromRequest(request);
  if ("error" in clientResult) {
    return clientResult.error;
  }

  const {
    data: { user },
    error: userError,
  } = await clientResult.supabase.auth.getUser();

  if (userError || !user) {
    return noStoreJson({ ok: false, message: "Giriş yapmalısın." }, { status: 401 });
  }

  const { data: profile } = await clientResult.supabase
    .from("profiles")
    .select("is_banned")
    .eq("id", user.id)
    .maybeSingle<{ is_banned: boolean }>();
  if (profile?.is_banned) {
    return noStoreJson({ ok: false, message: "Hesabınız kısıtlanmıştır." }, { status: 403 });
  }

  let payload: { packageId?: unknown } = {};
  try {
    payload = (await request.json()) as { packageId?: unknown };
  } catch {
    return noStoreJson({ ok: false, message: "Paket bulunamadı." }, { status: 404 });
  }

  const packageId = typeof payload.packageId === "string" ? payload.packageId : "";
  if (!packageId) {
    return noStoreJson({ ok: false, message: "Paket bulunamadı." }, { status: 404 });
  }

  const { data: packageRow, error: packageError } = await clientResult.supabase
    .from("purchase_packages")
    .select("id, type, name, amount, price_try, is_active")
    .eq("id", packageId)
    .eq("is_active", true)
    .maybeSingle<PurchasePackageRow>();

  if (packageError || !packageRow) {
    return noStoreJson({ ok: false, message: "Paket bulunamadı." }, { status: 404 });
  }

  const { data: existingOrder } = await clientResult.supabase
    .from("minute_purchase_orders")
    .select("id")
    .eq("user_id", user.id)
    .eq("package_id", packageId)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existingOrder) {
    return noStoreJson({ ok: false, message: "Bu paket için bekleyen talebin zaten var." }, { status: 409 });
  }

  const { data: insertedOrder, error: insertError } = await clientResult.supabase
    .from("minute_purchase_orders")
    .insert({
      user_id: user.id,
      package_id: packageRow.id,
      package_name: packageRow.name,
      package_type: packageRow.type,
      amount: packageRow.amount,
      price_try: packageRow.price_try,
      status: "pending",
    })
    .select("id, user_id, package_id, package_name, package_type, amount, price_try, status, admin_note, created_at, updated_at, decided_at")
    .single<MinutePurchaseOrderRow>();

  if (insertError || !insertedOrder) {
    return noStoreJson({ ok: false, message: "Satın alma talebi oluşturulamadı." }, { status: 500 });
  }

  return noStoreJson({
    ok: true,
    order: mapOrderRow(insertedOrder),
  });
}
