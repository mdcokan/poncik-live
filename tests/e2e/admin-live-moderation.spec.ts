import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";
import { waitForLiveRoomByStreamerName } from "./helpers/live-room";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const ADMIN_EMAIL = "admin@test.com";
const PASSWORD = "123123";

test("admin live panel room-level moderation flow", async ({ browser, request }, testInfo) => {
  test.setTimeout(240_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();
  const adminPage = await adminContext.newPage();

  const startButton = streamerPage.getByRole("button", { name: /ba[sş]la/i }).first();
  const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i }).first();
  let roomId = "";

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
        successIndicator: startButton,
      },
      testInfo,
    );

    await streamerPage.goto("/studio");
    await expect(streamerPage).toHaveURL(/\/studio(?:\/|$)/);
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

    await memberPage.goto(`/rooms/${roomId}`);
    await expect(memberPage).toHaveURL(new RegExp(`/rooms/${roomId}$`), { timeout: 20_000 });
    await expect(memberPage.getByPlaceholder(/Mesaj.*yaz|Mesaj/i).first()).toBeVisible({ timeout: 20_000 });

    await loginWithStabilizedAuth(
      adminPage,
      {
        role: "admin",
        loginPath: "/login",
        email: ADMIN_EMAIL,
        password: PASSWORD,
        successUrl: /\/admin(?:\/|$)/,
        targetUrl: "/admin/live",
      },
      testInfo,
    );

    await adminPage.goto("/admin/live");
    await expect(adminPage).toHaveURL(/\/admin\/live(?:\/|$)/);
    await adminPage.getByRole("button", { name: /Yenile/i }).first().click();

    const roomCard = adminPage.locator(`article:has(a[href="/rooms/${roomId}"])`).first();
    await expect(roomCard).toBeVisible({ timeout: 25_000 });
    const presenceSection = roomCard.locator("section").filter({ hasText: /Odadakiler/i }).first();
    await expect(presenceSection).toBeVisible({ timeout: 20_000 });

    const veliRow = presenceSection
      .locator('[data-testid^="admin-live-presence-row-"]')
      .filter({ hasText: /[uü]ye\s*veli|veli/i })
      .first();
    await expect(veliRow).toBeVisible({ timeout: 25_000 });

    const muteButton = veliRow.getByRole("button", { name: /^Sustur$/i }).first();
    if (!(await muteButton.isVisible().catch(() => false))) {
      const preUnmuteResponsePromise = adminPage.waitForResponse(
        (response) => response.url().includes(`/api/rooms/${roomId}/moderation`) && response.request().method() === "POST",
        { timeout: 20_000 },
      );
      await veliRow.getByRole("button", { name: /Sustur.*Kald/i }).first().click();
      expect((await preUnmuteResponsePromise).ok()).toBeTruthy();
      await adminPage.getByRole("button", { name: /Yenile/i }).first().click();
    }

    const veliRowBeforeMute = presenceSection
      .locator('[data-testid^="admin-live-presence-row-"]')
      .filter({ hasText: /[uü]ye\s*veli|veli/i })
      .first();
    const muteResponsePromise = adminPage.waitForResponse(
      (response) => response.url().includes(`/api/rooms/${roomId}/moderation`) && response.request().method() === "POST",
      { timeout: 20_000 },
    );
    await veliRowBeforeMute.getByRole("button", { name: /^Sustur$/i }).first().click();
    expect((await muteResponsePromise).ok()).toBeTruthy();
    await memberPage.reload({ waitUntil: "domcontentloaded" });
    await expect(memberPage.getByPlaceholder(/Mesaj.*yaz|Mesaj/i).first()).toBeDisabled({ timeout: 20_000 });

    const veliRowBeforeUnmute = presenceSection
      .locator('[data-testid^="admin-live-presence-row-"]')
      .filter({ hasText: /[uü]ye\s*veli|veli/i })
      .first();
    const unmuteResponsePromise = adminPage.waitForResponse(
      (response) => response.url().includes(`/api/rooms/${roomId}/moderation`) && response.request().method() === "POST",
      { timeout: 20_000 },
    );
    const unmuteButton = veliRowBeforeUnmute.getByRole("button", { name: /Sustur.*Kald/i }).first();
    await expect(unmuteButton).toBeVisible({ timeout: 20_000 });
    await unmuteButton.click();
    expect((await unmuteResponsePromise).ok()).toBeTruthy();
    await memberPage.reload({ waitUntil: "domcontentloaded" });
    await expect(memberPage.getByPlaceholder(/Mesaj.*yaz|Mesaj/i).first()).toBeEnabled({ timeout: 20_000 });

    const kickResponsePromise = adminPage.waitForResponse(
      (response) => response.url().includes(`/api/rooms/${roomId}/moderation`) && response.request().method() === "POST",
      { timeout: 20_000 },
    );
    await veliRow.getByRole("button", { name: /Odadan [ÇC]ıkar/i }).first().click();
    expect((await kickResponsePromise).ok()).toBeTruthy();
    await expect(memberPage.getByText(/Odadan [çc][ıi]kar[ıi]ld[ıi]n[ıi]z\./i).first()).toBeVisible({ timeout: 25_000 });

    await memberPage.goto(`/rooms/${roomId}`);
    await expect(memberPage).toHaveURL(new RegExp(`/rooms/${roomId}$`), { timeout: 20_000 });

    await adminPage.getByRole("button", { name: /Yenile/i }).first().click();
    const refreshedVeliRow = presenceSection
      .locator('[data-testid^="admin-live-presence-row-"]')
      .filter({ hasText: /[uü]ye\s*veli|veli/i })
      .first();
    await expect(refreshedVeliRow).toBeVisible({ timeout: 25_000 });

    const banResponsePromise = adminPage.waitForResponse(
      (response) => response.url().includes(`/api/rooms/${roomId}/moderation`) && response.request().method() === "POST",
      { timeout: 20_000 },
    );
    await refreshedVeliRow.getByRole("button", { name: /Oda Ban[ıi]/i }).first().click();
    expect((await banResponsePromise).ok()).toBeTruthy();
    await expect(memberPage.getByText(/Bu odaya giri[sş]iniz engellenmi[sş]tir\./i).first()).toBeVisible({ timeout: 25_000 });
  } finally {
    if (!streamerPage.isClosed()) {
      const canStop = await stopButton.isVisible().catch(() => false);
      if (canStop) {
        await stopButton.click().catch(() => {});
      }
    }

    await normalizeTestFixtures(request).catch(() => {});
    await adminContext.close().catch(() => {});
    await memberContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
