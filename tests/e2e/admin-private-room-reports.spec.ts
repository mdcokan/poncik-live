import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { gotoDomWithRetry } from "./helpers/navigation";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";
import { cleanupPrivateRoomFlow, createPrivateSessionForEdaAndVeli } from "./helpers/private-room-flow";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const ADMIN_EMAIL = "admin@test.com";
const PASSWORD = "123123";

test("admin özel oda raporları sayfası ve özet", async ({ browser, request }, testInfo) => {
  test.setTimeout(420_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();
  const adminPage = await adminContext.newPage();

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

    await createPrivateSessionForEdaAndVeli({
      streamerPage,
      memberPage,
      request,
      testInfo,
      skipNormalizeFixtures: true,
      waitRoomTimeoutMs: 60_000,
    });

    await memberPage.waitForTimeout(2000);
    await memberPage.getByTestId("private-session-end-button").click();
    await expect(memberPage.getByTestId("private-session-result")).toContainText(/kapat[ıi]ld[ıi]/i, {
      timeout: 30_000,
    });

    await loginWithStabilizedAuth(
      adminPage,
      {
        role: "member",
        loginPath: "/login",
        email: ADMIN_EMAIL,
        password: PASSWORD,
        successUrl: /\/admin(?:\/|$)/,
        targetUrl: "/admin/users",
        successIndicator: adminPage.getByRole("heading", { name: /kullan[ıi]c[ıi] y[öo]netimi/i }).first(),
      },
      testInfo,
    );

    await gotoDomWithRetry(adminPage, "/admin/private-rooms");
    await expect(adminPage.getByRole("heading", { name: /Özel Oda Raporları/i }).first()).toBeVisible({
      timeout: 25_000,
    });

    await expect(adminPage.getByTestId("admin-private-room-reports-page")).toBeVisible();
    await expect(adminPage.getByTestId("admin-private-room-range-select")).toBeVisible();
    await expect(adminPage.getByTestId("admin-private-room-status-select")).toBeVisible();
    await expect(adminPage.getByTestId("admin-private-room-refresh-button")).toBeVisible();
    await expect(adminPage.getByTestId("admin-private-room-sessions")).toBeVisible();

    const summary = adminPage.getByTestId("admin-private-room-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(/Toplam oturum/i);
    await expect(summary).toContainText(/Harcanan toplam dakika/i);
    await expect(summary).toContainText(/Yayıncı kazancı/i);

    const sessionRow = adminPage
      .getByTestId("admin-private-room-session-row")
      .filter({ hasText: /Eda/i })
      .filter({ hasText: /Veli/i })
      .first();
    await expect(sessionRow).toBeVisible({ timeout: 25_000 });

    const topSection = adminPage.getByTestId("admin-private-room-top-streamers");
    await expect(topSection).toContainText(/Eda/i, { timeout: 15_000 });

    await adminPage.getByTestId("admin-private-room-status-select").selectOption("ended");
    await adminPage.getByTestId("admin-private-room-refresh-button").click();
    await expect(sessionRow).toBeVisible({ timeout: 25_000 });

    const sidebarPrivateLink = adminPage.locator('aside a[href="/admin/private-rooms"]').first();
    await expect(sidebarPrivateLink).toBeVisible();
    await expect(sidebarPrivateLink).toHaveClass(/bg-pink-400/);
  } finally {
    if (!streamerPage.isClosed()) {
      const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i }).first();
      if (await stopButton.isVisible().catch(() => false)) {
        await stopButton.click().catch(() => {});
      }
    }
    if (!memberPage.isClosed()) {
      const endBtn = memberPage.getByTestId("private-session-end-button");
      if (await endBtn.isVisible().catch(() => false)) {
        await endBtn.click().catch(() => {});
      }
    }
    await cleanupPrivateRoomFlow({ request });
    await adminContext.close().catch(() => {});
    await memberContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
