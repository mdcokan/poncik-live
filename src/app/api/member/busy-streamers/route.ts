import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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

function parseBearer(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return header;
}

type SessionRow = {
  id: string;
  streamer_id: string;
  room_id: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type BusyStreamerPayload = {
  sessionId: string;
  streamerId: string;
  roomId: string;
  streamerName: string;
};

export async function GET(request: Request) {
  const authHeader = parseBearer(request);
  if (!authHeader) {
    return noStoreJson({ ok: false, message: "Giriş yapmalısın." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return noStoreJson({ ok: false, message: "Sunucu ayarları eksik." }, { status: 500 });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: authHeader },
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });

  const {
    data: { user: authedUser },
  } = await userClient.auth.getUser();
  if (!authedUser) {
    return noStoreJson({ ok: false, message: "Giriş yapmalısın." }, { status: 401 });
  }

  if (!serviceRoleKey) {
    return noStoreJson({ ok: true, streamers: [] as BusyStreamerPayload[] });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });

  const { data: sessions, error } = await admin
    .from("private_room_sessions")
    .select("id, streamer_id, room_id")
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(48);

  if (error) {
    return noStoreJson({ ok: false, message: "Meşgul yayıncılar alınamadı." }, { status: 500 });
  }

  const seen = new Set<string>();
  const deduped: SessionRow[] = [];
  for (const row of (sessions ?? []) as SessionRow[]) {
    if (seen.has(row.streamer_id)) {
      continue;
    }
    seen.add(row.streamer_id);
    deduped.push(row);
    if (deduped.length >= 24) {
      break;
    }
  }

  const streamerIds = deduped.map((r) => r.streamer_id);
  if (streamerIds.length === 0) {
    return noStoreJson({ ok: true, streamers: [] });
  }

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, display_name")
    .in("id", streamerIds);

  if (profileError) {
    return noStoreJson({ ok: false, message: "Meşgul yayıncılar alınamadı." }, { status: 500 });
  }

  const nameById = new Map(
    ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p.display_name?.trim() || "Yayıncı"]),
  );

  const streamers: BusyStreamerPayload[] = deduped.map((row) => ({
    sessionId: row.id,
    streamerId: row.streamer_id,
    roomId: row.room_id,
    streamerName: nameById.get(row.streamer_id) ?? "Yayıncı",
  }));

  return noStoreJson({ ok: true, streamers });
}
