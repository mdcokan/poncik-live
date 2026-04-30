import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type FixtureEmail = "admin@test.com" | "eda@test.com" | "veli@test.com";

type FixtureIdentity = {
  id: string;
  email: FixtureEmail;
};

const ADMIN_EMAIL: FixtureEmail = "admin@test.com";
const STREAMER_EMAIL: FixtureEmail = "eda@test.com";
const VIEWER_EMAIL: FixtureEmail = "veli@test.com";
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return json(
      {
        ok: false,
        message: "Missing required env vars for test fixture normalization (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY).",
      },
      { status: 500 },
    );
  }

  try {
    const adminClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const streamerClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const viewerClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: adminAuth, error: adminLoginError } = await adminClient.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: FIXTURE_PASSWORD,
    });
    if (adminLoginError) {
      throw new Error(`Failed to authenticate fixture admin: ${adminLoginError.message}`);
    }
    const { data: streamerAuth, error: streamerLoginError } = await streamerClient.auth.signInWithPassword({
      email: STREAMER_EMAIL,
      password: FIXTURE_PASSWORD,
    });
    if (streamerLoginError) {
      throw new Error(`Failed to authenticate fixture streamer: ${streamerLoginError.message}`);
    }
    const { data: viewerAuth, error: viewerLoginError } = await viewerClient.auth.signInWithPassword({
      email: VIEWER_EMAIL,
      password: FIXTURE_PASSWORD,
    });
    if (viewerLoginError) {
      throw new Error(`Failed to authenticate fixture viewer: ${viewerLoginError.message}`);
    }

    const adminUser = adminAuth.user;
    const streamerUser = streamerAuth.user;
    const viewerUser = viewerAuth.user;
    if (!adminUser || !streamerUser || !viewerUser) {
      throw new Error("Could not resolve fixture users from auth sessions.");
    }

    const fixtureUsers: Record<FixtureEmail, FixtureIdentity> = {
      "admin@test.com": { id: adminUser.id, email: ADMIN_EMAIL },
      "eda@test.com": { id: streamerUser.id, email: STREAMER_EMAIL },
      "veli@test.com": { id: viewerUser.id, email: VIEWER_EMAIL },
    };

    const manage = async (userId: string, action: "ban" | "unban" | "set_role", role?: "viewer" | "streamer" | "admin") => {
      const { error } = await adminClient.rpc("admin_manage_profile", {
        p_user_id: userId,
        p_action: action,
        p_role: role ?? null,
      });
      if (error) {
        throw new Error(`admin_manage_profile(${action}) failed: ${error.message}`);
      }
    };

    await manage(fixtureUsers[ADMIN_EMAIL].id, "unban");
    await manage(fixtureUsers[STREAMER_EMAIL].id, "set_role", "streamer");
    await manage(fixtureUsers[STREAMER_EMAIL].id, "unban");
    await manage(fixtureUsers[VIEWER_EMAIL].id, "set_role", "viewer");
    await manage(fixtureUsers[VIEWER_EMAIL].id, "unban");

    await manage(fixtureUsers[STREAMER_EMAIL].id, "ban");
    await manage(fixtureUsers[STREAMER_EMAIL].id, "unban");

    const { error: adminDisplayNameError } = await adminClient
      .from("profiles")
      .update({ display_name: "Admin Can" })
      .eq("id", fixtureUsers[ADMIN_EMAIL].id);
    if (adminDisplayNameError) {
      throw new Error(`Failed to set admin display_name: ${adminDisplayNameError.message}`);
    }
    const { error: streamerDisplayNameError } = await streamerClient
      .from("profiles")
      .update({ display_name: "Yayıncı Eda" })
      .eq("id", fixtureUsers[STREAMER_EMAIL].id);
    if (streamerDisplayNameError) {
      throw new Error(`Failed to set streamer display_name: ${streamerDisplayNameError.message}`);
    }
    const { error: viewerDisplayNameError } = await viewerClient
      .from("profiles")
      .update({ display_name: "Üye Veli" })
      .eq("id", fixtureUsers[VIEWER_EMAIL].id);
    if (viewerDisplayNameError) {
      throw new Error(`Failed to set viewer display_name: ${viewerDisplayNameError.message}`);
    }

    const { data: wallet } = await adminClient.from("wallets").select("balance").eq("user_id", fixtureUsers[VIEWER_EMAIL].id).maybeSingle();
    const currentBalance = typeof wallet?.balance === "number" ? wallet.balance : 0;
    if (currentBalance < 500) {
      const topup = 500 - currentBalance;
      const { error: walletAdjustError } = await adminClient.rpc("admin_adjust_wallet", {
        p_user_id: fixtureUsers[VIEWER_EMAIL].id,
        p_amount: topup,
        p_reason: "e2e fixture normalize",
      });
      if (walletAdjustError) {
        throw new Error(`Failed to top up fixture wallet: ${walletAdjustError.message}`);
      }
    }

    return json({ ok: true });
  } catch (error) {
    return json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Fixture normalize failed.",
      },
      { status: 500 },
    );
  }
}
