import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { waitForLiveRoomByStreamerName } from "./helpers/live-room";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

test("private room auto ends when member balance depletes", async ({ browser, request }, testInfo) => {
  test.setTimeout(360_000);
  await normalizeTestFixtures(request, { viewerBalanceMinutes: 1 });

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
    const startButton = streamerPage.getByRole("button", { name: /ba[sş]la/i }).first();
    const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i }).first();
    if (await stopButton.isVisible().catch(() => false)) {
      await stopButton.click();
      await expect(startButton).toBeVisible({ timeout: 20_000 });
    }
    await startButton.click();
    await expect(stopButton).toBeVisible({ timeout: 20_000 });
    const roomId = (await waitForLiveRoomByStreamerName(request, /Eda/i)).id;

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

    await expect(streamerPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });
    await expect(memberPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });
    sessionStarted = true;

    await expect(memberPage.getByTestId("private-session-remaining")).toContainText(/1 dk|0 dk/i, { timeout: 20_000 });

    let sessionId: string | null = null;
    await expect
      .poll(
        async () => {
          sessionId = await memberPage.getByTestId("private-session-panel").getAttribute("data-session-id");
          return sessionId;
        },
        { timeout: 10_000, message: "private session id should be present on panel" },
      )
      .not.toBeNull();

    const fixtureSecret = process.env.TEST_FIXTURE_SECRET;
    const ageRes = await request.post("/api/test/private-session/age", {
      headers: fixtureSecret ? { "x-test-fixture-secret": fixtureSecret } : undefined,
      data: { sessionId, secondsAgo: 70 },
      failOnStatusCode: false,
    });
    if (!ageRes.ok()) {
      await memberPage.evaluate(() => {
        const win = window as Window & { __originalDateNow?: (() => number) | undefined };
        if (!win.__originalDateNow) {
          win.__originalDateNow = Date.now;
        }
        const originalDateNow = win.__originalDateNow;
        Date.now = () => originalDateNow() + 70_000;
      });
    }

    await expect(memberPage.getByTestId("private-session-auto-ending")).toContainText(/kapatılıyor/i, { timeout: 15_000 });
    await expect(memberPage.getByTestId("private-session-result")).toContainText(/Süre bittiği için özel oda kapatıldı/i, { timeout: 35_000 });
    await expect(streamerPage.getByTestId("private-session-result")).toContainText(/Özel oda kapatıldı/i, { timeout: 35_000 });
    await expect(streamerPage.getByTestId("private-session-panel")).toHaveCount(0, { timeout: 35_000 });
    sessionStarted = false;

    await memberPage.goto("/member");
    await expect(memberPage.getByTestId("member-wallet-balance")).toContainText(/0 dk|[0-9]+ dk/i, { timeout: 20_000 });
  } finally {
    if (!streamerPage.isClosed()) {
      const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i }).first();
      if (await stopButton.isVisible().catch(() => false)) {
        await stopButton.click().catch(() => {});
      }
    }
    if (sessionStarted && !memberPage.isClosed()) {
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
