import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { waitForLiveRoomByStreamerName } from "./helpers/live-room";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const ADMIN_EMAIL = "admin@test.com";
const PASSWORD = "123123";

type StreamerEarningsSnapshot = {
  availableWithdrawalMinutes: number;
  payload: Record<string, unknown> | null;
  url: string;
};

function parseMinutes(text: string) {
  const match = text.match(/(-?\d+)/);
  if (!match) {
    return 0;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : 0;
}

async function readStreamerEarningsSnapshot(page: import("@playwright/test").Page): Promise<StreamerEarningsSnapshot> {
  const earningsResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().includes("/api/streamer/earnings"),
    { timeout: 20_000 },
  );
  await page.goto("/streamer");
  const response = await earningsResponsePromise;
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const availableFromApi = payload?.availableWithdrawalMinutes;
  if (typeof availableFromApi === "number" && Number.isFinite(availableFromApi)) {
    return {
      availableWithdrawalMinutes: availableFromApi,
      payload,
      url: page.url(),
    };
  }

  const availableText =
    (await page.getByRole("heading", { name: /Cekilebilir bakiye/i }).first().locator("xpath=..").textContent()) ?? "";
  return {
    availableWithdrawalMinutes: parseMinutes(availableText),
    payload,
    url: page.url(),
  };
}

