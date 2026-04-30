import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type PackageType = "minute" | "duration";
type OrderStatus = "pending" | "approved" | "rejected";

type MinutePurchaseOrderRow = {
  id: string;
  user_id: string;
  package_id: string;
  package_name: string;
  package_type: PackageType;
  amount: number;
  price_try: number;
  status: OrderStatus;
  admin_id: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

export type MinutePurchaseOrder = {
  id: string;
  userId: string;
  userName: string;
  packageId: string;
  packageName: string;
  packageType: PackageType;
  amount: number;
  priceTry: number;
  status: OrderStatus;
  adminName: string;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
};

function mapOrderRow(row: MinutePurchaseOrderRow, profileNameById: Map<string, string>) {
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
    adminName: row.admin_id ? (profileNameById.get(row.admin_id) ?? "Admin") : "",
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at,
  } satisfies MinutePurchaseOrder;
}

export async function fetchMyMinuteOrders(limit = 20): Promise<MinutePurchaseOrder[]> {
  try {
    const supabase = getSupabaseBrowserClient();
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 20);
    const { data: rows, error } = await supabase
      .from("minute_purchase_orders")
      .select("id, user_id, package_id, package_name, package_type, amount, price_try, status, admin_id, admin_note, created_at, updated_at, decided_at")
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (error || !rows) {
      return [];
    }

    const typedRows = rows as MinutePurchaseOrderRow[];
    const profileIds = Array.from(new Set(typedRows.flatMap((row) => [row.user_id, row.admin_id].filter(Boolean) as string[])));
    const { data: profileRows } = profileIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", profileIds)
      : { data: [] };
    const profileNameById = new Map<string, string>(
      ((profileRows as ProfileRow[] | null) ?? []).map((profileRow) => [profileRow.id, profileRow.display_name?.trim() || "Uye"]),
    );

    return typedRows.map((row) => mapOrderRow(row, profileNameById));
  } catch {
    return [];
  }
}

export async function fetchAdminMinuteOrders(limit = 100): Promise<MinutePurchaseOrder[]> {
  try {
    const supabase = getSupabaseBrowserClient();
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
    const { data: rows, error } = await supabase
      .from("minute_purchase_orders")
      .select("id, user_id, package_id, package_name, package_type, amount, price_try, status, admin_id, admin_note, created_at, updated_at, decided_at")
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (error || !rows) {
      return [];
    }

    const typedRows = rows as MinutePurchaseOrderRow[];
    const profileIds = Array.from(new Set(typedRows.flatMap((row) => [row.user_id, row.admin_id].filter(Boolean) as string[])));
    const { data: profileRows } = profileIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", profileIds)
      : { data: [] };
    const profileNameById = new Map<string, string>(
      ((profileRows as ProfileRow[] | null) ?? []).map((profileRow) => [profileRow.id, profileRow.display_name?.trim() || "Uye"]),
    );

    return typedRows.map((row) => mapOrderRow(row, profileNameById));
  } catch {
    return [];
  }
}
