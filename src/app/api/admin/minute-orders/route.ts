import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const ADMIN_ROLES = new Set(["admin", "owner"]);

type MinuteOrderRow = {
  id: string;
  user_id: string;
  package_id: string;
  package_name: string;
  package_type: "minute" | "duration";
  amount: number;
  price_try: number;
  status: "pending";
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
};

type ProfileRow = {
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

function mapOrderRow(row: MinuteOrderRow, profileNameById: Map<string, string>) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: profileNameById.get(row.user_id) ?? "Uye",
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

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, message: "Talepler yuklenemedi." }, { status: 500 });
  }

  const authHeader = parseBearerToken(request);
  if (!authHeader) {
    return noStoreJson({ ok: false, message: "Giris gerekli." }, { status: 401 });
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
    return noStoreJson({ ok: false, message: "Giris gerekli." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();

  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) {
    return noStoreJson({ ok: false, message: "Bu islem icin yetkin yok." }, { status: 403 });
  }

  const { data: orderRows, error: ordersError } = await supabase
    .from("minute_purchase_orders")
    .select("id, user_id, package_id, package_name, package_type, amount, price_try, status, admin_note, created_at, updated_at, decided_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  if (ordersError) {
    return noStoreJson({ ok: false, message: "Talepler yuklenemedi." }, { status: 500 });
  }

  const rows = (orderRows ?? []) as MinuteOrderRow[];
  const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
  const { data: profileRows } = userIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", userIds)
    : { data: [] };

  const profileNameById = new Map<string, string>(
    ((profileRows as ProfileRow[] | null) ?? []).map((profileRow) => [profileRow.id, profileRow.display_name?.trim() || "Uye"]),
  );

  return noStoreJson({
    ok: true,
    orders: rows.map((row) => mapOrderRow(row, profileNameById)),
  });
}
