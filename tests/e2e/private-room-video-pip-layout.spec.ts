import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";
import { ensureStreamerLive } from "./helpers/studio";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

async function mockMemberCamera(page: import("@playwright/test").Page) {
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

test("private room stage pip keeps aspect ratio and compact controls", async ({ browser, request }, testInfo) => {
  test.setTimeout(420_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  await memberContext.grantPermissions(["camera", "microphone"]);
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();
  await mockMemberCamera(memberPage);

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
    const roomId = (await ensureStreamerLive(streamerPage, request, { waitRoomTimeoutMs: 60_000 })).id;

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
    await expect(memberPage.getByTestId("private-room-request-button")).toBeEnabled({ timeout: 60_000 });
    await memberPage.getByTestId("private-room-request-button").click();

    await expect(streamerPage.getByTestId("studio-private-request-accept-button").first()).toBeVisible({ timeout: 30_000 });
    await streamerPage.getByTestId("studio-private-request-accept-button").first().click();

    await expect(memberPage.getByTestId("viewer-private-inline-bar")).toBeVisible({ timeout: 30_000 });
    await expect(memberPage.getByTestId("private-session-control-bar")).toBeVisible({ timeout: 30_000 });
    await expect(memberPage.getByTestId("private-media-prep")).toHaveCount(0);
    await expect(memberPage.getByTestId("private-session-local-preview")).toHaveCount(0);

    await memberPage.getByTestId("private-session-open-camera").click();
    const pip = memberPage.getByTestId("private-local-pip");
    await expect(pip).toBeVisible({ timeout: 30_000 });
    await expect(memberPage.getByTestId("private-local-pip-video")).toBeVisible();

    const pipBox = await pip.boundingBox();
    expect(pipBox).not.toBeNull();
    if (pipBox) {
      const ratio = pipBox.width / pipBox.height;
      expect(ratio).toBeGreaterThan(1.6);
      expect(ratio).toBeLessThan(1.85);
    }

    await memberPage.getByTestId("private-local-pip-toggle-size").click();
    const expandedBox = await pip.boundingBox();
    expect(expandedBox).not.toBeNull();
    if (pipBox && expandedBox) {
      expect(expandedBox.width).toBeGreaterThan(pipBox.width);
    }

    await expect(memberPage.getByTestId("room-live-stage")).toBeVisible();
    await expect(memberPage.getByTestId("room-right-panel")).toBeVisible();

    const overflow = await memberPage.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > root.clientWidth + 1;
    });
    expect(overflow).toBe(false);
  } finally {
    if (!streamerPage.isClosed()) {
      const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i }).first();
      if (await stopButton.isVisible().catch(() => false)) {
        await stopButton.click().catch(() => {});
      }
    }
    await normalizeTestFixtures(request).catch(() => {});
    await memberContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
