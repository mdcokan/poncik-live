import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { gotoDomWithRetry } from "./helpers/navigation";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";
import { ensureStreamerLive } from "./helpers/studio";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

test.describe("in-room DM overlay", () => {
  test.describe.configure({ timeout: 480_000 });

  test("viewer and studio DM overlays exchange realtime messages", async ({ browser, request }, testInfo) => {
    test.setTimeout(480_000);
    await normalizeTestFixtures(request);

    const streamerContext = await browser.newContext();
    const memberContext = await browser.newContext();
    const streamerPage = await streamerContext.newPage();
    const memberPage = await memberContext.newPage();

    let roomId = "";

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
      await expect(memberPage.getByTestId("member-wallet-balance")).toBeVisible({ timeout: 30_000 });
      const roomCardLink = memberPage.locator(`a[href="/rooms/${roomId}"]`).first();
      await expect(roomCardLink).toBeVisible({ timeout: 45_000 });
      await gotoDomWithRetry(memberPage, `/rooms/${roomId}`);
      await expect(memberPage).toHaveURL(new RegExp(`/rooms/${roomId}$`), { timeout: 20_000 });

      const stateDeadline = Date.now() + 45_000;
      let roomStateReady = false;
      while (Date.now() < stateDeadline) {
        const res = await request.get(`/api/rooms/${roomId}/state?t=${Date.now()}`, { timeout: 10_000 });
        if (res.ok()) {
          const data = (await res.json()) as { status?: string; ownerId?: string };
          if (data.status === "live" && Boolean(data.ownerId?.length)) {
            roomStateReady = true;
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      expect(roomStateReady).toBe(true);

      const roomDmOpen = memberPage.getByTestId("room-dm-open-button");
      await expect(roomDmOpen).toBeVisible({ timeout: 15_000 });
      await expect(roomDmOpen).toBeEnabled({
        timeout: 60_000,
        message: "Mesaj Gönder etkin olmalı (ownerId yüklendi).",
      });
      await roomDmOpen.click();

      const roomOverlay = memberPage.getByTestId("room-dm-overlay");
      await expect(roomOverlay).toBeVisible({ timeout: 15_000 });
      const memberDmPanel = roomOverlay.getByTestId("dm-panel");
      await expect(memberDmPanel).toBeVisible({
        timeout: 60_000,
        message: "DM panel mounts after room ownerId hydrates in client state.",
      });

      const marker = `room-dm-${Date.now()}`;
      await memberDmPanel.getByTestId("dm-message-input").fill(marker);
      await memberDmPanel.getByTestId("dm-send-button").click();
      await expect(memberDmPanel.getByTestId("dm-message-list")).toContainText(marker, { timeout: 30_000 });

      const studioOpen = streamerPage.getByTestId("studio-dm-open-button");
      await expect(studioOpen).toBeVisible({ timeout: 15_000 });
      await studioOpen.click();

      const studioOverlay = streamerPage.getByTestId("studio-dm-overlay");
      await expect(studioOverlay).toBeVisible({ timeout: 15_000 });
      const studioDm = studioOverlay.getByTestId("dm-panel");
      await expect(studioDm).toBeVisible();

      const veliRow = studioDm.getByTestId("dm-conversation-row").filter({ hasText: /Veli/i });
      await expect(veliRow).toBeVisible({ timeout: 30_000 });
      await veliRow.click();
      await expect(studioDm.getByTestId("dm-message-list")).toContainText(marker, { timeout: 30_000 });

      const reply = `studio-dm-reply-${Date.now()}`;
      await studioDm.getByTestId("dm-message-input").fill(reply);
      await studioDm.getByTestId("dm-send-button").click();
      await expect(studioDm.getByTestId("dm-message-list")).toContainText(reply, { timeout: 30_000 });

      await memberPage.bringToFront();
      const viewerOverlay = memberPage.getByTestId("room-dm-overlay");
      if (await viewerOverlay.isVisible().catch(() => false)) {
        await memberPage.getByTestId("room-dm-close-button").click();
      }
      await expect(memberPage.getByTestId("room-dm-overlay")).toHaveCount(0, { timeout: 10_000 });
      await memberPage.getByTestId("room-dm-open-button").click();
      await expect(memberPage.getByTestId("room-dm-overlay")).toBeVisible({ timeout: 20_000 });
      const overlayAfterReload = memberPage.getByTestId("room-dm-overlay");
      await expect(overlayAfterReload.getByTestId("dm-message-list")).toContainText(marker, { timeout: 30_000 });
      await expect(overlayAfterReload.getByTestId("dm-message-list")).toContainText(reply, { timeout: 30_000 });

      await memberPage.getByTestId("room-dm-close-button").click();
      await expect(memberPage.getByTestId("room-dm-overlay")).toHaveCount(0, { timeout: 10_000 });
      await expect(memberPage).toHaveURL(new RegExp(`/rooms/${roomId}$`));
    } finally {
      if (!streamerPage.isClosed()) {
        const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i }).first();
        if (await stopButton.isVisible().catch(() => false)) {
          await stopButton.click().catch(() => {});
        }
      }
      await normalizeTestFixtures(request).catch(() => {});
      await memberContext.close().catch(() => {});
      await streamerContext.close().catch(() => {});
    }
  });
});
