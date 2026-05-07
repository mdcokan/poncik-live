import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { DEFAULT_PRIVATE_ROOM_PRICING } from "@/lib/private-room-pricing";

type PricingRow = {
  price_per_minute: number;
  streamer_share_percent: number;
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

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, message: "Ayarlar alınamadı." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: authHeader
      ? {
          headers: { Authorization: authHeader },
          fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
        }
      : undefined,
  });

  const { data } = await supabase.rpc("get_private_room_pricing");
  const pricing = Array.isArray(data) ? (data[0] as PricingRow | undefined) : undefined;
  const pricePerMinute = Math.max(1, Math.floor(pricing?.price_per_minute ?? DEFAULT_PRIVATE_ROOM_PRICING.pricePerMinute));
  const streamerSharePercent = Math.min(
    100,
    Math.max(0, Math.floor(pricing?.streamer_share_percent ?? DEFAULT_PRIVATE_ROOM_PRICING.streamerSharePercent)),
  );

  return noStoreJson({
    ok: true,
    pricing: {
      pricePerMinute,
      streamerSharePercent,
    },
  });
}
