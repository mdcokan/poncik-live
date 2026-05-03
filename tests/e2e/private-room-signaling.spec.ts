import { expect, test, type APIRequestContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { gotoDomWithRetry } from "./helpers/navigation";
import { attachPrivateRoomDiagnostics, extractSupabaseAccessToken } from "./helpers/private-room-diagnostics";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";
import { ensureStreamerLive } from "./helpers/studio";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

function parseBalance(value: string) {
  const match = value.match(/(-?\d+)/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

async function getWalletBalance(page: Page) {
  const text = (await page.getByTestId("member-wallet-balance").textContent()) ?? "";
  return parseBalance(text);
}

async function attachSignalingExpectFailure(
  testInfo: TestInfo,
  label: string,
  opts: {
    memberPage: Page;
    streamerPage: Page;
    request: APIRequestContext;
    sessionId: string | null;
    receiverTokenPage: Page;
  },
) {
  const memberLast = await opts.memberPage.getByTestId("private-signal-last").textContent().catch(() => "");
  const studioLast = await opts.streamerPage.getByTestId("private-signal-last").textContent().catch(() => "");
  const memberCount = await opts.memberPage.getByTestId("private-signal-count").textContent().catch(() => "");
  const studioCount = await opts.streamerPage.getByTestId("private-signal-count").textContent().catch(() => "");
  const token = await extractSupabaseAccessToken(opts.receiverTokenPage);
  let getSnapshot = "no_token";
  if (opts.sessionId && token) {
    const res = await opts.request.get(`/api/private-sessions/${encodeURIComponent(opts.sessionId)}/signals`, {
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    });
    const body = await res.json().catch(() => null);
    getSnapshot = JSON.stringify({ httpStatus: res.status(), body });
  }
  const body = [
    `label=${label}`,
    `memberUrl=${opts.memberPage.url()}`,
    `studioUrl=${opts.streamerPage.url()}`,
    `sessionId=${opts.sessionId ?? ""}`,
    `member private-signal-last=${JSON.stringify(memberLast)}`,
    `studio private-signal-last=${JSON.stringify(studioLast)}`,
    `member private-signal-count=${JSON.stringify(memberCount)}`,
    `studio private-signal-count=${JSON.stringify(studioCount)}`,
    `GET /signals (receiver token)=${getSnapshot}`,
  ].join("\n");
  await testInfo.attach(`signaling-expect-failure-${label}.txt`, { body, contentType: "text/plain" });
}

async function expectReceiverLastSignal(
  testInfo: TestInfo,
  opts: {
    receiverPanel: Locator;
    receiverPage: Page;
    memberPage: Page;
    streamerPage: Page;
    request: APIRequestContext;
    sessionId: string | null;
    pattern: RegExp;
    stepLabel: string;
  },
) {
  try {
    await expect(opts.receiverPanel.getByTestId("private-signal-last")).toContainText(opts.pattern, { timeout: 35_000 });
    await expect(opts.receiverPanel.getByTestId("private-signal-count")).toContainText(/[1-9]/);
  } catch {
    await attachSignalingExpectFailure(testInfo, opts.stepLabel, {
      memberPage: opts.memberPage,
      streamerPage: opts.streamerPage,
      request: opts.request,
      sessionId: opts.sessionId,
      receiverTokenPage: opts.receiverPage,
    });
    throw new Error(`Receiver UI did not match ${opts.stepLabel} (see signaling-expect-failure-${opts.stepLabel}.txt)`);
  }
}

test.describe.configure({ mode: "serial" });

test("private room signaling relays ready_ping, offer, and answer", async ({ browser, request }, testInfo) => {
  test.setTimeout(420_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();

  let roomId = "";
  let reachedEnd = false;
  let sessionId: string | null = null;

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
    await gotoDomWithRetry(streamerPage, "/studio");
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
    await gotoDomWithRetry(memberPage, "/member");
    await expect
      .poll(async () => getWalletBalance(memberPage), { timeout: 25_000, message: "Veli wallet balance should be >= 500" })
      .toBeGreaterThanOrEqual(500);

    await memberPage.locator(`a[href="/rooms/${roomId}"]`).first().click();
    await expect(memberPage).toHaveURL(new RegExp(`/rooms/${roomId}$`), { timeout: 20_000 });

    const privateRequestButton = memberPage.getByTestId("private-room-request-button");
    await expect(privateRequestButton).toBeEnabled({
      timeout: 60_000,
      message:
        "Özel oda daveti butonu yayın canlı görülene kadar kapalı kalır; viewer room state bazen gecikmeli güncellenir. Bekleme süresi doldu.",
    });
    await privateRequestButton.click();
    await expect(memberPage.getByTestId("private-request-feedback")).toContainText(/iletildi|bekleyen/i, { timeout: 20_000 });

    const acceptButton = streamerPage.getByTestId("accept-private-request-button").first();
    await expect(acceptButton).toBeVisible({ timeout: 25_000 });
    await acceptButton.click();

    const streamerSessionPanel = streamerPage.getByTestId("private-session-panel");
    const memberSessionPanel = memberPage.getByTestId("private-session-panel");

    await expect(streamerSessionPanel).toBeVisible({ timeout: 30_000 });
    await expect(memberSessionPanel).toBeVisible({ timeout: 30_000 });
    await expect(streamerSessionPanel.getByTestId("private-signaling-panel")).toBeVisible({ timeout: 30_000 });
    await expect(memberSessionPanel.getByTestId("private-signaling-panel")).toBeVisible({ timeout: 30_000 });

    sessionId = await memberSessionPanel.getAttribute("data-session-id");

    await memberSessionPanel.getByTestId("private-signal-ready-ping").click({ timeout: 30_000 });
    await expect(memberSessionPanel.getByTestId("private-signal-last")).toContainText(/ready_ping/i, { timeout: 15_000 });
    await expect(memberSessionPanel.getByTestId("private-signal-count")).toContainText(/[1-9]/);

    await expectReceiverLastSignal(testInfo, {
      receiverPanel: streamerSessionPanel,
      receiverPage: streamerPage,
      memberPage,
      streamerPage,
      request,
      sessionId,
      pattern: /ready_ping/i,
      stepLabel: "ready_ping_receiver",
    });

    await streamerSessionPanel.getByTestId("private-signal-offer").click({ timeout: 30_000 });
    await expect(streamerSessionPanel.getByTestId("private-signal-last")).toContainText(/offer/i, { timeout: 15_000 });
    await expect(streamerSessionPanel.getByTestId("private-signal-count")).toContainText(/[1-9]/);

    await expectReceiverLastSignal(testInfo, {
      receiverPanel: memberSessionPanel,
      receiverPage: memberPage,
      memberPage,
      streamerPage,
      request,
      sessionId,
      pattern: /offer/i,
      stepLabel: "offer_receiver",
    });

    await memberSessionPanel.getByTestId("private-signal-answer").click({ timeout: 30_000 });
    await expect(memberSessionPanel.getByTestId("private-signal-last")).toContainText(/answer/i, { timeout: 15_000 });
    await expect(memberSessionPanel.getByTestId("private-signal-count")).toContainText(/[1-9]/);

    await expectReceiverLastSignal(testInfo, {
      receiverPanel: streamerSessionPanel,
      receiverPage: streamerPage,
      memberPage,
      streamerPage,
      request,
      sessionId,
      pattern: /answer/i,
      stepLabel: "answer_receiver",
    });

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
