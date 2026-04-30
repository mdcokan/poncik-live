import { expect, test } from "@playwright/test";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const ADMIN_EMAIL = "admin@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";
const TARGET_MEMBER_NAME_REGEX = /[uü]ye\s*veli/i;
const STREAMER_NAME_REGEX = /eda/i;

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
    loginPath: "/login" | "/streamer-login";
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

async function loginMemberAllowRestricted(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await fillWithFallback(page.getByLabel(/email/i), page.locator('input[type="email"]'), email);
  await fillWithFallback(page.getByLabel(/s[ıi]fre|[şs]ifre|password/i), page.locator('input[type="password"]'), password);
  await page.getByRole("button", { name: /giri[sş]\s*yap/i }).first().click();
  await page.waitForURL(/\/(member|login)(?:\/|$)/, { timeout: 20_000 });
}

test("admin kullanıcı yönetimi ban/unban ve rol güncelleme", async ({ browser, request }) => {
  test.setTimeout(240_000);
  await normalizeTestFixtures(request);

  const adminContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const memberContextAfterUnban = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const memberPage = await memberContext.newPage();
  const memberPageAfterUnban = await memberContextAfterUnban.newPage();

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

    await veliRow.locator("select").first().selectOption("viewer");
    const roleUpdateResponsePromise = adminPage.waitForResponse(
      (response) => response.url().includes("/api/admin/users/action") && response.request().method() === "POST",
      { timeout: 20_000 },
    );
    await veliRow.getByRole("button", { name: /rol[üu]\s*g[üu]ncelle/i }).first().click();
    expect((await roleUpdateResponsePromise).ok()).toBeTruthy();

    await adminPage.goto("/admin/users");
    await searchInput.fill("Veli");
    await adminPage.getByRole("button", { name: /ara/i }).first().click();
    const veliRowForBan = adminPage.locator("tr").filter({ hasText: TARGET_MEMBER_NAME_REGEX }).first();
    await expect(veliRowForBan).toBeVisible({ timeout: 20_000 });
    const banToggleButton = veliRowForBan.getByRole("button", { name: /banla|ban[ıi]\s*kald[ıi]r/i }).first();
    const banToggleText = ((await banToggleButton.textContent()) ?? "").toLowerCase();
    const firstBanToggleResponse = adminPage.waitForResponse(
      (response) => response.url().includes("/api/admin/users/action") && response.request().method() === "POST",
      { timeout: 20_000 },
    );
    await banToggleButton.click();
    expect((await firstBanToggleResponse).ok()).toBeTruthy();
    if (banToggleText.includes("kald")) {
      await adminPage.goto("/admin/users");
      await searchInput.fill("Veli");
      await adminPage.getByRole("button", { name: /ara/i }).first().click();
      const veliRowForSecondBan = adminPage.locator("tr").filter({ hasText: TARGET_MEMBER_NAME_REGEX }).first();
      await expect(veliRowForSecondBan).toBeVisible({ timeout: 20_000 });
      const secondBanResponse = adminPage.waitForResponse(
        (response) => response.url().includes("/api/admin/users/action") && response.request().method() === "POST",
        { timeout: 20_000 },
      );
      await veliRowForSecondBan.getByRole("button", { name: /banla/i }).first().click();
      expect((await secondBanResponse).ok()).toBeTruthy();
    }

    await loginMemberAllowRestricted(memberPage, MEMBER_EMAIL, PASSWORD);
    await memberPage.goto("/member");
    await expect(memberPage).toHaveURL(/\/member(?:\/|$)/);
    const bannedAlert = memberPage.getByTestId("member-banned-alert");
    await expect(bannedAlert).toBeVisible({ timeout: 20_000 });
    await expect(bannedAlert).toContainText("Hesabınız kısıtlanmıştır.");

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

    await login(memberPageAfterUnban, {
      loginPath: "/login",
      email: MEMBER_EMAIL,
      password: PASSWORD,
      successUrl: /\/member(?:\/|$)/,
    });
    await memberPageAfterUnban.goto("/member");
    await memberPageAfterUnban.reload();
    await expect(memberPageAfterUnban.getByTestId("member-banned-alert")).toHaveCount(0);
    await expect(
      memberPageAfterUnban.getByText(/dakika bakiyem|online yay[ıi]nc[ıi]lar/i).first(),
    ).toBeVisible({ timeout: 20_000 });

    await adminPage.goto("/admin/users");
    await searchInput.fill("Eda");
    await adminPage.getByRole("button", { name: /ara/i }).first().click();
    const edaRow = adminPage.locator("tr").filter({ hasText: STREAMER_NAME_REGEX }).first();
    await expect(edaRow).toBeVisible({ timeout: 20_000 });
    await expect(edaRow.getByText(/streamer/i).first()).toBeVisible();

    await searchInput.fill("Veli");
    await adminPage.getByRole("button", { name: /ara/i }).first().click();
    const veliCleanupRow = adminPage.locator("tr").filter({ hasText: TARGET_MEMBER_NAME_REGEX }).first();
    await veliCleanupRow.locator("select").first().selectOption("viewer");
    await veliCleanupRow.getByRole("button", { name: /rol[üu]\s*g[üu]ncelle/i }).first().click();
    const unbanButton = veliCleanupRow.getByRole("button", { name: /ban[ıi]\s*kald[ıi]r/i }).first();
    if (await unbanButton.isVisible().catch(() => false)) {
      await unbanButton.click();
    }
  } finally {
    await normalizeTestFixtures(request).catch(() => {});
    await adminContext.close().catch(() => {});
    await memberContext.close().catch(() => {});
    await memberContextAfterUnban.close().catch(() => {});
  }
});
