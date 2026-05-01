import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const ADMIN_ROLES = new Set(["admin", "owner"]);
const ALLOWED_STATUS = new Set(["pending", "approved", "rejected", "cancelled"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type WithdrawalRow = {
  id: string;
  streamer_id: string;
  requested_minutes: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  payment_note: string | null;
  admin_note: string | null;
  created_at: string;
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
    return noStoreJson({ ok: false, message: "Çekim talepleri yüklenemedi." }, { status: 500 });
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
    const status = (url.searchParams.get("status") ?? "pending").trim().toLowerCase();
    const limit = parseLimit(url.searchParams.get("limit"));
    if (!ALLOWED_STATUS.has(status)) {
      return noStoreJson({ ok: false, message: "Geçersiz durum filtresi." }, { status: 400 });
    }

    const { data: rows, error: listError } = await supabase
      .from("streamer_withdrawal_requests")
      .select("id, streamer_id, requested_minutes, status, payment_note, admin_note, created_at, decided_at")
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (listError) {
      return noStoreJson({ ok: false, message: "Çekim talepleri yüklenemedi." }, { status: 500 });
    }

    const requests = (rows as WithdrawalRow[] | null) ?? [];
    const streamerIds = Array.from(new Set(requests.map((row) => row.streamer_id)));
    const { data: profileRows } = streamerIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", streamerIds)
      : { data: [] };
    const nameByStreamerId = new Map<string, string>(
      ((profileRows as ProfileRow[] | null) ?? []).map((row) => [row.id, row.display_name?.trim() || "Yayıncı"]),
    );

    return noStoreJson({
      ok: true,
      requests: requests.map((row) => ({
        id: row.id,
        streamerId: row.streamer_id,
        streamerName: nameByStreamerId.get(row.streamer_id) ?? "Yayıncı",
        requestedMinutes: row.requested_minutes,
        status: row.status,
        paymentNote: row.payment_note,
        adminNote: row.admin_note,
        createdAt: row.created_at,
        decidedAt: row.decided_at,
      })),
    });
  } catch {
    return noStoreJson({ ok: false, message: "Çekim talepleri yüklenemedi." }, { status: 500 });
  }
}
