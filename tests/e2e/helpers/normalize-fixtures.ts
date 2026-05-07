import type { APIRequestContext } from "@playwright/test";

type NormalizeFixtureOptions = {
  viewerBalanceMinutes?: number;
  privateRoomPricePerMinute?: number;
};

export type NormalizeFixturesSnapshot = {
  eda: {
    id: string;
    role: string | null;
    is_banned: boolean | null;
    display_name: string | null;
  };
  veli: {
    id: string;
    role: string | null;
    is_banned: boolean | null;
    display_name: string | null;
    walletBalance: number | null;
  };
  privateRoomCleanup: {
    activeSessionsClosed: number;
    pendingRequestsCancelled: number;
    presenceRowsDeleted: number;
    liveRoomsClosedForEda: number;
  };
  privateRoomPricing: {
    pricePerMinute: number;
  };
};

export type NormalizeFixturesSuccess = {
  ok: true;
  snapshot?: NormalizeFixturesSnapshot;
};

export async function normalizeTestFixtures(
  request: APIRequestContext,
  options?: NormalizeFixtureOptions,
): Promise<NormalizeFixturesSuccess> {
  const fixtureSecret = process.env.TEST_FIXTURE_SECRET;
  const response = await request.post("/api/test/normalize-fixtures", {
    timeout: 30_000,
    headers: fixtureSecret ? { "x-test-fixture-secret": fixtureSecret } : undefined,
    data: options ?? {},
  });

  if (!response.ok()) {
    const errorText = await response.text().catch(() => "<unable to read response>");
    const runtimeHint =
      response.status() === 404
        ? " /api/test/normalize-fixtures returned 404. E2E server must run with ENABLE_TEST_ROUTES=true or non-production NODE_ENV."
        : "";
    throw new Error(
      `Fixture normalize request failed: status=${response.status()} body=${errorText.slice(0, 500)}${runtimeHint}`,
    );
  }

  const payload = (await response.json().catch(() => null)) as NormalizeFixturesSuccess | { ok?: boolean } | null;
  if (!payload || payload.ok !== true) {
    throw new Error(
      `Fixture normalize response did not return { ok: true }. status=${response.status()} body=${JSON.stringify(payload).slice(0, 500)}`,
    );
  }
  return payload as NormalizeFixturesSuccess;
}
