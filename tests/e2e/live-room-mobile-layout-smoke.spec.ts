import { expect, test, type Page } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";
import { ensureStreamerLive } from "./helpers/studio";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

async function mockMemberCamera(page: Page) {
  await page.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices) {
      return;
    }
    mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = "#7c3aed";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      return canvas.captureStream(25);
    };
  });
}

test("mobile live room shell keeps stage, rail, and sheets compact", async ({ browser, request }, testInfo) => {
  test.setTimeout(420_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const viewerContext = await browser.newContext({ viewport: { width: 430, height: 932 } });
  await viewerContext.grantPermissions(["camera", "microphone"]);
  const streamerPage = await streamerContext.newPage();
  const viewerPage = await viewerContext.newPage();
  await mockMemberCamera(viewerPage);

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
    await expect(viewerPage.getByTestId("room-mobile-action-rail")).toBeVisible();
    await expect(viewerPage.getByTestId("room-chat-input")).toBeVisible();
    await expect(viewerPage.getByTestId("room-right-panel")).toBeHidden();

    const stageBox = await viewerPage.getByTestId("room-live-stage").boundingBox();
    expect(stageBox).not.toBeNull();
    if (stageBox) {
      expect(stageBox.width).toBeLessThanOrEqual(430);
    }

    const overflow = await viewerPage.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > root.clientWidth + 1;
    });
    expect(overflow).toBe(false);

    await viewerPage.getByTestId("room-mobile-participants-sheet-button").click();
    await expect(viewerPage.getByTestId("room-mobile-participants-sheet")).toBeVisible();
    await viewerPage.getByTestId("room-mobile-participants-sheet-close-button").click();
    await expect(viewerPage.getByTestId("room-mobile-participants-sheet")).toHaveCount(0);

    await viewerPage.getByTestId("room-mobile-gift-sheet-button").click();
    await expect(viewerPage.getByTestId("room-mobile-gift-sheet")).toBeVisible();
    await viewerPage.getByTestId("room-mobile-gift-sheet-close-button").click();
    await expect(viewerPage.getByTestId("room-mobile-gift-sheet")).toHaveCount(0);

    await expect(viewerPage.getByTestId("private-room-request-button")).toBeEnabled({ timeout: 60_000 });
    await viewerPage.getByTestId("private-room-request-button").click();
    await expect(streamerPage.getByTestId("studio-private-request-accept-button").first()).toBeVisible({ timeout: 30_000 });
    await streamerPage.getByTestId("studio-private-request-accept-button").first().click();

    await expect(viewerPage.getByTestId("viewer-private-inline-bar")).toBeVisible({ timeout: 30_000 });
    await expect(viewerPage.getByTestId("viewer-private-pill")).toBeVisible();
    await expect(viewerPage.getByTestId("private-media-prep")).toHaveCount(0);
    await expect(viewerPage.getByText(/özel oda adımları/i)).toHaveCount(0);

    await viewerPage.getByTestId("private-session-open-camera").click();
    const pip = viewerPage.getByTestId("private-local-pip");
    await expect(pip).toBeVisible({ timeout: 30_000 });
    const stage = viewerPage.getByTestId("room-live-stage");
    const pipBox = await pip.boundingBox();
    const stageBounds = await stage.boundingBox();
    expect(pipBox).not.toBeNull();
    expect(stageBounds).not.toBeNull();
    if (pipBox && stageBounds) {
      expect(pipBox.x + pipBox.width).toBeLessThanOrEqual(stageBounds.x + stageBounds.width + 1);
      expect(pipBox.y + pipBox.height).toBeLessThanOrEqual(stageBounds.y + stageBounds.height + 1);
    }
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
