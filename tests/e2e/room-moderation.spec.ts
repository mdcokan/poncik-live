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

async function extractUserId(page: import("@playwright/test").Page) {
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
      | { user?: { id?: string }; currentSession?: { user?: { id?: string } } }
      | null;
    return parsed?.user?.id ?? parsed?.currentSession?.user?.id ?? null;
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

    const streamerTokenEarly = await extractAccessToken(streamerPage);
    const memberIdEarly = await extractUserId(memberPage);
    if (streamerTokenEarly && memberIdEarly) {
      for (const action of ["unmute", "unban"] as const) {
        await request.post(`/api/rooms/${roomId}/moderation`, {
          headers: {
            Authorization: `Bearer ${streamerTokenEarly}`,
            "Content-Type": "application/json",
          },
          data: { targetUserId: memberIdEarly, action },
          failOnStatusCode: false,
        });
      }
    }

    await expect(memberPage.getByPlaceholder(/Mesaj/i).first()).toBeEnabled({ timeout: 20_000 });

    const initialMessage = `moderasyon test mesajı ${Date.now()}`;
    await memberPage.getByPlaceholder(/Mesaj/i).first().fill(initialMessage);
    await memberPage.getByRole("button", { name: /Gonder/i }).first().click();
    await expect(memberPage.getByText(initialMessage).first()).toBeVisible({ timeout: 20_000 });

    const presencePanel = streamerPage.getByTestId("room-presence-panel").first();
    const memberRow = presencePanel.getByTestId("room-presence-user").filter({ hasText: /Üye Veli|Uye Veli|Veli/i }).first();
    await expect(memberRow).toBeVisible({ timeout: 25_000 });
    const memberActions = memberRow.locator('[data-testid^="presence-actions-"]').first();
    await expect(memberActions).toBeVisible({ timeout: 25_000 });
    const actionsTestId = await memberActions.getAttribute("data-testid");
    memberUserId = actionsTestId?.replace("presence-actions-", "") ?? "";

    const moderationPostMatches = (response: import("@playwright/test").Response) =>
      response.url().includes(`/api/rooms/${roomId}/moderation`) && response.request().method() === "POST";

    if (await memberRow.getByTestId("unmute-user-button").isVisible().catch(() => false)) {
      const resetResponsePromise = streamerPage.waitForResponse(moderationPostMatches, { timeout: 20_000 });
      await memberRow.getByTestId("unmute-user-button").click();
      const resetResponse = await resetResponsePromise;
      const resetBody = await resetResponse.text();
      expect(resetResponse.ok(), `pre-clean unmute: status=${resetResponse.status()} body=${resetBody}`).toBeTruthy();
      await expect(memberRow.getByTestId("mute-user-button")).toBeVisible({ timeout: 15_000 });
    }

    const muteResponsePromise = streamerPage.waitForResponse(moderationPostMatches, { timeout: 20_000 });
    await memberRow.getByTestId("mute-user-button").click();
    const muteResponse = await muteResponsePromise;
    const muteBody = await muteResponse.text();
    expect(muteResponse.ok(), `mute response: status=${muteResponse.status()} body=${muteBody}`).toBeTruthy();
    await memberPage.reload({ waitUntil: "domcontentloaded" });
    await expect(memberPage.getByPlaceholder(/Mesaj/i).first()).toBeDisabled({ timeout: 20_000 });

    await expect(memberRow.getByTestId("unmute-user-button")).toBeVisible({ timeout: 15_000 });
    const unmuteResponsePromise = streamerPage.waitForResponse(moderationPostMatches, { timeout: 20_000 });
    await memberRow.getByTestId("unmute-user-button").click();
    const unmuteResponse = await unmuteResponsePromise;
    const unmuteBody = await unmuteResponse.text();
    expect(unmuteResponse.ok(), `unmute response: status=${unmuteResponse.status()} body=${unmuteBody}`).toBeTruthy();
    await memberPage.reload({ waitUntil: "domcontentloaded" });
    await expect(memberPage.getByPlaceholder(/Mesaj/i).first()).toBeEnabled({ timeout: 20_000 });

    const memberRowForKick = presencePanel.getByTestId("room-presence-user").filter({ hasText: /Üye Veli|Uye Veli|Veli/i }).first();
    await expect(memberRowForKick).toBeVisible({ timeout: 25_000 });
    const kickResponsePromise = streamerPage.waitForResponse(moderationPostMatches, { timeout: 20_000 });
    await memberRowForKick.getByTestId("kick-user-button").click();
    const kickResponse = await kickResponsePromise;
    const kickBody = await kickResponse.text();
    expect(kickResponse.ok(), `kick response: status=${kickResponse.status()} body=${kickBody}`).toBeTruthy();
    await expect
      .poll(
        async () => {
          const kickNotice = memberPage.getByText(/Odadan çıkarıldınız/i).first();
          return kickNotice.isVisible().catch(() => false);
        },
        { timeout: 25_000, intervals: [200, 500, 1000] },
      )
      .toBe(true);

    await memberPage.goto(`/rooms/${roomId}`);
    await expect(memberPage).toHaveURL(new RegExp(`/rooms/${roomId}$`), { timeout: 20_000 });

    const memberRowAfterRejoin = presencePanel.getByTestId("room-presence-user").filter({ hasText: /Üye Veli|Uye Veli|Veli/i }).first();
    await expect(memberRowAfterRejoin).toBeVisible({ timeout: 25_000 });
    const memberActionsAfterRejoin = memberRowAfterRejoin.locator('[data-testid^="presence-actions-"]').first();
    await expect(memberActionsAfterRejoin).toBeVisible({ timeout: 25_000 });
    await memberActionsAfterRejoin.getByTestId("ban-user-button").click();
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
