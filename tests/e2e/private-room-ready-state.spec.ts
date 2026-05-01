import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";
import { ensureStreamerLive } from "./helpers/studio";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

test("private room ready state syncs in realtime", async ({ browser, request }, testInfo) => {
  test.setTimeout(420_000);
  await normalizeTestFixtures(request);
  await request
    .post("/api/private-sessions/00000000-0000-0000-0000-000000000000/ready", {
      data: { ready: true },
      failOnStatusCode: false,
    })
    .catch(() => {});

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();

  let sessionStarted = false;

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
    const roomId = (await ensureStreamerLive(streamerPage, request, { waitRoomTimeoutMs: 90_000 })).id;

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
    await memberPage.getByTestId("private-room-request-button").click();
    await expect(memberPage.getByTestId("private-request-feedback")).toContainText(/iletildi|bekleyen/i, { timeout: 20_000 });

    const acceptButton = streamerPage.getByTestId("accept-private-request-button").first();
    await expect(acceptButton).toBeVisible({ timeout: 25_000 });
    await acceptButton.click();

    await expect(memberPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });
    await expect(streamerPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });
    sessionStarted = true;

    await expect(memberPage.getByTestId("private-session-local-ready")).toBeVisible({ timeout: 30_000 });
    await expect(streamerPage.getByTestId("private-session-remote-ready")).toContainText(/henüz hazır değil/i, { timeout: 30_000 });

    await memberPage.getByTestId("private-media-ready-toggle").click();
    await expect(streamerPage.getByTestId("private-session-remote-ready")).toContainText(/karşı taraf hazır/i, { timeout: 30_000 });

    await streamerPage.getByTestId("private-media-ready-toggle").click();
    await expect(memberPage.getByTestId("private-session-remote-ready")).toContainText(/karşı taraf hazır/i, { timeout: 30_000 });

    await expect(memberPage.getByTestId("private-session-both-ready")).toBeVisible({ timeout: 30_000 });
    await expect(streamerPage.getByTestId("private-session-both-ready")).toBeVisible({ timeout: 30_000 });
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
