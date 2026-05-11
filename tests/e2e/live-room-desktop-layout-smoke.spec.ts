import { expect, test, type Page } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";
import { ensureStreamerLive } from "./helpers/studio";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

async function expectDesktopLayoutHealthy(page: Page, selectors: {
  stage: string;
  rightPanel: string;
  toolbar: string;
}) {
  await expect(page.getByTestId(selectors.stage)).toBeVisible();
  await expect(page.getByTestId(selectors.rightPanel)).toBeVisible();
  await expect(page.getByTestId("room-chat-input")).toBeVisible();
  await expect(page.getByTestId(selectors.toolbar)).toBeVisible();

  const metrics = await page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    return {
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      htmlClientHeight: html.clientHeight,
      htmlScrollHeight: html.scrollHeight,
    };
  });

  expect(metrics.bodyScrollWidth - metrics.bodyClientWidth).toBeLessThanOrEqual(1);
  expect(metrics.bodyScrollHeight - metrics.bodyClientHeight).toBeLessThanOrEqual(220);
  expect(metrics.htmlScrollHeight - metrics.htmlClientHeight).toBeLessThanOrEqual(220);
}

test("desktop live room layout stays single-screen and compact", async ({ browser, request }, testInfo) => {
  test.setTimeout(420_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const viewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const streamerPage = await streamerContext.newPage();
  const viewerPage = await viewerContext.newPage();

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
        successIndicator: streamerPage.locator("main"),
      },
      testInfo,
    );
    const roomId = (await ensureStreamerLive(streamerPage, request, { waitRoomTimeoutMs: 60_000 })).id;

    await loginWithStabilizedAuth(
      viewerPage,
      {
        role: "member",
        loginPath: "/login",
        email: MEMBER_EMAIL,
        password: PASSWORD,
        successUrl: /\/member(?:\/|$)/,
        targetUrl: "/member",
        successIndicator: viewerPage.locator("main"),
      },
      testInfo,
    );
    await viewerPage.goto(`/rooms/${roomId}`);

    await expectDesktopLayoutHealthy(streamerPage, {
      stage: "studio-live-stage",
      rightPanel: "studio-right-panel",
      toolbar: "studio-primary-action-toolbar",
    });
    await expectDesktopLayoutHealthy(viewerPage, {
      stage: "room-live-stage",
      rightPanel: "room-right-panel",
      toolbar: "room-primary-action-toolbar",
    });

    await expect(viewerPage.getByTestId("private-room-request-button")).toBeEnabled({ timeout: 60_000 });
    await viewerPage.getByTestId("private-room-request-button").click();
    await expect(streamerPage.getByTestId("studio-private-request-accept-button").first()).toBeVisible({ timeout: 30_000 });
    await streamerPage.getByTestId("studio-private-request-accept-button").first().click();

    await expect(streamerPage.getByTestId("studio-private-inline-bar")).toBeVisible({ timeout: 30_000 });
    await expect(viewerPage.getByTestId("viewer-private-inline-bar")).toBeVisible({ timeout: 30_000 });
    await expect(streamerPage.getByTestId("private-session-control-bar")).toBeVisible({ timeout: 30_000 });
    await expect(viewerPage.getByTestId("private-session-control-bar")).toBeVisible({ timeout: 30_000 });
    await expect(streamerPage.getByTestId("private-media-prep")).toHaveCount(0);
    await expect(viewerPage.getByTestId("private-media-prep")).toHaveCount(0);
  } finally {
    if (!streamerPage.isClosed()) {
      const stopButton = streamerPage.getByTestId("studio-stop-live-button").first();
      if (await stopButton.isVisible().catch(() => false)) {
        await stopButton.click().catch(() => {});
      }
    }
    await normalizeTestFixtures(request).catch(() => {});
    await viewerContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
