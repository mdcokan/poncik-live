import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const ADMIN_ROLES = new Set(["admin", "owner"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type ProfileRow = {
  id: string;
  display_name: string | null;
  role: string;
  is_banned: boolean;
  updated_at: string;
};

type WalletRow = {
  user_id: string;
  balance: number;
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

function parseLimit(rawLimit: string | null) {
  const limit = Number.parseInt(rawLimit ?? `${DEFAULT_LIMIT}`, 10);
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(limit, 1), MAX_LIMIT);
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, message: "Kullanıcılar yüklenemedi." }, { status: 500 });
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

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const limit = parseLimit(url.searchParams.get("limit"));

    let query = supabase
      .from("profiles")
      .select("id, display_name, role, is_banned, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (q) {
      query = query.ilike("display_name", `%${q}%`);
    }

    const { data: profileRows, error: profileError } = await query;
    if (profileError) {
      return noStoreJson({ ok: false, message: "Kullanıcılar yüklenemedi." }, { status: 500 });
    }

    const safeProfiles = (profileRows as ProfileRow[] | null) ?? [];
    const userIds = safeProfiles.map((profile) => profile.id);
    const { data: walletRows } = userIds.length
      ? await supabase.from("wallets").select("user_id, balance").in("user_id", userIds)
      : { data: [] as WalletRow[] };
    const walletByUserId = new Map<string, number>(
      ((walletRows as WalletRow[] | null) ?? []).map((wallet) => [wallet.user_id, wallet.balance]),
    );

    return noStoreJson({
      ok: true,
      users: safeProfiles.map((profile) => ({
        id: profile.id,
        displayName: profile.display_name?.trim() || "Uye",
        role: profile.role,
        isBanned: profile.is_banned,
        balance: walletByUserId.get(profile.id) ?? 0,
        updatedAt: profile.updated_at,
      })),
    });
  } catch {
    return noStoreJson({ ok: false, message: "Kullanıcılar yüklenemedi." }, { status: 500 });
  }
}
