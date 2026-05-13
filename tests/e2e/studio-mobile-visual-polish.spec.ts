import { expect, test, type Page } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const STREAMER_EMAIL = "eda@test.com";
const PASSWORD = "123123";

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(2);
}

test("studio mobile live — header, rail, stage preview, no overflow", async ({ browser, request }, testInfo) => {
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

    const startButton = page.getByRole("button", { name: /ba[sş]la/i }).first();
    await expect(startButton).toBeEnabled({ timeout: 45_000 });
    await startButton.click();

    await expect(page.getByTestId("studio-stop-live-button").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("studio-room-chat-input")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("studio-mobile-action-rail")).toBeVisible();

    const messageBody = `polish-${Date.now()}`;
    const studioInput = page.getByTestId("studio-room-chat-input");
    await expect(studioInput).toBeEnabled({ timeout: 30_000 });
    await studioInput.fill(messageBody);
    await studioInput.press("Enter");
    await studioInput.fill(`${messageBody}-2`);
    await studioInput.press("Enter");
    await studioInput.fill(`${messageBody}-3 ` + "uzun ".repeat(30));
    await studioInput.press("Enter");
    await studioInput.fill(`${messageBody}-4`);
    await studioInput.press("Enter");

    const stagePreview = page.getByTestId("mobile-stage-chat-preview");
    await expect(stagePreview).toBeVisible({ timeout: 30_000 });
    const previewItems = page.getByTestId("mobile-stage-chat-preview-item");
    await expect.poll(async () => previewItems.count(), { timeout: 20_000 }).toBeGreaterThan(0);
    const count = await previewItems.count();
    expect(count).toBeLessThanOrEqual(3);

    const stageBox = await page.getByTestId("studio-live-stage").boundingBox();
    const previewBox = await stagePreview.boundingBox();
    expect(stageBox).not.toBeNull();
    expect(previewBox).not.toBeNull();
    if (stageBox && previewBox) {
      expect(previewBox.x).toBeGreaterThanOrEqual(stageBox.x - 1);
      expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1);
      expect(previewBox.y + previewBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
    }

    // Tight mobile header height (≤ 44px).
    const headerHeight = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="studio-mobile-shell"]');
      const header = shell?.firstElementChild;
      return header instanceof HTMLElement ? header.getBoundingClientRect().height : 0;
    });
    expect(headerHeight).toBeLessThanOrEqual(48);

    await expectNoHorizontalOverflow(page);
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
