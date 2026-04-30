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

async function readDetailBalance(page: import("@playwright/test").Page) {
  const cardText = (await page.locator("article").filter({ hasText: /dakika bakiyesi/i }).first().textContent()) ?? "";
  const match = cardText.match(/(-?\d+)\s*dk/i);
  const parsed = Number.parseInt(match?.[1] ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

test("admin kullanıcı detayından dakika/ban aksiyonları çalışır", async ({ browser, request }) => {
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
    await veliRow.getByRole("link", { name: /detay/i }).first().click();

    await expect(page).toHaveURL(/\/admin\/users\/[^/]+$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /kullan[ıi]c[ıi]\s*detay[ıi]/i }).first()).toBeVisible();
    await expect(page.getByText(TARGET_MEMBER_NAME_REGEX).first()).toBeVisible();
    await expect(page.getByText(/dakika bakiyesi/i).first()).toBeVisible();

    const balanceBefore = await readDetailBalance(page);
    await page.getByPlaceholder(/miktar/i).first().fill("10");
    await page.getByPlaceholder(/neden/i).first().fill("Playwright detay test");
    await page.getByRole("button", { name: /dakika ekle/i }).first().click();
    await expect(page.getByText(/dakika eklendi/i).first()).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(async () => readDetailBalance(page), {
        timeout: 30_000,
        message: "dakika bakiyesi +10 sonrası artmadı",
      })
      .toBeGreaterThanOrEqual(balanceBefore + 10);

    await expect(page.getByText(/Playwright detay test/i).first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /^banla$/i }).first().click();
    await expect(page.getByText(/kullan[ıi]c[ıi]\s*banland[ıi]/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/banl[ıi]/i).first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /ban[ıi]\s*kald[ıi]r/i }).first().click();
    await expect(page.getByText(/ban[ıi].*kald[ıi]r[ıi]ld[ıi]/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^aktif$/i).first()).toBeVisible({ timeout: 20_000 });

    await page.locator("select").first().selectOption("viewer");
    await page.getByRole("button", { name: /rol[üu]\s*g[üu]ncelle/i }).first().click();
  } finally {
    await normalizeTestFixtures(request).catch(() => {});
    await context.close().catch(() => {});
  }
});
