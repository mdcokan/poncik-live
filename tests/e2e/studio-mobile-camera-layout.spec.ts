import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const STREAMER_EMAIL = "eda@test.com";
const PASSWORD = "123123";

test("studio mobile camera layout keeps stage, start, and live controls compact", async ({ browser, request }, testInfo) => {
  test.setTimeout(240_000);
  await normalizeTestFixtures(request);

  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();

  try {
    await loginWithStabilizedAuth(
      page,
      {
        role: "streamer",
        loginPath: "/streamer-login",
        email: STREAMER_EMAIL,
        password: PASSWORD,
        successUrl: /\/(streamer|studio)(?:\/|$)/,
        targetUrl: "/studio",
        successIndicator: page.locator("main"),
      },
      testInfo,
    );

    await page.goto("/studio");
    await expect(page.getByTestId("studio-mobile-shell")).toBeVisible();
    await expect(page.getByTestId("studio-live-stage")).toBeVisible();
    await expect(page.getByText("Kamera önizleme")).toBeVisible();
    await expect(page.getByTestId("studio-start-live-button")).toBeVisible();

    const overflowBeforeLive = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > root.clientWidth + 1;
    });
    expect(overflowBeforeLive).toBe(false);

    const startButton = page.getByRole("button", { name: /ba[sş]la/i }).first();
    await expect(startButton).toBeEnabled({ timeout: 45_000 });
    await startButton.click();

    await expect(page.getByTestId("studio-live-stage")).toBeVisible();
    await expect(page.getByText(/canl[ıi]/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("studio-right-panel")).toHaveCount(0);
    await expect(page.getByTestId("studio-stop-live-button").first()).toBeVisible({ timeout: 20_000 });

    const stopButton = page.getByTestId("studio-stop-live-button").first();
    await stopButton.click();
    await expect(page.getByTestId("studio-start-live-button")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Kamera önizleme")).toBeVisible();
  } finally {
    if (!page.isClosed()) {
      const stopButton = page.getByTestId("studio-stop-live-button").first();
      if (await stopButton.isVisible().catch(() => false)) {
        await stopButton.click().catch(() => {});
      }
    }
    await normalizeTestFixtures(request).catch(() => {});
    await context.close().catch(() => {});
  }
});
