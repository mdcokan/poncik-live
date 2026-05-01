import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { waitForLiveRoomByStreamerName } from "./helpers/live-room";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

async function extractAuthState(page: Page) {
  return page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) {
        continue;
      }
      const raw = localStorage.getItem(key);
      if (!raw) {
        continue;
      }
      try {
        const parsed = JSON.parse(raw) as
          | { access_token?: string; user?: { id?: string }; currentSession?: { access_token?: string; user?: { id?: string } } }
          | null;
        const accessToken = parsed?.access_token ?? parsed?.currentSession?.access_token ?? null;
        const userId = parsed?.user?.id ?? parsed?.currentSession?.user?.id ?? null;
        return { accessToken, userId };
      } catch {
        return { accessToken: null, userId: null };
      }
    }
    return { accessToken: null, userId: null };
  });
}

function parseBalance(value: string) {
  const match = value.match(/(-?\d+)/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

async function clearMemberRoomModeration(
  page: Page,
  roomId: string,
  memberUserId: string,
  streamerAccessToken: string,
) {
  if (!roomId || !memberUserId || !streamerAccessToken) {
    return;
  }
  await page.request
    .post(`/api/rooms/${roomId}/moderation`, {
      headers: {
        Authorization: `Bearer ${streamerAccessToken}`,
        "Content-Type": "application/json",
      },
      data: { targetUserId: memberUserId, action: "unban" },
      failOnStatusCode: false,
    })
    .catch(() => {});
}

async function buildPrivateRequestFailureDiagnostics(streamerPage: Page, memberPage: Page, request: APIRequestContext) {
  const streamerAuth = await extractAuthState(streamerPage);
  const memberAuth = await extractAuthState(memberPage);
  const bearer = (token: string | null) => (token ? { Authorization: `Bearer ${token}` } : undefined);

  const liveRooms = await request.get(`/api/live-rooms?limit=24&t=${Date.now()}`, { failOnStatusCode: false });
  const viewerPr = memberAuth.accessToken
    ? await request.get("/api/private-requests?scope=viewer", {
        headers: bearer(memberAuth.accessToken),
        failOnStatusCode: false,
      })
    : null;
  const streamerPr = streamerAuth.accessToken
    ? await request.get("/api/private-requests?scope=streamer&status=pending", {
        headers: bearer(streamerAuth.accessToken),
        failOnStatusCode: false,
      })
    : null;

  const memberBodySnippet = await memberPage.locator("body").innerText().catch(() => "");
  const studioBodySnippet = await streamerPage.locator("body").innerText().catch(() => "");

  return [
    `memberPage.url()=${memberPage.url()}`,
    `streamerPage.url()=${streamerPage.url()}`,
    `GET /api/live-rooms status=${liveRooms.status()} body=${(await liveRooms.text()).slice(0, 2500)}`,
    viewerPr
      ? `GET /api/private-requests?scope=viewer status=${viewerPr.status()} body=${(await viewerPr.text()).slice(0, 2500)}`
      : "viewer private-requests: no access token",
    streamerPr
      ? `GET /api/private-requests?scope=streamer&status=pending status=${streamerPr.status()} body=${(await streamerPr.text()).slice(0, 2500)}`
      : "streamer private-requests: no access token",
    `member body (slice)=${memberBodySnippet.slice(0, 1200)}`,
    `studio body (slice)=${studioBodySnippet.slice(0, 1200)}`,
  ].join("\n");
}

async function assertViewerPendingPrivateRequestForRoom(
  memberPage: Page,
  request: APIRequestContext,
  roomId: string,
) {
  const { accessToken } = await extractAuthState(memberPage);
  expect(accessToken, "member access token for private-requests").toBeTruthy();
  const res = await request.get("/api/private-requests?scope=viewer&status=pending", {
    headers: { Authorization: `Bearer ${accessToken}` },
    failOnStatusCode: false,
  });
  expect(res.ok(), `viewer pending private-requests status=${res.status()} body=${(await res.text()).slice(0, 800)}`).toBeTruthy();
  const payload = (await res.json().catch(() => ({}))) as { requests?: Array<{ roomId?: string; status?: string }> };
  const match = (payload.requests ?? []).find((row) => row.roomId === roomId && row.status === "pending");
  expect(match, `expected pending request for room ${roomId}, got ${JSON.stringify(payload.requests?.map((r) => ({ roomId: r.roomId, status: r.status }))).slice(0, 500)}`).toBeTruthy();
}

test("private room request flow handles minute checks and acceptance", async ({ browser, request }, testInfo) => {
  test.setTimeout(360_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();

  const startButton = streamerPage.getByRole("button", { name: /ba[sş]la/i });
  const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i });
  let roomId = "";
  let streamerAccessToken = "";

  const failWithDiagnostics = async (message: string) => {
    const diag = await buildPrivateRequestFailureDiagnostics(streamerPage, memberPage, request);
    throw new Error(`${message}\n--- diagnostics ---\n${diag}`);
  };

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
    if (!/\/studio(?:\/)?$/.test(streamerPage.url())) {
      await streamerPage.goto("/studio");
      await expect(streamerPage).toHaveURL(/\/studio(?:\/|$)/, { timeout: 20_000 });
    }
    const streamerAuth = await extractAuthState(streamerPage);
    streamerAccessToken = streamerAuth.accessToken ?? "";

    if (await stopButton.isVisible().catch(() => false)) {
      await stopButton.click();
      await expect(startButton).toBeVisible({ timeout: 20_000 });
    }
    await startButton.click();
    await expect(stopButton).toBeVisible({ timeout: 20_000 });

    roomId = (await waitForLiveRoomByStreamerName(request, /Eda/i)).id;

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
    await expect(memberPage).toHaveURL(/\/member(?:\/|$)/, { timeout: 20_000 });

    const memberAuth = await extractAuthState(memberPage);
    const memberUserId = memberAuth.userId;
    if (!memberUserId) {
      await failWithDiagnostics("Member user id not available.");
    }

    await expect
      .poll(
        async () => {
          const balanceText = (await memberPage.getByTestId("member-wallet-balance").textContent()) ?? "";
          return parseBalance(balanceText);
        },
        {
          timeout: 25_000,
          intervals: [200, 400, 800],
          message: "Veli wallet UI should reflect normalize top-up (>= 500 dk) after hook fetch",
        },
      )
      .toBeGreaterThanOrEqual(500);

    await clearMemberRoomModeration(streamerPage, roomId, memberUserId, streamerAccessToken);

    await memberPage.goto("/member");
    await expect(memberPage).toHaveURL(/\/member(?:\/|$)/, { timeout: 20_000 });
    const roomLink = memberPage.locator(`a[href="/rooms/${roomId}"]`).first();
    await expect(roomLink, "live room link on /member").toBeVisible({ timeout: 25_000 });
    await roomLink.click();
    await expect(memberPage).toHaveURL(new RegExp(`/rooms/${roomId}$`), { timeout: 20_000 });
    await expect(memberPage.getByText(/^CANLI$/i).first()).toBeVisible({ timeout: 20_000 });

    const inviteButton = memberPage.getByTestId("private-room-request-button");
    await expect(inviteButton, "private room request button").toBeEnabled({ timeout: 20_000 });
    await inviteButton.click();

    try {
      await expect(memberPage.getByTestId("private-request-feedback")).toContainText(/iletildi|bekleyen/i, {
        timeout: 25_000,
      });
    } catch (err) {
      await failWithDiagnostics(`Waiting for private-request-feedback (iletildi|bekleyen) failed: ${err}`);
    }

    try {
      await assertViewerPendingPrivateRequestForRoom(memberPage, request, roomId);
    } catch (err) {
      await failWithDiagnostics(`Viewer pending private request API check failed: ${err}`);
    }

    await expect
      .poll(
        async () => {
          if (!streamerAccessToken) {
            return null;
          }
          const res = await request.get("/api/private-requests?scope=streamer&status=pending", {
            headers: { Authorization: `Bearer ${streamerAccessToken}` },
            failOnStatusCode: false,
          });
          if (!res.ok()) {
            return null;
          }
          const payload = (await res.json().catch(() => ({}))) as { requests?: Array<{ roomId?: string }> };
          const hit = (payload.requests ?? []).find((row) => row.roomId === roomId);
          return hit ? "ok" : null;
        },
        {
          timeout: 45_000,
          intervals: [400, 800, 1200],
          message: "streamer API should list a pending private request for the live room",
        },
      )
      .toBe("ok");

    const requestsPanel = streamerPage.getByTestId("studio-private-requests-panel");
    await expect(requestsPanel).toBeVisible({ timeout: 20_000 });
    await expect(requestsPanel.getByText("Talepler yükleniyor", { exact: false })).toHaveCount(0, { timeout: 45_000 });
    const acceptBtn = requestsPanel.getByTestId("accept-private-request-button").first();
    try {
      await expect(acceptBtn).toBeVisible({ timeout: 25_000 });
    } catch (err) {
      await failWithDiagnostics(`Studio Kabul Et button not visible after API pending: ${err}`);
    }

    const acceptResponsePromise = streamerPage.waitForResponse(
      (res) =>
        /\/api\/private-requests\/[^/]+\/decide/.test(res.url()) && res.request().method() === "POST",
      { timeout: 35_000 },
    );
    await acceptBtn.click({ timeout: 10_000 });
    const acceptResponse = await acceptResponsePromise;
    expect(acceptResponse.ok(), `accept decide status=${acceptResponse.status()} body=${await acceptResponse.text()}`).toBeTruthy();

    try {
      await expect(memberPage.getByTestId("private-request-status-message")).toContainText(/kabul edildi/i, {
        timeout: 30_000,
      });
    } catch (err) {
      const { accessToken } = await extractAuthState(memberPage);
      let acceptedViaApi = false;
      if (accessToken) {
        const check = await request.get("/api/private-requests?scope=viewer&status=accepted", {
          headers: { Authorization: `Bearer ${accessToken}` },
          failOnStatusCode: false,
        });
        if (check.ok()) {
          const payload = (await check.json().catch(() => ({}))) as { requests?: Array<{ roomId?: string; status?: string }> };
          acceptedViaApi = Boolean(
            (payload.requests ?? []).find((row) => row.roomId === roomId && row.status === "accepted"),
          );
        }
      }
      if (acceptedViaApi) {
        await failWithDiagnostics(
          `API shows accepted for room ${roomId} but private-request-status-message not visible (realtime/UI): ${err}`,
        );
      }
      await failWithDiagnostics(`Accepted message on viewer failed and API did not show accepted: ${err}`);
    }
  } finally {
    try {
      if (streamerAccessToken) {
        const pendingResponse = await request.get("/api/private-requests?scope=streamer&status=pending", {
          headers: {
            Authorization: `Bearer ${streamerAccessToken}`,
          },
          failOnStatusCode: false,
        });
        if (pendingResponse.ok()) {
          const payload = (await pendingResponse.json().catch(() => ({}))) as { requests?: Array<{ id: string }> };
          for (const requestItem of payload.requests ?? []) {
            await request
              .post(`/api/private-requests/${requestItem.id}/decide`, {
                headers: {
                  Authorization: `Bearer ${streamerAccessToken}`,
                  "Content-Type": "application/json",
                },
                data: { decision: "rejected" },
                failOnStatusCode: false,
              })
              .catch(() => {});
          }
        }
      }
    } catch {
      /* request context may be torn down if the test timed out */
    }

    if (!streamerPage.isClosed() && (await stopButton.isVisible().catch(() => false))) {
      await stopButton.click().catch(() => {});
    }

    await normalizeTestFixtures(request).catch(() => {});
    await memberContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
