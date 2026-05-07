import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";
import { waitForLiveRoomByStreamerName } from "./helpers/live-room";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const ADMIN_EMAIL = "admin@test.com";
const PASSWORD = "123123";

function parseBalance(value: string) {
  const matches = value.match(/-?\d+/g);
  if (!matches?.length) {
    return null;
  }
  return Number.parseInt(matches[matches.length - 1] ?? "0", 10);
}

function parseSpentMinutesFromResultText(value: string) {
  const match = value.match(/harcanan s[üu]re:\s*(\d+)\s*dk/i);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

test("private room busy redirect and pricing multiplier", async ({ browser, request }, testInfo) => {
  test.setTimeout(420_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const otherViewerContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();
  const otherViewerPage = await otherViewerContext.newPage();
  const adminPage = await adminContext.newPage();

  try {
    await loginWithStabilizedAuth(
      adminPage,
      {
        role: "member",
        loginPath: "/login",
        email: ADMIN_EMAIL,
        password: PASSWORD,
        successUrl: /\/admin(?:\/|$)/,
        targetUrl: "/admin/settings",
        successIndicator: adminPage.getByRole("heading", { name: /sistem ayarlar/i }).first(),
      },
      testInfo,
    );

    await adminPage.goto("/admin/settings");
    const pricePerMinute = 2;
    await adminPage.getByTestId("admin-private-room-price-input").fill(String(pricePerMinute));
    await adminPage.getByTestId("admin-private-room-settings-save").click();
    await expect(adminPage.getByTestId("admin-private-room-settings-status")).toContainText(/kaydedildi/i, { timeout: 20_000 });

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
    await expect
      .poll(
        async () => parseBalance((await memberPage.getByTestId("member-wallet-balance").textContent()) ?? ""),
        { timeout: 25_000, message: "member wallet balance should be loaded before private-room flow" },
      )
      .toBeGreaterThan(pricePerMinute);
    const startBalance = parseBalance((await memberPage.getByTestId("member-wallet-balance").textContent()) ?? "") ?? 0;
    await memberPage.goto(`/rooms/${roomId}`);
    await expect(memberPage.getByTestId("private-room-price-label")).toContainText(/2 dk \/ dakika/i, { timeout: 20_000 });
    await memberPage.getByTestId("private-room-request-button").click();
    await expect(memberPage.getByTestId("private-request-feedback")).toContainText(/bekleniyor|gönderildi|gonderildi/i, { timeout: 20_000 });

    await loginWithStabilizedAuth(
      otherViewerPage,
      {
        role: "member",
        loginPath: "/login",
        email: ADMIN_EMAIL,
        password: PASSWORD,
        successUrl: /\/admin(?:\/|$)/,
        targetUrl: `/rooms/${roomId}`,
        successIndicator: otherViewerPage.locator("body"),
      },
      testInfo,
    );
    await otherViewerPage.goto(`/rooms/${roomId}`);

    await expect(streamerPage.getByTestId("studio-private-request-accept-button").first()).toBeVisible({ timeout: 25_000 });
    await streamerPage.getByTestId("studio-private-request-accept-button").first().click();

    await expect(streamerPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });
    await expect(memberPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });
    await expect(otherViewerPage.getByTestId("room-private-busy-notice")).toBeVisible({ timeout: 30_000 });
    await expect(otherViewerPage.getByTestId("room-private-busy-redirecting")).toBeVisible({ timeout: 30_000 });
    await expect(otherViewerPage.getByTestId("private-room-request-button")).toBeDisabled({ timeout: 30_000 });

    await memberPage.waitForTimeout(2500);
    const endResponsePromise = memberPage.waitForResponse(
      (response) => response.request().method() === "POST" && /\/api\/private-sessions\/[^/]+\/end$/.test(new URL(response.url()).pathname),
      { timeout: 30_000 },
    );
    await memberPage.getByTestId("private-session-end-button").click();
    const endResponse = await endResponsePromise;
    await expect(memberPage.getByTestId("private-session-result")).toContainText(/harcanan s[üu]re/i, { timeout: 30_000 });
    const resultText = (await memberPage.getByTestId("private-session-result").textContent()) ?? "";
    const spentMinutesFromResult = parseSpentMinutesFromResultText(resultText);

    let chargedMinutesFromApi: number | null = null;
    if (endResponse.ok()) {
      const payload = (await endResponse.json().catch(() => null)) as { session?: { chargedMinutes?: number } } | null;
      if (typeof payload?.session?.chargedMinutes === "number" && Number.isFinite(payload.session.chargedMinutes)) {
        chargedMinutesFromApi = payload.session.chargedMinutes;
      }
    }

    await memberPage.goto("/member");
    if (typeof chargedMinutesFromApi === "number") {
      await expect
        .poll(
          async () => parseBalance((await memberPage.getByTestId("member-wallet-balance").textContent()) ?? ""),
          { timeout: 30_000, message: "wallet should align with chargedMinutes from end-session API" },
        )
        .toBe(startBalance - chargedMinutesFromApi);
    } else {
      await expect
        .poll(
          async () => parseBalance((await memberPage.getByTestId("member-wallet-balance").textContent()) ?? ""),
          { timeout: 30_000, message: "wallet should be reduced after private session end" },
        )
        .toBeLessThanOrEqual(startBalance - pricePerMinute);
    }
    const finalBalance = parseBalance((await memberPage.getByTestId("member-wallet-balance").textContent()) ?? "") ?? 0;

    const actualSpent = startBalance - finalBalance;
    expect(actualSpent).toBeGreaterThanOrEqual(pricePerMinute);

    if (typeof chargedMinutesFromApi === "number") {
      expect(actualSpent).toBe(chargedMinutesFromApi);
    } else if (typeof spentMinutesFromResult === "number") {
      expect(actualSpent).toBe(spentMinutesFromResult);
    } else {
      expect(actualSpent).toBeLessThanOrEqual(pricePerMinute * 3);
    }
  } finally {
    if (!streamerPage.isClosed()) {
      const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i }).first();
      if (await stopButton.isVisible().catch(() => false)) {
        await stopButton.click().catch(() => {});
      }
    }
    await normalizeTestFixtures(request).catch(() => {});
    await adminContext.close().catch(() => {});
    await otherViewerContext.close().catch(() => {});
    await memberContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
