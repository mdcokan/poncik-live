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

test("admin action logs records user and wallet actions", async ({ browser, request }) => {
  test.setTimeout(240_000);
  await normalizeTestFixtures(request);

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();

  try {
    await login(adminPage, {
      loginPath: "/login",
      email: ADMIN_EMAIL,
      password: PASSWORD,
      successUrl: /\/admin(?:\/|$)/,
    });

    await adminPage.goto("/admin/users");
    await expect(adminPage).toHaveURL(/\/admin\/users(?:\/|$)/);
    const searchInput = adminPage.getByPlaceholder(/kullan[ıi]c[ıi]\s*ara/i).first();
    await searchInput.fill("Veli");
    await adminPage.getByRole("button", { name: /ara/i }).first().click();

    const veliRow = adminPage.locator("tr").filter({ hasText: TARGET_MEMBER_NAME_REGEX }).first();
    await expect(veliRow).toBeVisible({ timeout: 20_000 });

    const banResponsePromise = adminPage.waitForResponse(
      (response) => response.url().includes("/api/admin/users/action") && response.request().method() === "POST",
      { timeout: 20_000 },
    );
    await veliRow.getByRole("button", { name: /banla/i }).first().click();
    expect((await banResponsePromise).ok()).toBeTruthy();

    await adminPage.goto("/admin/users");
    await searchInput.fill("Veli");
    await adminPage.getByRole("button", { name: /ara/i }).first().click();
    const veliRowAfterBan = adminPage.locator("tr").filter({ hasText: TARGET_MEMBER_NAME_REGEX }).first();
    await expect(veliRowAfterBan).toBeVisible({ timeout: 20_000 });
    const unbanResponsePromise = adminPage.waitForResponse(
      (response) => response.url().includes("/api/admin/users/action") && response.request().method() === "POST",
      { timeout: 20_000 },
    );
    await veliRowAfterBan.getByRole("button", { name: /ban[ıi]\s*kald[ıi]r/i }).first().click();
    expect((await unbanResponsePromise).ok()).toBeTruthy();

    await adminPage.goto("/admin/logs");
    await expect(adminPage).toHaveURL(/\/admin\/logs(?:\/|$)/);
    await expect(adminPage.getByText(/Kullanıcı banlandı/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(adminPage.getByText(/Kullanıcı banı kaldırıldı/i).first()).toBeVisible({ timeout: 20_000 });

    await adminPage.goto("/admin/finance");
    await expect(adminPage).toHaveURL(/\/admin\/finance(?:\/|$)/);
    const walletRow = adminPage.locator("tr").filter({ hasText: TARGET_MEMBER_NAME_REGEX }).first();
    await expect(walletRow).toBeVisible({ timeout: 20_000 });
    await walletRow.locator('input[type="number"]').first().fill("10");
    await walletRow.locator('input[type="text"]').first().fill("Playwright +10");
    await walletRow.getByRole("button", { name: /Dakika Ekle/i }).first().click();
    await expect(adminPage.getByText(/Dakika duzenleme basariyla kaydedildi/i).first()).toBeVisible({ timeout: 20_000 });

    await adminPage.goto("/admin/logs");
    await adminPage.getByRole("button", { name: /yenile/i }).first().click();
    await expect(adminPage.getByText(/Manuel dakika eklendi/i).first()).toBeVisible({ timeout: 20_000 });

    await adminPage.goto("/admin/users");
    await searchInput.fill("Veli");
    await adminPage.getByRole("button", { name: /ara/i }).first().click();
    const veliCleanupRow = adminPage.locator("tr").filter({ hasText: TARGET_MEMBER_NAME_REGEX }).first();
    await expect(veliCleanupRow).toBeVisible({ timeout: 20_000 });
    await veliCleanupRow.locator("select").first().selectOption("viewer");
    await veliCleanupRow.getByRole("button", { name: /rol[üu]\s*g[üu]ncelle/i }).first().click();
    const unbanButton = veliCleanupRow.getByRole("button", { name: /ban[ıi]\s*kald[ıi]r/i }).first();
    if (await unbanButton.isVisible().catch(() => false)) {
      await unbanButton.click();
    }
  } finally {
    await normalizeTestFixtures(request).catch(() => {});
    await adminContext.close().catch(() => {});
  }
});
