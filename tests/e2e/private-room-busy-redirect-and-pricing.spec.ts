import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";
import { ensureStreamerLive } from "./helpers/studio";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const ADMIN_EMAIL = "admin@test.com";
const PASSWORD = "123123";

function parseBalance(value: string) {
  const matches = value.match(/-?\d+/g);
  if (!matches?.length) {
    return null;
  }
  return Number.parseInt(matches[matches.length - 1] ?? "0", 10);
}

function parseSpentMinutesFromResultText(value: string) {
  const match = value.match(/harcanan s[üu]re:\s*(\d+)\s*dk/i);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

test("private room busy redirect and pricing multiplier", async ({ browser, request }, testInfo) => {
  test.setTimeout(420_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const otherViewerContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();
  const otherViewerPage = await otherViewerContext.newPage();
  const adminPage = await adminContext.newPage();

  try {
    const getOtherViewerAccessToken = async () => {
      return otherViewerPage
        .evaluate(() => {
          const authEntry = Object.entries(window.localStorage).find(([key]) => key.includes("auth-token"));
          if (!authEntry) {
            return { exists: false, token: null as string | null };
          }
          try {
            const parsed = JSON.parse(authEntry[1]) as {
              access_token?: string;
              currentSession?: { access_token?: string };
            };
            const token = parsed?.access_token ?? parsed?.currentSession?.access_token ?? null;
            return { exists: Boolean(token), token };
          } catch {
            return { exists: false, token: null as string | null };
          }
        })
        .catch(() => ({ exists: false, token: null as string | null }));
    };

    const collectOtherViewerDiagnostics = async (label: string) => {
      const tokenState = await getOtherViewerAccessToken();
      const [url, bodyText, requestDisabled, noticeCount, redirectingCount, privateStatePayload, roomStatePayload] = await Promise.all([
        otherViewerPage.url(),
        otherViewerPage.locator("body").innerText().catch(() => "<body-unavailable>"),
        otherViewerPage
          .getByTestId("private-room-request-button")
          .isDisabled()
          .catch(() => false),
        otherViewerPage.getByTestId("room-private-busy-notice").count().catch(() => 0),
        otherViewerPage.getByTestId("room-private-busy-redirecting").count().catch(() => 0),
        request
          .get(`/api/rooms/${roomId}/private-session-state`, {
            failOnStatusCode: false,
            headers: tokenState.token ? { Authorization: `Bearer ${tokenState.token}` } : undefined,
          })
          .then(async (response) => {
            const status = response.status();
            const text = await response.text().catch(() => "");
            return {
              status,
              text,
              authHeaderPresent: Boolean(tokenState.token),
              authHeaderUsesBearer: Boolean(tokenState.token),
              authHeaderSource: tokenState.token ? "otherViewer localStorage access token" : "missing",
            };
          })
          .catch(() => ({ status: -1, text: "request-failed" })),
        request
          .get(`/api/rooms/${roomId}/state`, { failOnStatusCode: false })
          .then(async (response) => {
            const status = response.status();
            const text = await response.text().catch(() => "");
            return { status, text };
          })
          .catch(() => ({ status: -1, text: "request-failed" })),
      ]);

      const snippet = bodyText.length > 1200 ? `${bodyText.slice(0, 1200)}...` : bodyText;
      await testInfo.attach(`other-viewer-diagnostics-${label}`, {
        contentType: "application/json",
        body: JSON.stringify(
          {
            url,
            requestDisabled,
            noticeCount,
            redirectingCount,
            localStorageAuthTokenExists: tokenState.exists,
            privateStatePayload,
            roomStatePayload,
            bodySnippet: snippet,
          },
          null,
          2,
        ),
      });
    };

    await loginWithStabilizedAuth(
      adminPage,
      {
        role: "member",
        loginPath: "/login",
        email: ADMIN_EMAIL,
        password: PASSWORD,
        successUrl: /\/admin(?:\/|$)/,
        targetUrl: "/admin/settings",
        successIndicator: adminPage.getByRole("heading", { name: /sistem ayarlar/i }).first(),
      },
      testInfo,
    );

    await adminPage.goto("/admin/settings");
    const pricePerMinute = 2;
    await adminPage.getByTestId("admin-private-room-price-input").fill(String(pricePerMinute));
    await adminPage.getByTestId("admin-private-room-settings-save").click();
    await expect(adminPage.getByTestId("admin-private-room-settings-status")).toContainText(/kaydedildi/i, { timeout: 20_000 });

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
    await expect
      .poll(
        async () => parseBalance((await memberPage.getByTestId("member-wallet-balance").textContent()) ?? ""),
        { timeout: 25_000, message: "member wallet balance should be loaded before private-room flow" },
      )
      .toBeGreaterThan(pricePerMinute);
    const startBalance = parseBalance((await memberPage.getByTestId("member-wallet-balance").textContent()) ?? "") ?? 0;
    await memberPage.goto(`/rooms/${roomId}`);
    await expect(memberPage.getByTestId("private-room-price-label")).toContainText(/2 dk \/ dakika/i, { timeout: 20_000 });
    await memberPage.getByTestId("private-room-request-button").click();
    await expect(memberPage.getByTestId("private-request-feedback")).toContainText(/bekleniyor|gönderildi|gonderildi/i, { timeout: 20_000 });

    await loginWithStabilizedAuth(
      otherViewerPage,
      {
        role: "member",
        loginPath: "/login",
        email: ADMIN_EMAIL,
        password: PASSWORD,
        successUrl: /\/admin(?:\/|$)/,
        targetUrl: `/rooms/${roomId}`,
        successIndicator: otherViewerPage.locator("body"),
      },
      testInfo,
    );
    await otherViewerPage.goto(`/rooms/${roomId}`);

    await expect(streamerPage.getByTestId("studio-private-request-accept-button").first()).toBeVisible({ timeout: 25_000 });
    await streamerPage.getByTestId("studio-private-request-accept-button").first().click();

    await expect(streamerPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });
    await expect(memberPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });
    const otherViewerTokenState = await getOtherViewerAccessToken();
    const postAcceptPrivateState = await request
      .get(`/api/rooms/${roomId}/private-session-state`, {
        failOnStatusCode: false,
        headers: otherViewerTokenState.token ? { Authorization: `Bearer ${otherViewerTokenState.token}` } : undefined,
      })
      .then(async (response) => ({ status: response.status(), text: await response.text().catch(() => "") }))
      .catch(() => ({ status: -1, text: "request-failed" }));
    await testInfo.attach("other-viewer-post-accept-private-session-state", {
      contentType: "application/json",
      body: JSON.stringify(
        {
          localStorageAuthTokenExists: otherViewerTokenState.exists,
          requestAuthHeaderPresent: Boolean(otherViewerTokenState.token),
          response: postAcceptPrivateState,
        },
        null,
        2,
      ),
    });
    const parsedPostAcceptPrivateState = JSON.parse(postAcceptPrivateState.text) as {
      ok?: boolean;
      active?: boolean;
      isParticipant?: boolean;
    };
    expect(postAcceptPrivateState.status).toBe(200);
    expect(parsedPostAcceptPrivateState.ok).toBe(true);
    expect(parsedPostAcceptPrivateState.active).toBe(true);
    expect(parsedPostAcceptPrivateState.isParticipant).toBe(false);

    const pollDiagnostics: Array<{
      url: string;
      noticeVisible: boolean;
      redirectingVisible: boolean;
      privateRequestDisabled: boolean;
      noticeCount: number;
      redirectingCount: number;
      localStorageAuthTokenExists: boolean;
      privateSessionStateStatus: number;
      roomStateStatus: number;
      bodySnippet: string;
    }> = [];
    try {
      await expect
        .poll(
          async () => {
            const tokenState = await getOtherViewerAccessToken();
            const [url, bodyText, noticeVisible, redirectingVisible, privateRequestDisabled, noticeCount, redirectingCount, privateStatePayload, roomStatePayload] =
              await Promise.all([
                otherViewerPage.url(),
                otherViewerPage.locator("body").innerText().catch(() => "<body-unavailable>"),
                otherViewerPage.getByTestId("room-private-busy-notice").isVisible().catch(() => false),
                otherViewerPage.getByTestId("room-private-busy-redirecting").isVisible().catch(() => false),
                otherViewerPage
                  .getByTestId("private-room-request-button")
                  .isDisabled()
                  .catch(() => false),
                otherViewerPage.getByTestId("room-private-busy-notice").count().catch(() => 0),
                otherViewerPage.getByTestId("room-private-busy-redirecting").count().catch(() => 0),
                request
                  .get(`/api/rooms/${roomId}/private-session-state`, {
                    failOnStatusCode: false,
                    headers: tokenState.token ? { Authorization: `Bearer ${tokenState.token}` } : undefined,
                  })
                  .then(async (response) => ({ status: response.status(), text: await response.text().catch(() => "") }))
                  .catch(() => ({ status: -1, text: "request-failed" })),
                request
                  .get(`/api/rooms/${roomId}/state`, { failOnStatusCode: false })
                  .then(async (response) => ({ status: response.status(), text: await response.text().catch(() => "") }))
                  .catch(() => ({ status: -1, text: "request-failed" })),
              ]);
            const bodySnippet = bodyText.length > 700 ? `${bodyText.slice(0, 700)}...` : bodyText;
            pollDiagnostics.push({
              url,
              noticeVisible,
              redirectingVisible,
              privateRequestDisabled,
              noticeCount,
              redirectingCount,
              localStorageAuthTokenExists: tokenState.exists,
              privateSessionStateStatus: privateStatePayload.status,
              roomStateStatus: roomStatePayload.status,
              bodySnippet,
            });
            if (pollDiagnostics.length > 12) {
              pollDiagnostics.shift();
            }
            return noticeVisible || /\/member(?:\/|$)/.test(new URL(url).pathname);
          },
          { timeout: 45_000, message: "other viewer should see busy notice or already land on /member" },
        )
        .toBe(true);
    } catch (error) {
      await collectOtherViewerDiagnostics("poll-failed");
      await testInfo.attach("other-viewer-busy-poll-trace", {
        contentType: "application/json",
        body: JSON.stringify(pollDiagnostics, null, 2),
      });
      throw error;
    }
    await testInfo.attach("other-viewer-busy-poll-trace", {
      contentType: "application/json",
      body: JSON.stringify(pollDiagnostics, null, 2),
    });
    const otherViewerPath = new URL(otherViewerPage.url()).pathname;
    if (/\/rooms(?:\/|$)/.test(otherViewerPath)) {
      await expect(otherViewerPage.getByTestId("room-private-busy-notice")).toBeVisible({ timeout: 30_000 });
      await expect(otherViewerPage.getByTestId("room-private-busy-redirecting")).toBeVisible({ timeout: 30_000 });
      await expect(otherViewerPage.getByTestId("private-room-request-button")).toBeDisabled({ timeout: 30_000 });
      await expect(otherViewerPage.getByTestId("room-chat-input")).toBeDisabled({ timeout: 30_000 });
      await expect(otherViewerPage.getByTestId("room-chat-send-button")).toBeDisabled({ timeout: 30_000 });
    }
    await collectOtherViewerDiagnostics("post-busy-check");

    await memberPage.waitForTimeout(2500);
    const endResponsePromise = memberPage.waitForResponse(
      (response) => response.request().method() === "POST" && /\/api\/private-sessions\/[^/]+\/end$/.test(new URL(response.url()).pathname),
      { timeout: 30_000 },
    );
    await memberPage.getByTestId("private-session-end-button").click();
    const endResponse = await endResponsePromise;
    await expect(memberPage.getByTestId("private-session-result")).toContainText(/harcanan s[üu]re/i, { timeout: 30_000 });
    const resultText = (await memberPage.getByTestId("private-session-result").textContent()) ?? "";
    const spentMinutesFromResult = parseSpentMinutesFromResultText(resultText);

    let chargedMinutesFromApi: number | null = null;
    if (endResponse.ok()) {
      const payload = (await endResponse.json().catch(() => null)) as { session?: { chargedMinutes?: number } } | null;
      if (typeof payload?.session?.chargedMinutes === "number" && Number.isFinite(payload.session.chargedMinutes)) {
        chargedMinutesFromApi = payload.session.chargedMinutes;
      }
    }

    await memberPage.goto("/member");
    if (typeof chargedMinutesFromApi === "number") {
      await expect
        .poll(
          async () => parseBalance((await memberPage.getByTestId("member-wallet-balance").textContent()) ?? ""),
          { timeout: 30_000, message: "wallet should align with chargedMinutes from end-session API" },
        )
        .toBe(startBalance - chargedMinutesFromApi);
    } else {
      await expect
        .poll(
          async () => parseBalance((await memberPage.getByTestId("member-wallet-balance").textContent()) ?? ""),
          { timeout: 30_000, message: "wallet should be reduced after private session end" },
        )
        .toBeLessThanOrEqual(startBalance - pricePerMinute);
    }
    const finalBalance = parseBalance((await memberPage.getByTestId("member-wallet-balance").textContent()) ?? "") ?? 0;

    const actualSpent = startBalance - finalBalance;
    expect(actualSpent).toBeGreaterThanOrEqual(pricePerMinute);

    if (typeof chargedMinutesFromApi === "number") {
      expect(actualSpent).toBe(chargedMinutesFromApi);
    } else if (typeof spentMinutesFromResult === "number") {
      expect(actualSpent).toBe(spentMinutesFromResult);
    } else {
      expect(actualSpent).toBeLessThanOrEqual(pricePerMinute * 3);
    }
  } finally {
    if (!streamerPage.isClosed()) {
      const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i }).first();
      if (await stopButton.isVisible().catch(() => false)) {
        await stopButton.click().catch(() => {});
      }
    }
    await normalizeTestFixtures(request).catch(() => {});
    await adminContext.close().catch(() => {});
    await otherViewerContext.close().catch(() => {});
    await memberContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
