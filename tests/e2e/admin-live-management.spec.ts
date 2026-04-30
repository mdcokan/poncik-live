import { expect, test } from "@playwright/test";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const ADMIN_EMAIL = "admin@test.com";
const PASSWORD = "123123";
const TEST_MESSAGE = "Admin live test mesajı";

async function fillWithFallback(
  primary: import("@playwright/test").Locator,
  fallback: import("@playwright/test").Locator,
  value: string,
) {
  if ((await primary.count()) > 0) {
    await primary.first().fill(value);
    return;
  }

  await fallback.first().fill(value);
}

async function login(
  page: import("@playwright/test").Page,
  opts: {
    loginPath: "/streamer-login" | "/login";
    email: string;
    password: string;
    successUrl: RegExp;
  },
) {
  await page.goto(opts.loginPath);
  await expect(page).toHaveURL(new RegExp(`${opts.loginPath.replace("/", "\\/")}$`));

  await fillWithFallback(page.getByLabel(/email/i), page.locator('input[type="email"]'), opts.email);
  await fillWithFallback(
    page.getByLabel(/s[ıi]fre|[şs]ifre|password/i),
    page.locator('input[type="password"]'),
    opts.password,
  );

  await page.getByRole("button", { name: /giri[sş]\s*yap/i }).first().click();
  await page.waitForURL(opts.successUrl, { timeout: 20_000 });
}

test("admin canlı yayınları görüp yayını kapatabilir", async ({ browser, request }) => {
  test.setTimeout(180_000);
  await normalizeTestFixtures(request);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const adminContext = await browser.newContext();

  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();
  const adminPage = await adminContext.newPage();

  const startButton = streamerPage.getByRole("button", { name: /ba[sş]la/i });
  const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i });

  try {
    await login(streamerPage, {
      loginPath: "/streamer-login",
      email: STREAMER_EMAIL,
      password: PASSWORD,
      successUrl: /\/(streamer|studio)(?:\/|$)/,
    });

    if (!/\/studio(?:\/)?$/.test(streamerPage.url())) {
      await streamerPage.goto("/studio");
      await expect(streamerPage).toHaveURL(/\/studio(?:\/|$)/);
    }

    if (await stopButton.isVisible().catch(() => false)) {
      await stopButton.click();
      await expect(startButton).toBeVisible({ timeout: 20_000 });
    }

    await startButton.click();
    await expect(stopButton).toBeVisible({ timeout: 20_000 });

    await login(memberPage, {
      loginPath: "/login",
      email: MEMBER_EMAIL,
      password: PASSWORD,
      successUrl: /\/member(?:\/|$)/,
    });

    await memberPage.goto("/member");
    await expect(memberPage).toHaveURL(/\/member(?:\/|$)/);

    const roomLink = memberPage
      .locator('a[href^="/rooms/"]')
      .filter({ hasText: /Yayıncı Eda|Yayinci Eda/i })
      .first();
    await expect(roomLink).toBeVisible({ timeout: 25_000 });
    const roomHref = await roomLink.getAttribute("href");
    if (!roomHref || !/^\/rooms\/.+/.test(roomHref)) {
      throw new Error(`Yayina gir linki bulunamadi veya href gecersiz. href=${roomHref ?? "<null>"}`);
    }
    await Promise.all([memberPage.waitForURL(/\/rooms\/[^/]+$/, { timeout: 30_000 }), roomLink.click()]);
    await expect(memberPage).toHaveURL(/\/rooms\/[^/]+$/);
    const memberRoomUrl = memberPage.url();
    const roomId = memberRoomUrl.split("/rooms/")[1] ?? "";
    if (!roomId) {
      throw new Error("Uye oda id bilgisi alinamadi.");
    }

    const messageInput = memberPage.getByPlaceholder(/Mesaj.*yaz/i).first();
    await messageInput.fill(TEST_MESSAGE);
    await memberPage.getByRole("button", { name: /g[oö]nder/i }).first().click();
    await expect(memberPage.getByText(TEST_MESSAGE).first()).toBeVisible({ timeout: 20_000 });

    await login(adminPage, {
      loginPath: "/login",
      email: ADMIN_EMAIL,
      password: PASSWORD,
      successUrl: /\/admin(?:\/|$)/,
    });

    await adminPage.goto("/admin/live");
    await expect(adminPage).toHaveURL(/\/admin\/live(?:\/|$)/);

    const targetRoomCard = adminPage.locator(`article:has(a[href="/rooms/${roomId}"])`).first();
    await expect(targetRoomCard).toBeVisible({ timeout: 25_000 });
    await expect(targetRoomCard.getByText(/Eda/i).first()).toBeVisible();
    await expect(targetRoomCard.getByText(/Odadakiler:\s*\d+\s*ki[sş]i/i).first()).toBeVisible();
    await expect(targetRoomCard.getByText(TEST_MESSAGE).first()).toBeVisible({ timeout: 25_000 });

    adminPage.once("dialog", async (dialog) => {
      await dialog.accept();
    });
    const closeResponsePromise = adminPage.waitForResponse(
      (response) => response.url().includes("/api/admin/live/close") && response.request().method() === "POST",
      { timeout: 30_000 },
    );
    await targetRoomCard.getByRole("button", { name: /Yay[ıi]n[ıi]\s*Kapat/i }).first().click();
    const closeResponse = await closeResponsePromise;
    const closePayload = (await closeResponse.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (!closeResponse.ok() || !closePayload.ok) {
      throw new Error(
        `Admin close API failed. status=${closeResponse.status()} message=${closePayload.message ?? "<none>"}`,
      );
    }

    await expect(adminPage.locator(`a[href="/rooms/${roomId}"]`).first()).toBeHidden({ timeout: 30_000 });
    const emptyState = adminPage.getByText(/Canl[ıi]\s*oda\s*yok/i).first();
    if (await emptyState.isVisible().catch(() => false)) {
      await expect(emptyState).toBeVisible();
    }

    const roomClosedMessage = memberPage
      .getByText(/Bu yayın şu an kapalı|Bu yayin su an kapali|Oda bulunamadı|Oda bulunamadi/i)
      .first();
    try {
      await expect(roomClosedMessage).toBeVisible({ timeout: 30_000 });
    } catch {
      const currentUrl = memberPage.url();
      const bodyTextSnippet = ((await memberPage.locator("body").textContent()) ?? "")
        .replace(/\s+/g, " ")
        .slice(0, 400);
      const screenshotPath = test.info().outputPath("admin-close-member-state-failure.png");
      await memberPage.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      throw new Error(
        [
          "Admin close sonrası member odası offline state'e düşmedi.",
          `current URL: ${currentUrl}`,
          `body snippet: ${bodyTextSnippet || "<empty>"}`,
          `screenshot: ${screenshotPath}`,
        ].join("\n"),
      );
    }
  } finally {
    if (!streamerPage.isClosed()) {
      const canStop = await stopButton.isVisible().catch(() => false);
      if (canStop) {
        await stopButton.click().catch(() => {});
      }
    }

    await adminContext.close().catch(() => {});
    await memberContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
