import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";
import { waitForLiveRoomByStreamerName } from "./helpers/live-room";
import { attachPrivateRoomDiagnostics, extractSupabaseAccessToken } from "./helpers/private-room-diagnostics";
import { waitForViewerPrivateSessionPanelAfterAccept } from "./helpers/private-room-flow";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

test("live room scroll containers and private session ux", async ({ browser, request }, testInfo) => {
  test.setTimeout(360_000);
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

    await viewerPage.getByTestId("room-tab-chat").click();
    const viewerChatInput = viewerPage.getByTestId("room-chat-input");
    for (let index = 0; index < 16; index += 1) {
      await viewerChatInput.fill(`scroll seed ${Date.now()}-${index}`);
      await viewerPage.getByTestId("room-chat-send-button").click();
    }
    await expect(viewerPage.getByTestId("room-chat-message").first()).toBeVisible({ timeout: 20_000 });
    const chatContainer = viewerPage.getByTestId("room-tabpanel-chat");
    await expect
      .poll(async () => {
        return await chatContainer.evaluate((element) => element.scrollHeight > element.clientHeight);
      })
      .toBeTruthy();
    await chatContainer.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll"));
    });
    const beforeScrollTop = await chatContainer.evaluate((element) => element.scrollTop);

    await streamerPage.getByTestId("studio-tab-chat").click();
    await streamerPage.getByTestId("room-chat-input").fill(`incoming while up ${Date.now()}`);
    await streamerPage.getByTestId("room-chat-send-button").click();

    await expect(chatContainer).toBeVisible();
    const afterScrollTop = await chatContainer.evaluate((element) => element.scrollTop);
    expect(afterScrollTop).toBeGreaterThanOrEqual(beforeScrollTop);

    await viewerPage.getByTestId("room-tab-participants").click();
    const participantsContainer = viewerPage.getByTestId("room-tabpanel-participants");
    await participantsContainer.evaluate((element) => {
      element.scrollTop = 24;
    });
    const participantsTopBefore = await participantsContainer.evaluate((element) => element.scrollTop);
    await viewerPage.getByTestId("room-tab-gifts").click();
    await viewerPage.getByTestId("room-tab-participants").click();
    const participantsTopAfter = await participantsContainer.evaluate((element) => element.scrollTop);
    expect(Math.abs(participantsTopAfter - participantsTopBefore)).toBeLessThan(12);

    await viewerPage.getByTestId("room-tab-gifts").click();
    await expect(viewerPage.getByTestId("room-tabpanel-gifts")).toBeVisible();

    await viewerPage.getByTestId("private-room-request-button").click();
    await expect(viewerPage.getByTestId("private-request-feedback")).toContainText(/onayı bekleniyor|bekleniyor/i, { timeout: 20_000 });

    await expect(streamerPage.getByTestId("studio-private-request-modal")).toBeVisible({ timeout: 30_000 });
    await expect(streamerPage.getByTestId("studio-private-request-viewer-name")).toContainText(/Veli/i);

    try {
      const acceptResponsePromise = streamerPage.waitForResponse(
        (res) =>
          /\/api\/private-requests\/[^/]+\/decide$/.test(res.url()) &&
          res.request().method() === "POST" &&
          res.status() >= 200 &&
          res.status() < 300,
        { timeout: 30_000 },
      );
      await streamerPage.getByTestId("studio-private-request-accept-button").click();
      const acceptResponse = await acceptResponsePromise;
      expect(acceptResponse.ok()).toBeTruthy();

      const activeSessionId = await waitForViewerPrivateSessionPanelAfterAccept({
        memberPage: viewerPage,
        request,
        timeoutMs: 45_000,
      });

      await expect(streamerPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 45_000 });
      await expect
        .poll(
          async () => (await streamerPage.getByTestId("private-session-panel").getAttribute("data-session-id"))?.trim() ?? null,
          {
            timeout: 30_000,
            intervals: [250, 500, 1000],
            message: "Studio private-session-panel data-session-id active session ile eşleşmeli.",
          },
        )
        .toBe(activeSessionId);

      await expect(viewerPage.getByTestId("private-session-panel")).toContainText(/Yayıncı/i);
      await expect(viewerPage.getByTestId("private-session-panel")).toContainText(/Üye/i);
      await expect(viewerPage.getByTestId("private-session-end-button")).toContainText(/Görüşmeyi Bitir/i);
    } catch (error) {
      await attachPrivateRoomDiagnostics(testInfo, {
        memberPage: viewerPage,
        streamerPage,
        request,
        roomId: liveRoom.id,
      }).catch(() => {});

      const memberToken = await extractSupabaseAccessToken(viewerPage);
      const activeSessionResponse = memberToken
        ? await request
            .get("/api/private-sessions/active", {
              headers: { Authorization: `Bearer ${memberToken}` },
              failOnStatusCode: false,
            })
            .catch(() => null)
        : null;
      const activeSessionBody = activeSessionResponse ? await activeSessionResponse.text().catch(() => "<read failed>") : "<no token>";
      const privateRequestListText = await streamerPage
        .getByTestId("studio-private-requests-panel")
        .innerText()
        .catch(() => "<not found>");
      const panelExists = await viewerPage.getByTestId("private-session-panel").count().catch(() => 0);
      const bodySnippet = await viewerPage.locator("body").innerText().then((value) => value.replace(/\s+/g, " ").slice(0, 1200)).catch(() => "");
      const studioModalState = {
        modalVisible: await streamerPage.getByTestId("studio-private-request-modal").isVisible().catch(() => false),
        reopenBadgeVisible: await streamerPage.getByTestId("studio-private-request-reopen-badge").isVisible().catch(() => false),
      };
      const extraDiagnostics = [
        `memberUrl=${viewerPage.url()}`,
        `studioUrl=${streamerPage.url()}`,
        `memberActivePrivateSession=${activeSessionBody}`,
        `privateRequestList=${privateRequestListText.replace(/\s+/g, " ").trim().slice(0, 1500)}`,
        `privateSessionPanelCount=${panelExists}`,
        `memberBodySnippet=${bodySnippet}`,
        `studioModalState=${JSON.stringify(studioModalState)}`,
      ].join("\n");
      await testInfo.attach("private-room-accept-overlay-diagnostics.txt", {
        body: extraDiagnostics,
        contentType: "text/plain",
      });
      throw error;
    }
  } finally {
    if (!streamerPage.isClosed() && (await stopButton.isVisible().catch(() => false))) {
      await stopButton.click().catch(() => {});
    }
    await normalizeTestFixtures(request).catch(() => {});
    await viewerContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
