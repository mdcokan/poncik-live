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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function validatePatchInput(payload: unknown) {
  const data = typeof payload === "object" && payload ? (payload as Record<string, unknown>) : {};
  const nextData: Partial<Omit<PurchasePackageRow, "id" | "created_at" | "updated_at">> = {};

  if (data.type !== undefined) {
    if (data.type !== "minute" && data.type !== "duration") {
      return null;
    }
    nextData.type = data.type;
  }

  if (data.name !== undefined) {
    if (typeof data.name !== "string" || data.name.trim().length === 0) {
      return null;
    }
    nextData.name = data.name.trim();
  }

  if (data.amount !== undefined) {
    if (typeof data.amount !== "number" || !Number.isFinite(data.amount) || Math.trunc(data.amount) <= 0) {
      return null;
    }
    nextData.amount = Math.trunc(data.amount);
  }

  if (data.price_try !== undefined) {
    if (typeof data.price_try !== "number" || !Number.isFinite(data.price_try) || Math.trunc(data.price_try) < 0) {
      return null;
    }
    nextData.price_try = Math.trunc(data.price_try);
  }

  if (data.sort_order !== undefined) {
    if (typeof data.sort_order !== "number" || !Number.isFinite(data.sort_order)) {
      return null;
    }
    nextData.sort_order = Math.trunc(data.sort_order);
  }

  if (data.is_active !== undefined) {
    if (typeof data.is_active !== "boolean") {
      return null;
    }
    nextData.is_active = data.is_active;
  }

  if (Object.keys(nextData).length === 0) {
    return null;
  }

  return nextData;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return noStoreJson({ ok: false, message: "Gecersiz paket kimligi." }, { status: 400 });
  }

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

  const nextData = validatePatchInput(payload);
  if (!nextData) {
    return noStoreJson({ ok: false, message: "Paket bilgileri gecersiz." }, { status: 400 });
  }

  const { data, error } = await clientResult.supabase
    .from("purchase_packages")
    .update(nextData)
    .eq("id", id)
    .select("id, type, name, amount, price_try, is_active, sort_order, created_at, updated_at")
    .single<PurchasePackageRow>();

  if (error || !data) {
    return noStoreJson({ ok: false, message: "Paket guncellenemedi." }, { status: 500 });
  }

  return noStoreJson({ ok: true, package: data });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return noStoreJson({ ok: false, message: "Gecersiz paket kimligi." }, { status: 400 });
  }

  const clientResult = await getAdminClient(request);
  if ("error" in clientResult) {
    return clientResult.error;
  }

  const { data, error } = await clientResult.supabase
    .from("purchase_packages")
    .update({ is_active: false })
    .eq("id", id)
    .select("id, type, name, amount, price_try, is_active, sort_order, created_at, updated_at")
    .single<PurchasePackageRow>();

  if (error || !data) {
    return noStoreJson({ ok: false, message: "Paket pasife alinamadi." }, { status: 500 });
  }

  return noStoreJson({ ok: true, package: data });
}
