import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";
import { ensureStreamerLive } from "./helpers/studio";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

test("mobile live room exposes menu, sheets, and live navigation without breaking stage", async ({ browser, request }, testInfo) => {
  test.setTimeout(420_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const viewerContext = await browser.newContext({ viewport: { width: 430, height: 932 } });
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

    await expect(viewerPage.getByTestId("room-mobile-shell")).toBeVisible();
    await expect(viewerPage.getByTestId("room-live-stage")).toBeVisible();
    await expect(viewerPage.getByTestId("mobile-live-menu-button")).toBeVisible();

    await viewerPage.getByTestId("mobile-live-menu-button").click();
    await expect(viewerPage.getByTestId("mobile-live-menu-sheet")).toBeVisible();
    await viewerPage.getByTestId("mobile-live-menu-sheet-close-button").click();
    await expect(viewerPage.getByTestId("mobile-live-menu-sheet")).toHaveCount(0);

    await viewerPage.getByTestId("room-mobile-chat-sheet-button").click();
    await expect(viewerPage.getByTestId("room-mobile-chat-sheet")).toBeVisible();
    await viewerPage.getByTestId("room-mobile-chat-sheet-close-button").click();
    await expect(viewerPage.getByTestId("room-mobile-chat-sheet")).toHaveCount(0);

    await viewerPage.getByTestId("room-mobile-gift-sheet-button").click();
    await expect(viewerPage.getByTestId("room-mobile-gift-sheet")).toBeVisible();
    await viewerPage.getByTestId("room-mobile-gift-sheet-close-button").click();
    await expect(viewerPage.getByTestId("room-mobile-gift-sheet")).toHaveCount(0);

    await viewerPage.getByTestId("room-mobile-participants-sheet-button").click();
    await expect(viewerPage.getByTestId("room-mobile-participants-sheet")).toBeVisible();
    await viewerPage.getByTestId("room-mobile-participants-sheet-close-button").click();
    await expect(viewerPage.getByTestId("room-mobile-participants-sheet")).toHaveCount(0);

    const prevButton = viewerPage.getByTestId("room-prev-live-button");
    const nextButton = viewerPage.getByTestId("room-next-live-button");
    const prevVisible = await prevButton.isVisible().catch(() => false);
    const nextVisible = await nextButton.isVisible().catch(() => false);
    if (prevVisible || nextVisible) {
      await expect(prevButton).toBeDisabled();
      await expect(nextButton).toBeDisabled();
    }

    const overflow = await viewerPage.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > root.clientWidth + 1;
    });
    expect(overflow).toBe(false);
    await expect(viewerPage.getByTestId("room-live-stage")).toBeVisible();
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
