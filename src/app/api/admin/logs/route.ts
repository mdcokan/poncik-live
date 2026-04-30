import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const ADMIN_ROLES = new Set(["admin", "owner"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type AdminActionLogRow = {
  id: string;
  action_type: string;
  description: string;
  admin_id: string;
  target_user_id: string | null;
  target_room_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
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

function parseLimit(rawLimit: string | null) {
  const limit = Number.parseInt(rawLimit ?? `${DEFAULT_LIMIT}`, 10);
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(limit, 1), MAX_LIMIT);
}

function escapeIlikeValue(value: string) {
  return value.replace(/[%_]/g, (match) => `\\${match}`).replace(/,/g, " ");
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, message: "Islem kayitlari yuklenemedi." }, { status: 500 });
  }

  const authHeader = parseBearerToken(request);
  if (!authHeader) {
    return noStoreJson({ ok: false, message: "Giris gerekli." }, { status: 401 });
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

    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const actionType = url.searchParams.get("actionType")?.trim() ?? "";
    const targetUserId = url.searchParams.get("targetUserId")?.trim() ?? "";
    const adminId = url.searchParams.get("adminId")?.trim() ?? "";
    const q = url.searchParams.get("q")?.trim() ?? "";

    let query = supabase
      .from("admin_action_logs")
      .select("id, action_type, description, admin_id, target_user_id, target_room_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (actionType) {
      query = query.eq("action_type", actionType);
    }
    if (targetUserId) {
      query = query.eq("target_user_id", targetUserId);
    }
    if (adminId) {
      query = query.eq("admin_id", adminId);
    }
    if (q) {
      const escapedSearch = escapeIlikeValue(q);
      query = query.or(`description.ilike.%${escapedSearch}%,action_type.ilike.%${escapedSearch}%`);
    }

    const { data: rows, error: logsError } = await query;
    if (logsError) {
      return noStoreJson({ ok: false, message: "Islem kayitlari yuklenemedi." }, { status: 500 });
    }

    const logs = (rows as AdminActionLogRow[] | null) ?? [];
    const profileIds = Array.from(
      new Set(logs.flatMap((log) => [log.admin_id, log.target_user_id]).filter((value): value is string => Boolean(value))),
    );
    const { data: profileRows } = profileIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", profileIds)
      : { data: [] as ProfileRow[] };
    const profileNameById = new Map<string, string>(
      ((profileRows as ProfileRow[] | null) ?? []).map((profileRow) => [profileRow.id, profileRow.display_name?.trim() || "Uye"]),
    );

    return noStoreJson({
      ok: true,
      logs: logs.map((log) => ({
        id: log.id,
        actionType: log.action_type,
        description: log.description,
        adminId: log.admin_id,
        adminName: profileNameById.get(log.admin_id) ?? "Admin",
        targetUserId: log.target_user_id,
        targetUserName: log.target_user_id ? (profileNameById.get(log.target_user_id) ?? "Uye") : null,
        targetRoomId: log.target_room_id,
        metadata: log.metadata ?? {},
        createdAt: log.created_at,
      })),
    });
  } catch {
    return noStoreJson({ ok: false, message: "Islem kayitlari yuklenemedi." }, { status: 500 });
  }
}
