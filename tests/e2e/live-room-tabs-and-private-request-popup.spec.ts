import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";
import { waitForLiveRoomByStreamerName } from "./helpers/live-room";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

test("viewer/studio tabs and private request popup flow", async ({ browser, request }, testInfo) => {
  test.setTimeout(300_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const viewerContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const viewerPage = await viewerContext.newPage();
  const startButton = streamerPage.getByRole("button", { name: /ba[sş]la/i }).first();
  const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i }).first();

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
    if (await stopButton.isVisible().catch(() => false)) {
      await stopButton.click();
      await expect(startButton).toBeVisible({ timeout: 20_000 });
    }
    await startButton.click();
    await expect(stopButton).toBeVisible({ timeout: 20_000 });
    const liveRoom = await waitForLiveRoomByStreamerName(request, /Eda/i);

    await loginWithStabilizedAuth(
      viewerPage,
      {
        role: "member",
        loginPath: "/login",
        email: MEMBER_EMAIL,
        password: PASSWORD,
        successUrl: /\/member(?:\/|$)/,
        targetUrl: "/member",
        successIndicator: viewerPage.getByRole("heading", { name: /Online Yayincilar|Online Yayıncılar/i }).first(),
      },
      testInfo,
    );
    await viewerPage.goto(`/rooms/${liveRoom.id}`);
    await expect(viewerPage).toHaveURL(new RegExp(`/rooms/${liveRoom.id}$`), { timeout: 20_000 });

    await expect(viewerPage.getByTestId("room-side-tabs")).toBeVisible();
    await viewerPage.getByTestId("room-tab-chat").click();
    await expect(viewerPage.getByTestId("room-presence-panel")).toHaveCount(0);
    await viewerPage.getByTestId("room-tab-participants").click();
    await expect(viewerPage.getByTestId("room-presence-panel")).toBeVisible();
    await viewerPage.getByTestId("room-tab-gifts").click();
    await expect(viewerPage.getByTestId("viewer-gift-panel")).toBeVisible();

    await expect(streamerPage.getByTestId("studio-side-tabs")).toBeVisible();
    await streamerPage.getByTestId("studio-tab-chat").click();
    await expect(streamerPage.getByTestId("room-presence-panel")).toHaveCount(0);
    await streamerPage.getByTestId("studio-tab-participants").click();
    await expect(streamerPage.getByTestId("mute-user-button").first()).toBeVisible({ timeout: 20_000 });
    await streamerPage.getByTestId("studio-tab-gifts").click();
    await expect(streamerPage.getByTestId("studio-gift-panel")).toBeVisible();

    await viewerPage.getByTestId("private-room-request-button").click();
    await expect(viewerPage.getByTestId("private-request-feedback")).toContainText(/onayı bekleniyor|bekleniyor/i, { timeout: 20_000 });

    await expect(streamerPage.getByTestId("studio-private-request-modal")).toBeVisible({ timeout: 30_000 });
    await expect(streamerPage.getByTestId("studio-private-request-viewer-name")).toContainText(/Veli/i);
    await streamerPage.getByTestId("studio-private-request-accept-button").click();

    await streamerPage.getByTestId("studio-tab-chat").click();
    await expect(viewerPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });
    await expect(streamerPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });
  } finally {
    if (!streamerPage.isClosed() && (await stopButton.isVisible().catch(() => false))) {
      await stopButton.click().catch(() => {});
    }
    await normalizeTestFixtures(request).catch(() => {});
    await viewerContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
