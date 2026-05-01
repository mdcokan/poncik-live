import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";
import { ensureStreamerLive } from "./helpers/studio";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

test.describe.configure({ mode: "serial" });

test("private room signaling relays ready_ping, offer, and answer", async ({ browser, request }, testInfo) => {
  test.setTimeout(420_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();

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
    await streamerPage.goto("/studio");
    roomId = (await ensureStreamerLive(streamerPage, request, { waitRoomTimeoutMs: 60_000 })).id;

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
    await memberPage.goto("/member");
    await memberPage.locator(`a[href="/rooms/${roomId}"]`).first().click();
    await expect(memberPage).toHaveURL(new RegExp(`/rooms/${roomId}$`), { timeout: 20_000 });
    await memberPage.getByTestId("private-room-request-button").click();
    await expect(memberPage.getByTestId("private-request-feedback")).toContainText(/iletildi|bekleyen/i, { timeout: 20_000 });

    const acceptButton = streamerPage.getByTestId("accept-private-request-button").first();
    await expect(acceptButton).toBeVisible({ timeout: 25_000 });
    await acceptButton.click();

    await expect(streamerPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });
    await expect(memberPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });
    await expect(streamerPage.getByTestId("private-signaling-panel")).toBeVisible({ timeout: 30_000 });
    await expect(memberPage.getByTestId("private-signaling-panel")).toBeVisible({ timeout: 30_000 });

    await memberPage.getByTestId("private-signal-ready-ping").click();
    await expect(streamerPage.getByTestId("private-signal-last")).toContainText(/ready_ping/i, { timeout: 30_000 });

    await streamerPage.getByTestId("private-signal-offer").click();
    await expect(memberPage.getByTestId("private-signal-last")).toContainText(/offer/i, { timeout: 30_000 });

    await memberPage.getByTestId("private-signal-answer").click();
    await expect(streamerPage.getByTestId("private-signal-last")).toContainText(/answer/i, { timeout: 30_000 });
  } finally {
    if (!streamerPage.isClosed()) {
      const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i }).first();
      if (await stopButton.isVisible().catch(() => false)) {
        await stopButton.click().catch(() => {});
      }
    }
    if (!memberPage.isClosed()) {
      const endBtn = memberPage.getByTestId("private-session-end-button");
      if (await endBtn.isVisible().catch(() => false)) {
        await endBtn.click().catch(() => {});
      }
    }
    await normalizeTestFixtures(request).catch(() => {});
    await memberContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
