import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type PackageType = "minute" | "duration";

type PurchasePackageRow = {
  id: string;
  type: PackageType;
  name: string;
  amount: number;
  price_try: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const ADMIN_ROLES = new Set(["admin", "owner"]);

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...noStoreHeaders,
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

function validatePackageInput(payload: unknown) {
  const data = typeof payload === "object" && payload ? (payload as Record<string, unknown>) : {};
  const type = data.type === "minute" || data.type === "duration" ? data.type : null;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const amount = typeof data.amount === "number" && Number.isFinite(data.amount) ? Math.trunc(data.amount) : 0;
  const priceTry = typeof data.price_try === "number" && Number.isFinite(data.price_try) ? Math.trunc(data.price_try) : -1;
  const sortOrder = typeof data.sort_order === "number" && Number.isFinite(data.sort_order) ? Math.trunc(data.sort_order) : 0;
  const isActive = typeof data.is_active === "boolean" ? data.is_active : true;

  if (!type || !name || amount <= 0 || priceTry < 0) {
    return { ok: false as const };
  }

  return {
    ok: true as const,
    value: {
      type,
      name,
      amount,
      price_try: priceTry,
      sort_order: sortOrder,
      is_active: isActive,
    },
  };
}

async function getAdminClient(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: noStoreJson({ ok: false, message: "Sunucu ayarlari eksik." }, { status: 500 }) };
  }

  const authHeader = parseBearerToken(request);
  if (!authHeader) {
    return { error: noStoreJson({ ok: false, message: "Giris gerekli." }, { status: 401 }) };
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

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: noStoreJson({ ok: false, message: "Giris gerekli." }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();

  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) {
    return { error: noStoreJson({ ok: false, message: "Bu islem icin yetkin yok." }, { status: 403 }) };
  }

  return { supabase };
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const clientResult = await getAdminClient(request);
  if ("error" in clientResult) {
    return clientResult.error;
  }

  const { data, error } = await clientResult.supabase
    .from("purchase_packages")
    .select("id, type, name, amount, price_try, is_active, sort_order, created_at, updated_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return noStoreJson({ ok: false, message: "Paketler yuklenemedi." }, { status: 500 });
  }

  return noStoreJson({ ok: true, packages: (data ?? []) as PurchasePackageRow[] });
}

export async function POST(request: Request) {
  const clientResult = await getAdminClient(request);
  if ("error" in clientResult) {
    return clientResult.error;
  }

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    return noStoreJson({ ok: false, message: "Gecersiz istek." }, { status: 400 });
  }

  const parsed = validatePackageInput(payload);
  if (!parsed.ok) {
    return noStoreJson({ ok: false, message: "Paket bilgileri gecersiz." }, { status: 400 });
  }

  const { data, error } = await clientResult.supabase
    .from("purchase_packages")
    .insert(parsed.value)
    .select("id, type, name, amount, price_try, is_active, sort_order, created_at, updated_at")
    .single<PurchasePackageRow>();

  if (error || !data) {
    return noStoreJson({ ok: false, message: "Paket olusturulamadi." }, { status: 500 });
  }

  return noStoreJson({ ok: true, package: data });
}