test("streamer withdrawal request flow works end-to-end", async ({ browser, request }, testInfo) => {
  test.setTimeout(420_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();
  const adminPage = await adminContext.newPage();

  let sessionStarted = false;

  try {
    await loginWithStabilizedAuth(
      streamerPage,
      {
        role: "streamer",
        loginPath: "/streamer-login",
        email: STREAMER_EMAIL,
        password: PASSWORD,
        successUrl: /\/(streamer|studio)(?:\/|$)/,
        targetUrl: "/studio",
        successIndicator: streamerPage.getByRole("button", { name: /ba[sş]la/i }).first(),
      },
      testInfo,
    );
    await streamerPage.goto("/studio");
    const startButton = streamerPage.getByRole("button", { name: /ba[sş]la/i }).first();
    const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i }).first();
    if (await stopButton.isVisible().catch(() => false)) {
      await stopButton.click();
      await expect(startButton).toBeVisible({ timeout: 20_000 });
    }
    await startButton.click();
    await expect(stopButton).toBeVisible({ timeout: 20_000 });
    const roomId = (await waitForLiveRoomByStreamerName(request, /Eda/i)).id;

    await loginWithStabilizedAuth(
      memberPage,
      {
        role: "member",
        loginPath: "/login",
        email: MEMBER_EMAIL,
        password: PASSWORD,
        successUrl: /\/member(?:\/|$)/,
        targetUrl: "/member",
        successIndicator: memberPage.getByRole("heading", { name: /Online Yayincilar|Online Yayıncılar/i }).first(),
      },
      testInfo,
    );
    async function completePrivateSession() {
      await streamerPage.goto("/studio");
      await memberPage.goto(`/rooms/${roomId}`);
      await memberPage.getByTestId("private-room-request-button").click();
      await expect(memberPage.getByTestId("private-request-feedback")).toContainText(/iletildi|bekleyen/i, { timeout: 20_000 });
      await expect(streamerPage.getByTestId("accept-private-request-button").first()).toBeVisible({ timeout: 25_000 });
      await streamerPage.getByTestId("accept-private-request-button").first().click();
      await expect(streamerPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });
      await expect(memberPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });
      sessionStarted = true;
      await memberPage.waitForTimeout(2200);
      await memberPage.getByTestId("private-session-end-button").click();
      await expect(memberPage.getByTestId("private-session-result")).toContainText(/harcanan s[üu]re/i, { timeout: 30_000 });
      sessionStarted = false;
      await expect(streamerPage.getByTestId("private-session-panel")).toHaveCount(0, { timeout: 30_000 });
    }

    await completePrivateSession();

    const initialSnapshot = await readStreamerEarningsSnapshot(streamerPage);
    let latestSnapshot = initialSnapshot;
    try {
      await expect
        .poll(
          async () => {
            latestSnapshot = await readStreamerEarningsSnapshot(streamerPage);
            if (latestSnapshot.availableWithdrawalMinutes <= 0) {
              await completePrivateSession();
              latestSnapshot = await readStreamerEarningsSnapshot(streamerPage);
            }
            return latestSnapshot.availableWithdrawalMinutes;
          },
          { timeout: 180_000, intervals: [1_500, 2_500, 4_000, 6_000, 8_000] },
        )
        .toBeGreaterThan(0);
    } catch (error) {
      const recentWithdrawals = Array.isArray(latestSnapshot.payload?.["recentWithdrawals"])
        ? latestSnapshot.payload?.["recentWithdrawals"]
        : [];
      const recentPrivateRoomEarnings = Array.isArray(latestSnapshot.payload?.["recentPrivateRoomEarnings"])
        ? latestSnapshot.payload?.["recentPrivateRoomEarnings"]
        : [];
      throw new Error(
        [
          "availableWithdrawalMinutes remained 0 after private-room session.",
          `/api/streamer/earnings response: ${JSON.stringify(latestSnapshot.payload ?? {}, null, 2)}`,
          `son withdrawal row'lari: ${JSON.stringify(recentWithdrawals, null, 2)}`,
          `recentPrivateRoomEarnings: ${JSON.stringify(recentPrivateRoomEarnings, null, 2)}`,
          `current streamer URL: ${latestSnapshot.url}`,
          `initial availableWithdrawalMinutes: ${initialSnapshot.availableWithdrawalMinutes}`,
          `latest availableWithdrawalMinutes: ${latestSnapshot.availableWithdrawalMinutes}`,
          `original error: ${error instanceof Error ? error.message : String(error)}`,
        ].join("\n"),
      );
    }
    const availableBeforeRequest = latestSnapshot.availableWithdrawalMinutes;
    expect(availableBeforeRequest).toBeGreaterThan(0);

    await streamerPage.getByTestId("streamer-withdrawal-form").locator('input[type="number"]').fill("1");
    await streamerPage.getByTestId("streamer-withdrawal-form").locator("textarea").fill("Playwright test IBAN notu");
    await streamerPage.getByTestId("streamer-withdrawal-submit").click();
    await expect(streamerPage.getByText(/Cekim talebin alindi/i)).toBeVisible({ timeout: 20_000 });
    await expect(streamerPage.getByTestId("streamer-withdrawal-row").first()).toContainText(/pending/i, { timeout: 20_000 });

    await loginWithStabilizedAuth(
      adminPage,
      {
        role: "member",
        loginPath: "/login",
        email: ADMIN_EMAIL,
        password: PASSWORD,
        successUrl: /\/admin(?:\/|$)/,
        targetUrl: "/admin/finance",
        successIndicator: adminPage.getByRole("heading", { name: /kazanc|finans/i }).first(),
      },
      testInfo,
    );
    await adminPage.goto("/admin/finance");
    const panel = adminPage.getByTestId("admin-withdrawals-panel");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    const row = panel.getByTestId("admin-withdrawal-row").filter({ hasText: /Yayıncı Eda|Yayinci Eda/i }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByTestId("approve-withdrawal-button").click();
    await expect(adminPage.getByText(/Cekim talebi onaylandi/i)).toBeVisible({ timeout: 20_000 });

    await streamerPage.goto("/streamer");
    await expect(streamerPage.getByTestId("streamer-withdrawal-row").first()).toContainText(/approved/i, { timeout: 20_000 });
    const postApprovalSnapshot = await readStreamerEarningsSnapshot(streamerPage);
    expect(postApprovalSnapshot.availableWithdrawalMinutes).toBeGreaterThanOrEqual(0);
    expect(postApprovalSnapshot.availableWithdrawalMinutes).toBeLessThan(availableBeforeRequest);

    await adminPage.goto("/admin/logs");
    const approvedLogRow = adminPage.locator("tbody tr").filter({ hasText: /streamer_withdrawal_approved|Yayıncı çekim talebi onaylandı/i }).first();
    await expect(approvedLogRow).toBeVisible({ timeout: 20_000 });
  } finally {
    if (!streamerPage.isClosed()) {
      const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i }).first();
      if (await stopButton.isVisible().catch(() => false)) {
        await stopButton.click().catch(() => {});
      }
    }
    if (sessionStarted && !memberPage.isClosed()) {
      const endButton = memberPage.getByTestId("private-session-end-button");
      if (await endButton.isVisible().catch(() => false)) {
        await endButton.click().catch(() => {});
      }
    }
    await normalizeTestFixtures(request).catch(() => {});
    await adminContext.close().catch(() => {});
    await memberContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
