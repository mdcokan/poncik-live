import { expect, test } from "@playwright/test";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { waitForLiveRoomByStreamerName } from "./helpers/live-room";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

async function extractAccessToken(page: import("@playwright/test").Page) {
  const rawTokenPayload = await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) {
        continue;
      }
      const value = localStorage.getItem(key);
      if (value) {
        return value;
      }
    }
    return null;
  });

  if (!rawTokenPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawTokenPayload) as
      | { access_token?: string; currentSession?: { access_token?: string } }
      | null;
    return parsed?.access_token ?? parsed?.currentSession?.access_token ?? null;
  } catch {
    return null;
  }
}

test("room moderation smoke: mute unmute kick ban", async ({ browser, request }, testInfo) => {
  test.setTimeout(180_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();
  const startButton = streamerPage.getByRole("button", { name: /ba[sş]la/i });
  const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i });
  let roomId = "";
  let memberUserId = "";

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

    if (await stopButton.isVisible().catch(() => false)) {
      await stopButton.click();
      await expect(startButton).toBeVisible({ timeout: 20_000 });
    }
    await startButton.click();
    await expect(stopButton).toBeVisible({ timeout: 20_000 });

    const liveRoom = await waitForLiveRoomByStreamerName(request, /Eda/i);
    roomId = liveRoom.id;

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
    await expect(memberPage).toHaveURL(new RegExp(`/rooms/${roomId}$`), { timeout: 20_000 });
    const initialMessage = `moderasyon test mesajı ${Date.now()}`;
    await memberPage.getByPlaceholder(/Mesaj/i).first().fill(initialMessage);
    await memberPage.getByRole("button", { name: /Gonder/i }).first().click();
    await expect(memberPage.getByText(initialMessage).first()).toBeVisible({ timeout: 20_000 });

    const presencePanel = streamerPage.getByTestId("room-presence-panel").first();
    const memberActions = presencePanel
      .locator('[data-testid^="presence-actions-"]')
      .filter({ hasText: /Sustur|Odadan Çıkar|Oda Banı/i })
      .first();
    await expect(memberActions).toBeVisible({ timeout: 25_000 });
    const actionsTestId = await memberActions.getAttribute("data-testid");
    memberUserId = actionsTestId?.replace("presence-actions-", "") ?? "";

    const muteResponsePromise = streamerPage.waitForResponse(
      (response) => response.url().includes(`/api/rooms/${roomId}/moderation`) && response.request().method() === "POST",
      { timeout: 20_000 },
    );
    await memberActions.getByRole("button", { name: /Sustur$/i }).first().click();
    const muteResponse = await muteResponsePromise;
    const muteBody = await muteResponse.text();
    expect(muteResponse.ok(), `mute response: status=${muteResponse.status()} body=${muteBody}`).toBeTruthy();
    await memberPage.reload({ waitUntil: "domcontentloaded" });
    await expect(memberPage.getByPlaceholder(/Mesaj/i).first()).toBeDisabled({ timeout: 20_000 });

    const unmuteResponsePromise = streamerPage.waitForResponse(
      (response) => response.url().includes(`/api/rooms/${roomId}/moderation`) && response.request().method() === "POST",
      { timeout: 20_000 },
    );
    await memberActions.getByRole("button", { name: /Susturmayı Kaldır/i }).first().click();
    const unmuteResponse = await unmuteResponsePromise;
    const unmuteBody = await unmuteResponse.text();
    expect(unmuteResponse.ok(), `unmute response: status=${unmuteResponse.status()} body=${unmuteBody}`).toBeTruthy();
    await memberPage.reload({ waitUntil: "domcontentloaded" });
    await expect(memberPage.getByPlaceholder(/Mesaj/i).first()).toBeEnabled({ timeout: 20_000 });

    await memberActions.getByRole("button", { name: /Odadan Çıkar/i }).first().click();
    await expect(memberPage.getByText(/Odadan çıkarıldınız\./i).first()).toBeVisible({ timeout: 20_000 });

    await memberPage.goto(`/rooms/${roomId}`);
    await expect(memberPage).toHaveURL(new RegExp(`/rooms/${roomId}$`), { timeout: 20_000 });

    const memberActionsAfterRejoin = presencePanel.getByTestId(`presence-actions-${memberUserId}`).first();
    await expect(memberActionsAfterRejoin).toBeVisible({ timeout: 25_000 });
    await memberActionsAfterRejoin.getByRole("button", { name: /Oda Banı/i }).first().click();
    await expect(memberPage.getByText(/Bu odaya girişiniz engellenmiştir\./i).first()).toBeVisible({ timeout: 20_000 });
  } finally {
    if (roomId && memberUserId && !streamerPage.isClosed()) {
      const streamerAccessToken = await extractAccessToken(streamerPage);
      if (streamerAccessToken) {
        await streamerPage.request
          .post(`/api/rooms/${roomId}/moderation`, {
            headers: {
              Authorization: `Bearer ${streamerAccessToken}`,
              "Content-Type": "application/json",
            },
            data: {
              targetUserId: memberUserId,
              action: "unban",
            },
            failOnStatusCode: false,
          })
          .catch(() => {});
      }
    }

    if (!streamerPage.isClosed()) {
      const canStop = await stopButton.isVisible().catch(() => false);
      if (canStop) {
        await stopButton.click();
        await expect(startButton).toBeVisible({ timeout: 20_000 }).catch(() => {});
      }
    }

    await memberContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
