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

test("member message appears in viewer and studio without refresh", async ({ browser }) => {
  test.setTimeout(120_000);

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

    const uniqueMessage = `playwright sohbet test ${Date.now()}`;
    const viewerInput = memberPage.getByPlaceholder(/Mesaj.*yaz/i).first();
    await viewerInput.fill(uniqueMessage);
    await memberPage.getByRole("button", { name: /gonder/i }).first().click();

    await expect(memberPage.getByText(uniqueMessage).first()).toBeVisible({ timeout: 20_000 });
    await expect(streamerPage.getByText(uniqueMessage).first()).toBeVisible({ timeout: 20_000 });
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
