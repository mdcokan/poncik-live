import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const STREAMER_EMAIL = "eda@test.com";
const PASSWORD = "123123";

test("studio mobile live exposes menu, chat input, and stop control without breaking stage", async ({ browser, request }, testInfo) => {
  test.setTimeout(420_000);
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
    await expect(page.getByTestId("studio-start-live-button")).toBeVisible();

    const startButton = page.getByRole("button", { name: /ba[sş]la/i }).first();
    await expect(startButton).toBeEnabled({ timeout: 45_000 });
    await startButton.click();

    await expect(page.getByTestId("studio-live-stage")).toBeVisible();
    await expect(page.getByTestId("mobile-live-menu-button")).toBeVisible();
    await expect(page.getByTestId("studio-room-chat-input")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("studio-stop-live-button").first()).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("mobile-live-menu-button").click();
    await expect(page.getByTestId("mobile-live-menu-sheet")).toBeVisible();
    await page.getByTestId("mobile-live-menu-sheet-close-button").click();
    await expect(page.getByTestId("mobile-live-menu-sheet")).toHaveCount(0);

    const messageBody = `studio-mobile-${Date.now()}`;
    await page.getByTestId("studio-room-chat-input").fill(messageBody);
    await page.getByTestId("studio-room-chat-send-button").click();

    await page.getByTestId("studio-mobile-chat-sheet-button").click();
    await expect(page.getByTestId("studio-mobile-chat-sheet")).toBeVisible();
    await expect(page.getByTestId("studio-room-chat-message-list")).toContainText(messageBody, { timeout: 30_000 });
    await page.getByTestId("studio-mobile-chat-sheet-close-button").click();
    await expect(page.getByTestId("studio-mobile-chat-sheet")).toHaveCount(0);

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > root.clientWidth + 1;
    });
    expect(overflow).toBe(false);
    await expect(page.getByTestId("studio-live-stage")).toBeVisible();
    await expect(page.getByTestId("studio-stop-live-button").first()).toBeVisible();
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
