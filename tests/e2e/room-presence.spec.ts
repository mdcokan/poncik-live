import { expect, test } from "@playwright/test";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

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

async function readPresenceCount(section: import("@playwright/test").Locator) {
  const countBadge = section.locator("span").filter({ hasText: /^\d+$/ }).first();
  await expect(countBadge).toBeVisible({ timeout: 15_000 });
  const raw = (await countBadge.textContent())?.trim() ?? "";
  const count = Number.parseInt(raw, 10);
  return Number.isFinite(count) ? count : 0;
}

test("room presence appears and clears in realtime", async ({ browser }) => {
  test.setTimeout(140_000);

  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();
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
      await expect(streamerPage).toHaveURL(/\/studio(?:\/|$)/, { timeout: 10_000 });
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

    const edaCardLink = memberPage
      .locator('a[href^="/rooms/"]')
      .filter({ hasText: /Yayıncı Eda|Yayinci Eda/i })
      .first();
    await expect(edaCardLink).toBeVisible({ timeout: 25_000 });
    const roomHref = await edaCardLink.getAttribute("href");
    await expect(roomHref ?? "").toMatch(/^\/rooms\/.+/);
    await Promise.all([memberPage.waitForURL(/\/rooms\/[^/]+$/, { timeout: 30_000 }), edaCardLink.click()]);

    await expect(memberPage.getByRole("heading", { name: /Yayinci Eda|Eda/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    const viewerPanel = memberPage.locator("aside").first();
    const viewerPresenceSection = viewerPanel.locator("section").filter({ hasText: /Odadakiler/i }).first();
    await expect(viewerPresenceSection).toBeVisible({ timeout: 15_000 });
    const studioPanel = streamerPage.locator("aside").first();
    const studioPresenceSection = studioPanel.locator("section").filter({ hasText: /Odadakiler/i }).first();
    await expect(studioPresenceSection).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => readPresenceCount(studioPresenceSection), { timeout: 25_000 }).toBeGreaterThanOrEqual(2);

    await memberPage.goto("/member");
    await expect(memberPage).toHaveURL(/\/member(?:\/|$)/, { timeout: 10_000 });
    await expect.poll(() => readPresenceCount(studioPresenceSection), { timeout: 40_000 }).toBeLessThanOrEqual(1);
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
