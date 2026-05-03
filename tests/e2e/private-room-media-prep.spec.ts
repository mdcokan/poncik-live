import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { attachPrivateRoomDiagnostics } from "./helpers/private-room-diagnostics";
import { createPrivateSessionForEdaAndVeli } from "./helpers/private-room-flow";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

test("private room media prep appears on viewer and studio", async ({ browser, request }, testInfo) => {
  test.setTimeout(360_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();

  let sessionStarted = false;
  let roomId = "";

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

    const created = await createPrivateSessionForEdaAndVeli({
      streamerPage,
      memberPage,
      request,
      testInfo,
      skipNormalizeFixtures: true,
      waitRoomTimeoutMs: 60_000,
    });
    roomId = created.roomId;
    sessionStarted = true;

    const memberPrep = memberPage.getByTestId("private-media-prep");
    await expect(memberPrep).toBeVisible({ timeout: 30_000 });
    await expect(memberPrep.getByTestId("private-media-placeholder")).toBeVisible();
    await expect(memberPrep.getByTestId("private-media-video")).toBeAttached();

    const readyToggle = memberPage.getByTestId("private-media-ready-toggle");
    await expect(readyToggle).toBeVisible();
    await readyToggle.click();
    await expect(memberPage.getByText(/Ben hazırım/i).first()).toBeVisible();

    const requestButton = memberPage.getByTestId("private-media-request-button");
    await expect(requestButton).toBeEnabled();
    await requestButton.click();

    await expect(streamerPage.getByTestId("private-media-prep")).toBeVisible({ timeout: 30_000 });
  } catch (e) {
    await attachPrivateRoomDiagnostics(testInfo, {
      memberPage,
      streamerPage,
      request,
      roomId: roomId || undefined,
    }).catch(() => {});
    throw e;
  } finally {
    if (sessionStarted && !memberPage.isClosed()) {
      const endButton = memberPage.getByTestId("private-session-end-button");
      if (await endButton.isVisible().catch(() => false)) {
        await endButton.click().catch(() => {});
      }
    }
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
