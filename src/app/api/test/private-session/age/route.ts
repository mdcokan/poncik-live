import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const ADMIN_EMAIL = "admin@test.com";
const FIXTURE_PASSWORD = "123123";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}

function forbiddenInProduction() {
  return json({ ok: false, message: "Not found." }, { status: 404 });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return forbiddenInProduction();
  }

  const requiredSecret = process.env.TEST_FIXTURE_SECRET;
  if (requiredSecret) {
    const incomingSecret = request.headers.get("x-test-fixture-secret");
    if (!incomingSecret || incomingSecret !== requiredSecret) {
      return json({ ok: false, message: "Forbidden." }, { status: 403 });
    }
  }

  let payload: { sessionId?: unknown; secondsAgo?: unknown };
  try {
    payload = (await request.json()) as { sessionId?: unknown; secondsAgo?: unknown };
  } catch {
    return json({ ok: false, message: "Bad request." }, { status: 400 });
  }

  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
  const secondsAgoRaw = typeof payload.secondsAgo === "number" ? payload.secondsAgo : Number.NaN;
  const secondsAgo = Number.isFinite(secondsAgoRaw) ? Math.max(0, Math.floor(secondsAgoRaw)) : Number.NaN;
  if (!sessionId || !Number.isFinite(secondsAgo)) {
    return json({ ok: false, message: "sessionId ve secondsAgo zorunludur." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return json({ ok: false, message: "Missing Supabase env vars." }, { status: 500 });
  }

  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, serviceRoleKey || anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (!serviceRoleKey) {
      const { error: adminLoginError } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: FIXTURE_PASSWORD,
      });
      if (adminLoginError) {
        throw new Error(`Admin auth failed: ${adminLoginError.message}`);
      }
    }

    const { data: targetSession, error: sessionError } = await supabase
      .from("private_room_sessions")
      .select("id, viewer_id, streamer_id")
      .eq("id", sessionId)
      .eq("status", "active")
      .maybeSingle<{ id: string; viewer_id: string; streamer_id: string }>();
    if (sessionError) {
      throw new Error(`Failed to find private session: ${sessionError.message}`);
    }
    if (!targetSession?.id) {
      return json({ ok: false, message: "Active private session bulunamadı." }, { status: 404 });
    }

    if (!serviceRoleKey) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", [targetSession.viewer_id, targetSession.streamer_id]);
      if (profileError) {
        throw new Error(`Failed to validate fixture users: ${profileError.message}`);
      }
      const profileMap = new Map((profiles ?? []).map((item) => [item.id, item.display_name?.trim() ?? ""]));
      const viewerName = profileMap.get(targetSession.viewer_id);
      const streamerName = profileMap.get(targetSession.streamer_id);
      if (viewerName !== "Üye Veli" || streamerName !== "Yayıncı Eda") {
        return json({ ok: false, message: "Fixture private session doğrulanamadı." }, { status: 403 });
      }
    }

    const startedAtIso = new Date(Date.now() - secondsAgo * 1000).toISOString();
    const { data: updatedSession, error: updateError } = await supabase
      .from("private_room_sessions")
      .update({ started_at: startedAtIso })
      .eq("id", sessionId)
      .eq("status", "active")
      .select("id")
      .maybeSingle<{ id: string }>();

    if (updateError) {
      throw new Error(`Failed to age private session: ${updateError.message}`);
    }
    if (!updatedSession?.id) return json({ ok: false, message: "Active private session bulunamadı." }, { status: 404 });

    return json({ ok: true, sessionId: updatedSession.id, secondsAgo });
  } catch (error) {
    return json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to age private session.",
      },
      { status: 500 },
    );
  }
}
