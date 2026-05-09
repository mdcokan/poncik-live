import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";
import { ensureStreamerLive } from "./helpers/studio";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const OTHER_VIEWER_EMAIL = "admin@test.com";
const PASSWORD = "123123";

test("private room uses same-live compact mode", async ({ browser, request }, testInfo) => {
  test.setTimeout(420_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const otherViewerContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();
  const otherViewerPage = await otherViewerContext.newPage();

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

    await loginWithStabilizedAuth(
      otherViewerPage,
      {
        role: "member",
        loginPath: "/login",
        email: OTHER_VIEWER_EMAIL,
        password: PASSWORD,
        successUrl: /\/admin(?:\/|$)/,
        targetUrl: `/rooms/${roomId}`,
        successIndicator: otherViewerPage.locator("body"),
      },
      testInfo,
    );
    await otherViewerPage.goto(`/rooms/${roomId}`);

    await expect(streamerPage.getByTestId("studio-private-request-accept-button").first()).toBeVisible({ timeout: 30_000 });
    await streamerPage.getByTestId("studio-private-request-accept-button").first().click();

    await expect(streamerPage.getByTestId("studio-private-inline-bar")).toBeVisible({ timeout: 30_000 });
    await expect(memberPage.getByTestId("viewer-private-inline-bar")).toBeVisible({ timeout: 30_000 });
    await expect(streamerPage.getByTestId("private-session-control-bar")).toBeVisible({ timeout: 30_000 });
    await expect(memberPage.getByTestId("private-session-control-bar")).toBeVisible({ timeout: 30_000 });
    await expect(memberPage.getByTestId("private-session-open-camera")).toBeVisible({ timeout: 30_000 });

    await expect(streamerPage.getByText(/özel oda adımları/i)).toHaveCount(0);
    await expect(memberPage.getByText(/özel oda adımları/i)).toHaveCount(0);
    await expect(memberPage.getByText(/hazırım/i)).toHaveCount(0);

    await expect(otherViewerPage.getByTestId("room-private-busy-notice")).toBeVisible({ timeout: 30_000 });
    await expect(otherViewerPage).toHaveURL(/\/member(?:\/|$)/, { timeout: 45_000 });

    await streamerPage.getByTestId("private-session-end-button").first().click();
    await expect(streamerPage.getByTestId("private-session-panel")).toHaveCount(0, { timeout: 30_000 });
    await expect(memberPage.getByTestId("private-session-panel")).toHaveCount(0, { timeout: 30_000 });
  } finally {
    if (!streamerPage.isClosed()) {
      const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i }).first();
      if (await stopButton.isVisible().catch(() => false)) {
        await stopButton.click().catch(() => {});
      }
    }
    await normalizeTestFixtures(request).catch(() => {});
    await otherViewerContext.close().catch(() => {});
    await memberContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
