import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { attachPrivateRoomDiagnostics } from "./helpers/private-room-diagnostics";
import { createPrivateSessionForEdaAndVeli } from "./helpers/private-room-flow";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

test.describe.configure({ mode: "serial" });

test("private room WebRTC foundation — offer, answer, and signaling", async ({ browser, request }, testInfo) => {
  test.setTimeout(420_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();

  let roomId = "";
  let reachedEnd = false;

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

    const streamerSessionPanel = streamerPage.getByTestId("private-session-panel");
    const memberSessionPanel = memberPage.getByTestId("private-session-panel");
    await expect(streamerPage.getByTestId("private-webrtc-panel")).toBeVisible({ timeout: 30_000 });
    await expect(memberPage.getByTestId("private-webrtc-panel")).toBeVisible({ timeout: 30_000 });

    await memberPage.getByTestId("private-media-ready-toggle").click();
    await streamerPage.getByTestId("private-media-ready-toggle").click();
    await expect(memberPage.getByTestId("private-session-both-ready")).toBeVisible({ timeout: 30_000 });
    await expect(streamerPage.getByTestId("private-session-both-ready")).toBeVisible({ timeout: 30_000 });

    const studioStart = streamerPage.getByTestId("private-webrtc-start-button");
    if (await studioStart.isDisabled()) {
      const panel = streamerPage.getByTestId("private-session-panel");
      const vr = await panel.getAttribute("data-viewer-ready");
      const sr = await panel.getAttribute("data-streamer-ready");
      await testInfo.attach("private-webrtc-start-blocked.txt", {
        body: `studio private-session-panel data-viewer-ready=${vr} data-streamer-ready=${sr}`,
        contentType: "text/plain",
      });
    }

    await studioStart.click({ timeout: 30_000 });

    const studioWebrtcState = streamerPage.getByTestId("private-webrtc-state");
    await expect
      .poll(
        async () => studioWebrtcState.getAttribute("data-connection-state"),
        { timeout: 90_000, message: "Studio WebRTC state should leave idle after start." },
      )
      .toMatch(/^(creating|connecting|connected|failed|disconnected|closed)$/);

    await expect
      .poll(async () => {
        const lastText = (await memberSessionPanel.getByTestId("private-signal-last").textContent()) ?? "";
        const viewerStateAttr = await memberPage.getByTestId("private-webrtc-state").getAttribute("data-connection-state");
        const hasOfferInDebug = /offer/i.test(lastText);
        const viewerActive =
          viewerStateAttr === "connecting" || viewerStateAttr === "connected" || viewerStateAttr === "failed" || viewerStateAttr === "closed";
        return hasOfferInDebug || viewerActive;
      }, { timeout: 90_000, message: "Viewer should see offer in debug line or non-idle WebRTC state." })
      .toBe(true);

    await expect(streamerSessionPanel.getByTestId("private-signal-last")).toContainText(/answer/i, { timeout: 90_000 });

    const remoteOrPlaceholder = memberPage.getByTestId("private-webrtc-remote-video").or(
      memberPage.getByTestId("private-webrtc-remote-placeholder"),
    );
    await expect(remoteOrPlaceholder.first()).toBeVisible({ timeout: 10_000 });

    const memberError = memberPage.getByTestId("private-webrtc-error");
    if (await memberError.isVisible().catch(() => false)) {
      const errText = (await memberError.textContent().catch(() => "")) ?? "";
      await testInfo.attach("private-webrtc-error-note.txt", {
        body: `Görüntülü hata metni (bu test için başarısızlık değil): ${errText}`,
        contentType: "text/plain",
      });
    }

    await streamerPage.getByTestId("private-webrtc-close-button").click();
    await expect
      .poll(async () => streamerPage.getByTestId("private-webrtc-state").getAttribute("data-connection-state"), {
        timeout: 20_000,
      })
      .toMatch(/^(closed|idle)$/);

    reachedEnd = true;
  } finally {
    if (!reachedEnd) {
      await attachPrivateRoomDiagnostics(testInfo, { memberPage, streamerPage, request, roomId: roomId || undefined }).catch(() => {});
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
    await normalizeTestFixtures(request).catch(() => {});
    await memberContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
