import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { DEFAULT_PRIVATE_ROOM_PRICING, normalizePrivateRoomPricing } from "@/lib/private-room-pricing";

const ADMIN_ROLES = new Set(["admin", "owner"]);

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SettingsRow = {
  key: string;
  value: unknown;
};

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

async function getAdminSupabase(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return { supabase: null, errorResponse: noStoreJson({ ok: false, message: "Sunucu ayarı eksik." }, { status: 500 }) };
  }

  const authHeader = parseBearerToken(request);
  if (!authHeader) {
    return { supabase: null, errorResponse: noStoreJson({ ok: false, message: "Giriş gerekli." }, { status: 401 }) };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
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
    return { supabase: null, errorResponse: noStoreJson({ ok: false, message: "Giriş gerekli." }, { status: 401 }) };
  }

  const { data: actorProfile, error: actorProfileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();
  if (actorProfileError || !actorProfile || !ADMIN_ROLES.has(actorProfile.role)) {
    return { supabase: null, errorResponse: noStoreJson({ ok: false, message: "Bu işlem için yetkin yok." }, { status: 403 }) };
  }

  return { supabase, errorResponse: null };
}

export async function GET(request: Request) {
  const { supabase, errorResponse } = await getAdminSupabase(request);
  if (!supabase || errorResponse) {
    return errorResponse;
  }

  const { data, error } = await supabase
    .from("platform_settings")
    .select("key, value")
    .eq("key", "private_room_pricing")
    .maybeSingle<SettingsRow>();
  if (error) {
    return noStoreJson({ ok: false, message: "Ayarlar alınamadı." }, { status: 500 });
  }

  const pricing = normalizePrivateRoomPricing(data?.value ?? DEFAULT_PRIVATE_ROOM_PRICING);
  return noStoreJson({ ok: true, pricing });
}

export async function POST(request: Request) {
  const { supabase, errorResponse } = await getAdminSupabase(request);
  if (!supabase || errorResponse) {
    return errorResponse;
  }

  let payload: { pricePerMinute?: unknown; streamerSharePercent?: unknown };
  try {
    payload = (await request.json()) as { pricePerMinute?: unknown; streamerSharePercent?: unknown };
  } catch {
    return noStoreJson({ ok: false, message: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const pricing = normalizePrivateRoomPricing({
    pricePerMinute: payload.pricePerMinute,
    streamerSharePercent: payload.streamerSharePercent,
  });

  const { error } = await supabase.from("platform_settings").upsert(
    {
      key: "private_room_pricing",
      value: {
        pricePerMinute: pricing.pricePerMinute,
        streamerSharePercent: pricing.streamerSharePercent,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) {
    return noStoreJson({ ok: false, message: "Ayarlar kaydedilemedi." }, { status: 500 });
  }

  return noStoreJson({ ok: true, pricing, message: "Özel oda ayarları kaydedildi." });
}
