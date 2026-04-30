import { expect, test } from "@playwright/test";
import { fetchLiveRoomsSnapshot, fetchRoomStateSnapshot, waitForLiveRoomByStreamerName } from "./helpers/live-room";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

test("room presence appears and clears in realtime", async ({ browser, request }, testInfo) => {
  test.setTimeout(140_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();
  const startButton = streamerPage.getByRole("button", { name: /ba[sş]la/i });
  const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i });

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
      const restrictionText =
        (await streamerPage
          .locator('text=/yasak|ban|kisit|kısıt|izin|yetki|eri[sş]im|error|failed/i')
          .first()
          .textContent()
          .catch(() => null)) ?? "<none>";
      const pageSnippet = (await streamerPage.locator("main").first().innerText().catch(() => "")).slice(0, 800);
      throw new Error(
        `Cannot start stream because start button is disabled. currentUrl=${streamerPage.url()} buttonDisabled=true restrictionText=${restrictionText} pageSnippet=${pageSnippet}`,
      );
    }

    await startButton.click();
    await expect(stopButton).toBeVisible({ timeout: 20_000 });
    const startedRoom = await waitForLiveRoomByStreamerName(request, /Eda/i);
    const startedRoomState = await fetchRoomStateSnapshot(request, startedRoom.id);
    expect(
      startedRoomState.ok && (startedRoomState.payload as { isLive?: boolean } | null)?.isLive === true,
      `room state not live after start: ${JSON.stringify(startedRoomState)}`,
    ).toBeTruthy();

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

    await memberPage.goto("/member");
    await expect(memberPage).toHaveURL(/\/member(?:\/|$)/);
    const refreshedRoom = await waitForLiveRoomByStreamerName(request, /Eda/i);

    const roomLink = memberPage.locator(`a[href="/rooms/${refreshedRoom.id}"]`).first();
    try {
      await expect(roomLink).toBeVisible({ timeout: 30_000 });
    } catch (error) {
      const liveRoomsSnapshot = await fetchLiveRoomsSnapshot(request).catch(() => ({ rooms: [] }));
      throw new Error(
        `Room link not visible for room ${refreshedRoom.id}. URL=${memberPage.url()} liveRooms=${JSON.stringify(liveRoomsSnapshot)} error=${String(error)}`,
      );
    }
    await Promise.all([
      memberPage.waitForURL(new RegExp(`/rooms/${refreshedRoom.id}(?:$|[/?#])`), { timeout: 30_000 }),
      roomLink.click(),
    ]);
    await expect(memberPage).toHaveURL(new RegExp(`/rooms/${refreshedRoom.id}$`), { timeout: 30_000 });
    const roomStateOnMemberJoin = await fetchRoomStateSnapshot(request, refreshedRoom.id);
    expect(
      roomStateOnMemberJoin.ok && (roomStateOnMemberJoin.payload as { isLive?: boolean } | null)?.isLive === true,
      `room state not live on member join: ${JSON.stringify(roomStateOnMemberJoin)}`,
    ).toBeTruthy();

    await expect(memberPage.getByRole("heading", { name: /Yayinci Eda|Eda/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(memberPage.getByTestId("viewer-gift-panel")).toHaveCount(0);

    const viewerPresenceSection = memberPage.getByTestId("room-presence-panel").first();
    await expect(viewerPresenceSection).toBeVisible({ timeout: 15_000 });

    const studioPresenceSection = streamerPage.getByTestId("room-presence-panel").first();
    await expect(studioPresenceSection).toBeVisible({ timeout: 15_000 });
    const memberPresenceRow = studioPresenceSection.getByTestId("room-presence-user").filter({ hasText: /Üye Veli|Uye Veli|Veli/i }).first();
    try {
      await expect(memberPresenceRow).toBeVisible({
        timeout: 45_000,
      });
    } catch (error) {
      const presenceErrorText = (await streamerPage.getByTestId("room-presence-error").first().textContent().catch(() => null)) ?? "none";
      const roomStateSnapshot = await fetchRoomStateSnapshot(request, refreshedRoom.id).catch(() => null);
      const panelSnippet = (await studioPresenceSection.innerText().catch(() => "")).slice(0, 600);
      const pageSnippet = (await streamerPage.locator("main").first().innerText().catch(() => "")).slice(0, 600);
      throw new Error(
        `Member presence missing. roomId=${refreshedRoom.id} presenceError=${presenceErrorText} roomState=${JSON.stringify(roomStateSnapshot)} panelSnippet=${panelSnippet} pageSnippet=${pageSnippet} original=${String(error)}`,
      );
    }
    await expect(studioPresenceSection.getByTestId("room-presence-user").filter({ hasText: /Yayıncı Eda|Yayinci Eda|Eda/i }).first()).toBeVisible({
      timeout: 45_000,
    });

    await memberPage.goto("/member");
    await expect(memberPage).toHaveURL(/\/member(?:\/|$)/, { timeout: 10_000 });
    await expect(studioPresenceSection).toBeVisible({ timeout: 15_000 });
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
