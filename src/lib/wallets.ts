import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type ProfileRow = {
  id: string;
  display_name: string | null;
  role: string;
};

type WalletRow = {
  user_id: string;
  balance: number;
  updated_at: string;
};

type WalletAdjustmentRow = {
  id: string;
  user_id: string;
  amount: number;
  reason: string | null;
  admin_id: string;
  created_at: string;
};

export type WalletSummary = {
  userId: string;
  displayName: string;
  email?: string;
  role: string;
  balance: number;
  updatedAt: string | null;
};

export type WalletAdjustment = {
  id: string;
  userId: string;
  displayName: string;
  amount: number;
  reason: string | null;
  adminId: string;
  createdAt: string;
};

async function getCurrentUserRole(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();

  return profile?.role ?? null;
}

export async function fetchCurrentUserWallet(supabaseClient?: SupabaseClient): Promise<number | null> {
  try {
    const supabase = supabaseClient ?? getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle<{ balance: number }>();

    return wallet?.balance ?? 0;
  } catch {
    return null;
  }
}

export async function fetchAdminWalletSummaries(limit = 50, supabaseClient?: SupabaseClient): Promise<WalletSummary[]> {
  try {
    const supabase = supabaseClient ?? getSupabaseBrowserClient();
    const role = await getCurrentUserRole(supabase);
    if (role !== "admin" && role !== "owner") {
      return [];
    }

    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 50);
    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name, role")
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (profileError || !profileRows?.length) {
      return [];
    }

    const userIds = profileRows.map((row) => row.id);
    const { data: walletRows } = await supabase
      .from("wallets")
      .select("user_id, balance, updated_at")
      .in("user_id", userIds);

    const walletByUserId = new Map<string, WalletRow>((walletRows as WalletRow[] | null)?.map((row) => [row.user_id, row]) ?? []);

    return (profileRows as ProfileRow[]).map((profileRow) => {
      const walletRow = walletByUserId.get(profileRow.id);
      return {
        userId: profileRow.id,
        displayName: profileRow.display_name?.trim() || "Uye",
        role: profileRow.role,
        balance: walletRow?.balance ?? 0,
        updatedAt: walletRow?.updated_at ?? null,
      };
    });
  } catch {
    return [];
  }
}

export async function fetchAdminWalletAdjustments(limit = 50, supabaseClient?: SupabaseClient): Promise<WalletAdjustment[]> {
  try {
    const supabase = supabaseClient ?? getSupabaseBrowserClient();
    const role = await getCurrentUserRole(supabase);
    if (role !== "admin" && role !== "owner") {
      return [];
    }

    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 50);
    const { data: rows, error } = await supabase
      .from("wallet_adjustments")
      .select("id, user_id, amount, reason, admin_id, created_at")
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (error || !rows?.length) {
      return [];
    }

    const userIds = Array.from(new Set((rows as WalletAdjustmentRow[]).map((row) => row.user_id)));
    const { data: profileRows } = userIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", userIds)
      : { data: [] };
    const displayNameByUserId = new Map<string, string>(
      (profileRows as Array<{ id: string; display_name: string | null }> | null)?.map((profileRow) => [
        profileRow.id,
        profileRow.display_name?.trim() || "Uye",
      ]) ?? [],
    );

    return (rows as WalletAdjustmentRow[]).map((row) => ({
      id: row.id,
      userId: row.user_id,
      displayName: displayNameByUserId.get(row.user_id) ?? "Uye",
      amount: row.amount,
      reason: row.reason,
      adminId: row.admin_id,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}
