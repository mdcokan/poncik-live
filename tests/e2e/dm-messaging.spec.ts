import { expect, test, type Page } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

async function extractSessionFromPage(page: Page) {
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
        const parsed = JSON.parse(raw) as {
          access_token?: string;
          user?: { id?: string };
          currentSession?: { access_token?: string; user?: { id?: string } };
        };
        const accessToken = parsed.access_token ?? parsed.currentSession?.access_token ?? null;
        const userId = parsed.user?.id ?? parsed.currentSession?.user?.id ?? null;
        if (accessToken && userId) {
          return { accessToken, userId };
        }
      } catch {
        /* ignore */
      }
    }
    return null;
  });
}

test("direct messages between member and streamer", async ({ browser, request }, testInfo) => {
  test.setTimeout(180_000);

  await normalizeTestFixtures(request);

  const marker = `dm-${Date.now()}`;
  const veliOpening = `Merhaba Eda test mesajı ${marker}`;
  const edaReply = `Merhaba Veli cevap ${marker}`;

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();

  try {
    await loginWithStabilizedAuth(
      streamerPage,
      {
        role: "streamer",
        loginPath: "/streamer-login",
        email: STREAMER_EMAIL,
        password: PASSWORD,
        successUrl: /\/(streamer|studio)(?:\/|$)/,
        targetUrl: "/streamer",
        successIndicator: streamerPage.getByRole("heading", { name: /Yayinci Ana Ekran/i }),
      },
      testInfo,
    );

    const streamerSession = await extractSessionFromPage(streamerPage);
    expect(streamerSession?.userId).toBeTruthy();
    const edaUserId = streamerSession!.userId;

    await loginWithStabilizedAuth(
      memberPage,
      {
        role: "member",
        loginPath: "/login",
        email: MEMBER_EMAIL,
        password: PASSWORD,
        successUrl: /\/member(?:\/|$)/,
        targetUrl: "/member",
        successIndicator: memberPage.getByTestId("member-section-home"),
      },
      testInfo,
    );

    const memberSession = await extractSessionFromPage(memberPage);
    expect(memberSession?.accessToken).toBeTruthy();

    const sendResponse = await request.post("/api/dm/messages", {
      headers: {
        Authorization: `Bearer ${memberSession!.accessToken}`,
        "Content-Type": "application/json",
      },
      data: {
        receiverId: edaUserId,
        body: veliOpening,
      },
    });
    expect(sendResponse.ok()).toBeTruthy();

    await memberPage.goto("/member");
    await memberPage.getByTestId("member-sidebar-messages").click();
    const memberDm = memberPage.getByTestId("dm-panel");
    await expect(memberDm).toBeVisible();
    await expect(memberDm.getByTestId("dm-conversation-row").filter({ hasText: "Yayıncı Eda" })).toBeVisible({
      timeout: 20_000,
    });
    await memberDm.getByTestId("dm-conversation-row").filter({ hasText: "Yayıncı Eda" }).click();
    await expect(memberDm.getByTestId("dm-message-list")).toContainText(marker, { timeout: 15_000 });

    await streamerPage.goto("/streamer");
    await streamerPage.getByTestId("streamer-sidebar-messages").click();
    const streamerDm = streamerPage.getByTestId("dm-panel");
    await expect(streamerDm).toBeVisible();
    await expect(streamerDm.getByTestId("dm-conversation-row").filter({ hasText: "Üye Veli" })).toBeVisible({
      timeout: 20_000,
    });
    await streamerDm.getByTestId("dm-conversation-row").filter({ hasText: "Üye Veli" }).click();
    await expect(streamerDm.getByTestId("dm-message-list")).toContainText(marker, { timeout: 15_000 });

    await streamerDm.getByTestId("dm-message-input").fill(edaReply);
    await streamerDm.getByTestId("dm-send-button").click();
    await expect(streamerDm.getByTestId("dm-message-list")).toContainText(edaReply, { timeout: 15_000 });

    await expect(memberDm.getByTestId("dm-message-list")).toContainText(edaReply, { timeout: 25_000 });
  } finally {
    await streamerContext.close();
    await memberContext.close();
  }
});
