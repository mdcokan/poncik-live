import { expect, test } from "@playwright/test";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const ADMIN_EMAIL = "admin@test.com";
const PASSWORD = "123123";
const TARGET_MEMBER_NAME_REGEX = /[uü]ye\s*veli/i;

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
    loginPath: "/login";
    email: string;
    password: string;
    successUrl: RegExp;
  },
) {
  await page.goto(opts.loginPath);
  await fillWithFallback(page.getByLabel(/email/i), page.locator('input[type="email"]'), opts.email);
  await fillWithFallback(page.getByLabel(/s[ıi]fre|[şs]ifre|password/i), page.locator('input[type="password"]'), opts.password);
  await page.getByRole("button", { name: /giri[sş]\s*yap/i }).first().click();
  await page.waitForURL(opts.successUrl, { timeout: 20_000 });
}

test("admin logs filters and target user links work", async ({ browser, request }) => {
  test.setTimeout(240_000);
  await normalizeTestFixtures(request);

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await login(page, {
      loginPath: "/login",
      email: ADMIN_EMAIL,
      password: PASSWORD,
      successUrl: /\/admin(?:\/|$)/,
    });

    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/admin\/users(?:\/|$)/);
    const searchInput = page.getByPlaceholder(/kullan[ıi]c[ıi]\s*ara/i).first();
    await searchInput.fill("Veli");
    await page.getByRole("button", { name: /ara/i }).first().click();

    const veliRow = page.locator("tr").filter({ hasText: TARGET_MEMBER_NAME_REGEX }).first();
    await expect(veliRow).toBeVisible({ timeout: 20_000 });

    const banResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/admin/users/action") && response.request().method() === "POST",
      { timeout: 20_000 },
    );
    await veliRow.getByRole("button", { name: /banla/i }).first().click();
    expect((await banResponsePromise).ok()).toBeTruthy();

    await page.goto("/admin/users");
    await searchInput.fill("Veli");
    await page.getByRole("button", { name: /ara/i }).first().click();
    const veliRowAfterBan = page.locator("tr").filter({ hasText: TARGET_MEMBER_NAME_REGEX }).first();
    await expect(veliRowAfterBan).toBeVisible({ timeout: 20_000 });

    const unbanResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/admin/users/action") && response.request().method() === "POST",
      { timeout: 20_000 },
    );
    await veliRowAfterBan.getByRole("button", { name: /ban[ıi]\s*kald[ıi]r/i }).first().click();
    expect((await unbanResponsePromise).ok()).toBeTruthy();

    await page.goto("/admin/logs");
    await expect(page).toHaveURL(/\/admin\/logs(?:\/|$)/);
    await expect(page.getByText(/Kullan[ıi]c[ıi]\s*banland[ıi]/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Kullan[ıi]c[ıi]\s*ban[ıi]\s*kald[ıi]r[ıi]ld[ıi]/i).first()).toBeVisible({ timeout: 20_000 });

    const logsPanel = page.locator("section").filter({ hasText: /[iİ]şlem Ge[çc]mi[şs]i/i }).first();
    await logsPanel.getByPlaceholder(/a[çc][ıi]klama veya i[şs]lem ara/i).fill("ban");
    await logsPanel.getByRole("button", { name: /^yenile$/i }).first().click();
    await expect(page.getByText(/Kullan[ıi]c[ıi]\s*banland[ıi]/i).first()).toBeVisible({ timeout: 20_000 });

    await logsPanel.getByLabel(/[iİ]şlem tipi/i).selectOption("user_banned");
    await logsPanel.getByRole("button", { name: /^yenile$/i }).first().click();
    await expect(page.locator("tbody").getByText(/user_banned/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Kullan[ıi]c[ıi]\s*banland[ıi]/i).first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("link", { name: TARGET_MEMBER_NAME_REGEX }).first().click();
    await expect(page).toHaveURL(/\/admin\/users\/[^/]+$/, { timeout: 20_000 });
    await expect(page.getByText(TARGET_MEMBER_NAME_REGEX).first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await normalizeTestFixtures(request).catch(() => {});
    await context.close().catch(() => {});
  }
});
