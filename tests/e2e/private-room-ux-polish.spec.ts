import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { cleanupPrivateRoomFlow, createPrivateSessionForEdaAndVeli } from "./helpers/private-room-flow";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

test.describe.configure({ mode: "serial" });

test("private room connection UX polish — steps, guidance, WebRTC labels, summary", async ({ browser, request }, testInfo) => {
  test.setTimeout(420_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();

  let roomId = "";
  let finished = false;

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

    await expect(memberPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 60_000 });
    await expect(streamerPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 60_000 });

    await expect(memberPage.getByTestId("private-session-steps")).toBeVisible({ timeout: 30_000 });
    await expect(streamerPage.getByTestId("private-session-steps")).toBeVisible({ timeout: 30_000 });

    const memberGuidance = memberPage.getByTestId("private-session-guidance");
    const streamerGuidance = streamerPage.getByTestId("private-session-guidance");
    await expect(memberGuidance).toBeVisible();
    await expect(streamerGuidance).toBeVisible();
    await expect(memberGuidance).toContainText(/Hazırım butonuna bas/i);
    await expect(streamerGuidance).toContainText(/Hazırım butonuna bas/i);

    await memberPage.getByTestId("private-media-ready-toggle").click();
    await streamerPage.getByTestId("private-media-ready-toggle").click();

    await expect(memberPage.getByTestId("private-session-both-ready")).toBeVisible({ timeout: 30_000 });
    await expect(streamerPage.getByTestId("private-session-both-ready")).toBeVisible({ timeout: 30_000 });

    await expect(memberGuidance).toContainText(/yayıncıyı bekliyorsun/i, { timeout: 15_000 });
    await expect(streamerGuidance).toContainText(/Bağlantıyı Başlat ile/i, { timeout: 15_000 });

    const studioStart = streamerPage.getByTestId("private-webrtc-start-button");
    await expect(studioStart).toBeEnabled({ timeout: 30_000 });
    await expect(studioStart).toContainText(/Bağlantıyı Başlat/);

    await studioStart.click({ timeout: 30_000 });

    await expect
      .poll(async () => streamerPage.getByTestId("private-webrtc-state").getAttribute("data-connection-state"), {
        timeout: 45_000,
        message: "Studio WebRTC state should leave idle after start.",
      })
      .not.toBe("idle");

    const memberEnd = memberPage.getByTestId("private-session-end-button");
    await expect(memberEnd).toBeVisible({ timeout: 15_000 });
    await memberEnd.click();

    const summaryOrResult = memberPage
      .getByTestId("private-session-summary")
      .or(memberPage.getByTestId("private-session-result"));
    await expect(summaryOrResult.first()).toBeVisible({ timeout: 35_000 });
    await expect(memberPage.getByTestId("private-session-result")).toContainText(/kapat[ıi]ld[ıi]/i, { timeout: 10_000 });

    finished = true;
  } finally {
    if (!finished) {
      await testInfo.attach("private-room-ux-polish-note.txt", {
        body: "Test did not reach normal completion.",
        contentType: "text/plain",
      });
    }
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
    await cleanupPrivateRoomFlow({ request, streamerPage, memberPage });
    await memberContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
