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

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(2);
}

test("viewer mobile live room — stage preview, compact private bar, PiP positioning", async ({ browser, request }, testInfo) => {
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

    // Send a few chat messages so the stage preview has content.
    // Use Enter to avoid Next.js dev tools indicator intercepting clicks at the
    // bottom-right corner of the viewport.
    const chatInput = viewerPage.getByTestId("room-chat-input");
    await expect(chatInput).toBeEnabled({ timeout: 30_000 });
    await chatInput.fill("polish-1");
    await chatInput.press("Enter");
    await chatInput.fill("polish-2");
    await chatInput.press("Enter");
    await chatInput.fill("polish-3 long".repeat(20));
    await chatInput.press("Enter");
    await chatInput.fill("polish-4");
    await chatInput.press("Enter");

    const stagePreview = viewerPage.getByTestId("mobile-stage-chat-preview");
    await expect(stagePreview).toBeVisible({ timeout: 30_000 });
    const previewItems = viewerPage.getByTestId("mobile-stage-chat-preview-item");
    await expect.poll(async () => previewItems.count(), { timeout: 20_000 }).toBeGreaterThan(0);
    const count = await previewItems.count();
    expect(count).toBeLessThanOrEqual(3);

    const stageBox = await viewerPage.getByTestId("room-live-stage").boundingBox();
    const previewBox = await stagePreview.boundingBox();
    expect(stageBox).not.toBeNull();
    expect(previewBox).not.toBeNull();
    if (stageBox && previewBox) {
      // Preview lives inside stage horizontally and vertically.
      expect(previewBox.x).toBeGreaterThanOrEqual(stageBox.x - 1);
      expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1);
      expect(previewBox.y + previewBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
    }

    // Open & close chat sheet → stage still visible.
    await viewerPage.getByTestId("room-mobile-chat-sheet-button").click();
    await expect(viewerPage.getByTestId("room-mobile-chat-sheet")).toBeVisible();
    await viewerPage.getByTestId("room-mobile-chat-sheet-close-button").click();
    await expect(viewerPage.getByTestId("room-mobile-chat-sheet")).toHaveCount(0);
    await expect(viewerPage.getByTestId("room-live-stage")).toBeVisible();

    await expectNoHorizontalOverflow(viewerPage);

    // Private session: compact bar + PiP within stage.
    await expect(viewerPage.getByTestId("private-room-request-button")).toBeEnabled({ timeout: 60_000 });
    await viewerPage.getByTestId("private-room-request-button").click();
    await expect(streamerPage.getByTestId("studio-private-request-accept-button").first()).toBeVisible({ timeout: 30_000 });
    await streamerPage.getByTestId("studio-private-request-accept-button").first().click();

    await expect(viewerPage.getByTestId("viewer-private-inline-bar")).toBeVisible({ timeout: 30_000 });
    const compactBar = viewerPage.getByTestId("private-session-control-bar");
    await expect(compactBar).toBeVisible();
    // Compact summary contains the single-line status text.
    await expect(viewerPage.getByTestId("private-session-compact-summary")).toContainText(/Özel/i);
    await expect(viewerPage.getByTestId("private-session-rate-badge")).toContainText(/dk\/dk/i);
    // Required controls present.
    await expect(viewerPage.getByTestId("private-session-open-camera")).toBeVisible();
    await expect(viewerPage.getByTestId("private-session-mic-toggle")).toBeVisible();
    await expect(viewerPage.getByTestId("private-webrtc-start-button")).toBeVisible();
    await expect(viewerPage.getByTestId("private-session-end-button")).toBeVisible();
    // Visible UI does NOT include the verbose desktop strings.
    const compactBarText = (await compactBar.innerText().catch(() => "")) ?? "";
    expect(compactBarText).not.toMatch(/Özel görüşme/i);
    expect(compactBarText).not.toMatch(/Geçen süre/i);
    expect(compactBarText).not.toMatch(/WebRTC/i);

    // PiP should remain inside the stage after opening it.
    await viewerPage.getByTestId("private-session-open-camera").click();
    const pip = viewerPage.getByTestId("private-local-pip");
    await expect(pip).toBeVisible({ timeout: 30_000 });
    const pipBox = await pip.boundingBox();
    const stageBox2 = await viewerPage.getByTestId("room-live-stage").boundingBox();
    expect(pipBox).not.toBeNull();
    expect(stageBox2).not.toBeNull();
    if (pipBox && stageBox2) {
      expect(pipBox.x).toBeGreaterThanOrEqual(stageBox2.x - 1);
      expect(pipBox.x + pipBox.width).toBeLessThanOrEqual(stageBox2.x + stageBox2.width + 1);
      expect(pipBox.y + pipBox.height).toBeLessThanOrEqual(stageBox2.y + stageBox2.height + 1);
      // Collapsed PiP stays compact.
      expect(pipBox.width).toBeLessThanOrEqual(200);
    }

    // PiP close button only hides preview; camera toggle stays inside compact bar.
    await viewerPage.getByTestId("private-local-pip-close").click();
    await expect(viewerPage.getByTestId("private-session-open-camera")).toBeVisible();

    await expectNoHorizontalOverflow(viewerPage);
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
