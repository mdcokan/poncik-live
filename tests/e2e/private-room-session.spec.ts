import { expect, test, type Page } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { waitForLiveRoomByStreamerName } from "./helpers/live-room";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

function parseBalance(value: string) {
  const match = value.match(/(-?\d+)/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

async function getWalletBalance(page: Page) {
  const text = (await page.getByTestId("member-wallet-balance").textContent()) ?? "";
  return parseBalance(text);
}

async function extractAccessToken(page: Page) {
  return page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) {
        continue;
      }
      const raw = localStorage.getItem(key);
      if (!raw) {
        continue;
      }
      try {
        const parsed = JSON.parse(raw) as
          | { access_token?: string; currentSession?: { access_token?: string } }
          | null;
        return parsed?.access_token ?? parsed?.currentSession?.access_token ?? null;
      } catch {
        return null;
      }
    }
    return null;
  });
}

test("private room session starts and charges member minutes", async ({ browser, request }, testInfo) => {
  test.setTimeout(420_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();
  const adminPage = await adminContext.newPage();

  let roomId = "";
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
    roomId = (await waitForLiveRoomByStreamerName(request, /Eda/i)).id;

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
    await memberPage.goto("/member");
    await expect
      .poll(async () => getWalletBalance(memberPage), { timeout: 25_000, message: "Veli wallet balance should be >= 500" })
      .toBeGreaterThanOrEqual(500);
    const startBalance = await getWalletBalance(memberPage);

    await memberPage.locator(`a[href="/rooms/${roomId}"]`).first().click();
    await expect(memberPage).toHaveURL(new RegExp(`/rooms/${roomId}$`), { timeout: 20_000 });
    await memberPage.getByTestId("private-room-request-button").click();
    await expect(memberPage.getByTestId("private-request-feedback")).toContainText(/iletildi|bekleyen/i, { timeout: 20_000 });

    const acceptButton = streamerPage.getByTestId("accept-private-request-button").first();
    await expect(acceptButton).toBeVisible({ timeout: 25_000 });
    await acceptButton.click();

    await expect(streamerPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });
    await expect(memberPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });
    await expect(memberPage.getByTestId("private-session-timer")).toContainText(/Geçen süre:\s*00:0[0-1]/i, { timeout: 30_000 });
    await expect(streamerPage.getByTestId("private-session-timer")).toContainText(/Geçen süre:\s*00:0[0-1]/i, { timeout: 30_000 });
    const memberPrivateSessionPanel = memberPage.getByTestId("private-session-panel");
    await expect(memberPrivateSessionPanel.getByText(/Yayıncı Eda/i)).toBeVisible({ timeout: 30_000 });
    await expect(memberPrivateSessionPanel.getByText(/Üye Veli/i)).toBeVisible({ timeout: 30_000 });
    sessionStarted = true;

    await memberPage.waitForTimeout(2500);
    await memberPage.getByTestId("private-session-end-button").click();

    await expect(memberPage.getByTestId("private-session-result")).toContainText(/kapat[ıi]ld[ıi].*harcanan s[üu]re/i, { timeout: 30_000 });
    await expect(streamerPage.getByTestId("private-session-panel")).toHaveCount(0, { timeout: 30_000 });

    await memberPage.goto("/member");
    await expect
      .poll(async () => getWalletBalance(memberPage), { timeout: 30_000, message: "wallet should be reduced after session end" })
      .toBeLessThanOrEqual(startBalance - 1);

    await streamerPage.goto("/streamer");
    await expect(streamerPage.getByRole("heading", { name: /bugunku ozel oda kazanci/i }).first()).toBeVisible({ timeout: 20_000 });
    await expect(streamerPage.getByText(/net:\s*[1-9]\d*\s*dk/i).first()).toBeVisible({ timeout: 20_000 });

    await loginWithStabilizedAuth(
      adminPage,
      {
        role: "member",
        loginPath: "/login",
        email: "admin@test.com",
        password: PASSWORD,
        successUrl: /\/admin(?:\/|$)/,
        targetUrl: "/admin/users",
        successIndicator: adminPage.getByRole("heading", { name: /kullan[ıi]c[ıi] y[öo]netimi/i }).first(),
      },
      testInfo,
    );
    await adminPage.goto("/admin/users");
    await adminPage.getByPlaceholder(/kullan[ıi]c[ıi]\s*ara/i).fill("Veli");
    await adminPage.getByRole("button", { name: /ara/i }).first().click();
    const veliRow = adminPage.locator("tr").filter({ hasText: /[uü]ye\s*veli/i }).first();
    await expect(veliRow).toBeVisible({ timeout: 20_000 });
    await veliRow.getByRole("link", { name: /detay/i }).first().click();
    await expect(adminPage).toHaveURL(/\/admin\/users\/[^/]+$/, { timeout: 20_000 });
    const detailUserId = adminPage.url().split("/").pop() ?? "";
    const adminAccessToken = await extractAccessToken(adminPage);
    expect(adminAccessToken).toBeTruthy();
    const detailRes = await request.get(`/api/admin/users/${detailUserId}`, {
      headers: { Authorization: `Bearer ${adminAccessToken}` },
      failOnStatusCode: false,
    });
    expect(detailRes.ok()).toBeTruthy();
    const detailPayload = (await detailRes.json().catch(() => ({}))) as {
      privateSessions?: Array<{ status?: string }>;
    };
    expect((detailPayload.privateSessions ?? []).length).toBeGreaterThan(0);
  } finally {
    if (!streamerPage.isClosed()) {
      const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i }).first();
      if (await stopButton.isVisible().catch(() => false)) {
        await stopButton.click().catch(() => {});
      }
    }
    if (sessionStarted && !memberPage.isClosed()) {
      const endBtn = memberPage.getByTestId("private-session-end-button");
      if (await endBtn.isVisible().catch(() => false)) {
        await endBtn.click().catch(() => {});
      }
    }
    await normalizeTestFixtures(request).catch(() => {});
    await adminContext.close().catch(() => {});
    await memberContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
