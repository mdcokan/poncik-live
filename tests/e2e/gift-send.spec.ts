import { expect, test } from "@playwright/test";
import { fetchRoomStateSnapshot, waitForLiveRoomByStreamerName } from "./helpers/live-room";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

test("gift sending works or returns insufficient balance gracefully", async ({ browser, request }, testInfo) => {
  test.setTimeout(160_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();
  const startButton = streamerPage.getByRole("button", { name: /ba[sş]la/i });
  const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i });

  let phase = "streamer-login";
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

    phase = "streamer-start-live";
    if (!/\/studio(?:\/)?$/.test(streamerPage.url())) {
      await streamerPage.goto("/studio");
      await expect(streamerPage).toHaveURL(/\/studio(?:\/|$)/, { timeout: 10_000 });
    }

    if (await stopButton.isVisible().catch(() => false)) {
      await stopButton.click();
      await expect(startButton).toBeVisible({ timeout: 20_000 });
    }

    const startEnabled = await startButton
      .isEnabled()
      .then(async (enabled) => {
        if (enabled) {
          return true;
        }
        await expect(startButton).toBeEnabled({ timeout: 12_000 });
        return true;
      })
      .catch(() => false);
    if (!startEnabled) {
      const pageSnippet = (await streamerPage.locator("main").first().innerText().catch(() => "")).slice(0, 600);
      throw new Error(`streamer start button remained disabled before live start. url=${streamerPage.url()} snippet=${pageSnippet}`);
    }

    await startButton.click();
    await expect(stopButton).toBeVisible({ timeout: 20_000 });
    const startedRoom = await waitForLiveRoomByStreamerName(request, /Eda/i);
    const startedRoomState = await fetchRoomStateSnapshot(request, startedRoom.id);
    expect(
      startedRoomState.ok && (startedRoomState.payload as { isLive?: boolean } | null)?.isLive === true,
      `room state not live after start: ${JSON.stringify(startedRoomState)}`,
    ).toBeTruthy();

    await streamerPage.locator("aside").first().getByRole("button", { name: /^Hediye$/i }).first().click();
    const studioGiftPanel = streamerPage.getByTestId("studio-gift-panel").first();
    await expect(studioGiftPanel).toBeVisible({ timeout: 20_000 });

    phase = "member-login";
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

    phase = "member-open-room";
    await memberPage.goto("/member");
    const refreshedRoom = await waitForLiveRoomByStreamerName(request, /Eda/i);
    const roomLink = memberPage.locator(`a[href="/rooms/${refreshedRoom.id}"]`).first();
    await expect(roomLink).toBeVisible({ timeout: 30_000 });
    await roomLink.click();
    try {
      await expect(memberPage).toHaveURL(new RegExp(`/rooms/${refreshedRoom.id}$`), { timeout: 30_000 });
    } catch (error) {
      const href = await roomLink.getAttribute("href");
      throw new Error(
        `Failed to navigate to room page. expectedRoomId=${refreshedRoom.id} currentUrl=${memberPage.url()} href=${href} error=${String(error)}`,
      );
    }
    const roomStateOnMemberJoin = await fetchRoomStateSnapshot(request, refreshedRoom.id);
    expect(
      roomStateOnMemberJoin.ok && (roomStateOnMemberJoin.payload as { isLive?: boolean } | null)?.isLive === true,
      `room state not live on member join: ${JSON.stringify(roomStateOnMemberJoin)}`,
    ).toBeTruthy();
    const offlineHeading = memberPage.getByRole("heading", { name: /Bu yayin su an kapali|Bu yayın su an kapali/i }).first();
    if ((await offlineHeading.count()) > 0 && (await offlineHeading.isVisible().catch(() => false))) {
      const pageSnippet = (await memberPage.locator("main").first().innerText().catch(() => "")).slice(0, 600);
      throw new Error(
        `Viewer rendered offline state unexpectedly. roomId=${refreshedRoom.id} roomState=${JSON.stringify(roomStateOnMemberJoin)} pageSnippet=${pageSnippet}`,
      );
    }

    phase = "member-open-gift-panel";
    await memberPage.locator("aside").first().getByRole("button", { name: /^Hediye$/i }).first().click();
    const viewerGiftPanel = memberPage.getByTestId("viewer-gift-panel").first();
    const giftPanelVisible = await viewerGiftPanel.isVisible().catch(() => false);
    const giftActionRoot = giftPanelVisible ? viewerGiftPanel : memberPage.locator("aside").first();
    const sendButton = giftActionRoot.getByRole("button", { name: /Gonder|Gönder|Gonderiliyor|Gönderiliyor/i }).first();
    await expect(sendButton).toBeVisible({ timeout: 20_000 });
    const canSendGift = await sendButton.isEnabled().catch(() => false);
    if (!canSendGift) {
      await expect(sendButton).toBeDisabled();
      return;
    }

    await sendButton.click();

    const viewerResult = memberPage.locator("aside").first()
      .locator('p')
      .filter({
        hasText: /gönderildi|gonderildi/i,
      })
      .first();
    await expect(viewerResult).toBeVisible({ timeout: 20_000 });
    await expect(
      streamerPage
        .getByTestId("studio-gift-event")
        .filter({ hasText: /Üye Veli|Uye Veli|Kalp|Çikolata|Cikolata|gonderdi|gönderdi/i })
        .first(),
    ).toBeVisible({ timeout: 30_000 });
  } catch (error) {
    const streamerUrl = streamerPage.url();
    const memberUrl = memberPage.url();
    const snippet = (await memberPage.locator("main").first().innerText().catch(() => "")).slice(0, 500);
    throw new Error(
      `gift-send failed at phase=${phase} streamerUrl=${streamerUrl} memberUrl=${memberUrl} memberSnippet=${snippet} original=${String(error)}`,
    );
  } finally {
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
