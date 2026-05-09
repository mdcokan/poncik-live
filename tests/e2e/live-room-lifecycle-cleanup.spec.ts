import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";
import { ensureStreamerLive } from "./helpers/studio";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

test("live room and private session cleanup on stop", async ({ browser, request }, testInfo) => {
  test.setTimeout(420_000);
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
    await streamerPage.goto("/studio");

    await expect(streamerPage.getByRole("button", { name: /ba[sş]la/i }).first()).toBeVisible({ timeout: 30_000 });
    await expect(streamerPage.getByText(/yay[ıiİI]n aktif/i)).toHaveCount(0);

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
    await memberPage.goto("/member");
    await expect(memberPage.getByTestId("member-live-card").filter({ hasText: /Yayıncı Eda|Yay[ıiİI]nc[ıiİI] Eda/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    await memberPage.goto(`/rooms/${roomId}`);
    await memberPage.getByTestId("private-room-request-button").click();
    await expect(memberPage.getByTestId("private-request-feedback")).toContainText(/bekleniyor|gönderildi|gonderildi/i, {
      timeout: 30_000,
    });

    await expect(streamerPage.getByTestId("studio-private-request-accept-button").first()).toBeVisible({ timeout: 30_000 });
    await streamerPage.getByTestId("studio-private-request-accept-button").first().click();

    await expect(streamerPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });
    await expect(memberPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 30_000 });

    const privateStopLiveButton = streamerPage.getByTestId("studio-stop-live-private-button").first();
    const defaultStopLiveButton = streamerPage.getByTestId("studio-stop-live-button").first();
    const stopLiveButton = (await privateStopLiveButton.isVisible().catch(() => false))
      ? privateStopLiveButton
      : defaultStopLiveButton;
    await expect(stopLiveButton).toBeVisible({ timeout: 30_000 });
    await stopLiveButton.click();
    await expect(streamerPage.getByRole("button", { name: /ba[sş]la/i }).first()).toBeVisible({ timeout: 30_000 });

    await expect
      .poll(
        async () => {
          const response = await request.get("/api/live-rooms", { failOnStatusCode: false });
          const payload = (await response.json().catch(() => ({}))) as { rooms?: Array<{ id?: string }> };
          const rooms = Array.isArray(payload.rooms) ? payload.rooms : [];
          return rooms.some((room) => room.id === roomId);
        },
        { timeout: 30_000, message: "closed room should not appear in public live rooms after stop" },
      )
      .toBe(false);

    await expect(memberPage.getByTestId("private-session-panel")).toHaveCount(0, { timeout: 30_000 });

    await memberPage.goto("/member");
    await expect(
      memberPage.getByTestId("member-live-card").filter({ hasText: /Yayıncı Eda|Yay[ıiİI]nc[ıiİI] Eda/i }),
    ).toHaveCount(0, { timeout: 30_000 });

    await memberPage.goto(`/rooms/${roomId}`);
    await expect(memberPage.getByText(/bu yayın şu an kapalı|oda bulunamadı|oda bulunamadi/i)).toBeVisible({ timeout: 30_000 });
    await expect(memberPage.getByTestId("private-session-panel")).toHaveCount(0);

    await streamerPage.getByRole("button", { name: /ba[sş]la/i }).first().click();
    await expect(streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i }).first()).toBeVisible({ timeout: 30_000 });

    await memberPage.goto(`/rooms/${roomId}`);
    await expect(memberPage.getByTestId("private-session-panel")).toHaveCount(0);
    await expect(memberPage.getByTestId("room-chat-message")).toHaveCount(0);
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
