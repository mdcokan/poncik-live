import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = "admin@test.com";
const PASSWORD = "123123";
const PACKAGE_NAME = "Playwright 100 dk";

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

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login(?:\/|$)/);
  await fillWithFallback(page.getByLabel(/email/i), page.locator('input[type="email"]'), ADMIN_EMAIL);
  await fillWithFallback(
    page.getByLabel(/s[ıi]fre|[şs]ifre|password/i),
    page.locator('input[type="password"]'),
    PASSWORD,
  );
  await page.getByRole("button", { name: /giri[sş]\s*yap/i }).first().click();
  await page.waitForURL(/\/admin(?:\/|$)/, { timeout: 20_000 });
}

async function createPackage(page: import("@playwright/test").Page) {
  await page.getByTestId("package-create-name").fill(PACKAGE_NAME);
  await page.getByTestId("package-create-type").selectOption("minute");
  await page.getByTestId("package-create-amount").fill("100");
  await page.getByTestId("package-create-price").fill("99");
  await page.getByTestId("package-create-sort-order").fill("999");
  await page.getByTestId("package-create-is-active").check();
  await page.getByTestId("package-create-submit").click();
}

test("admin can create and deactivate purchase package", async ({ page }) => {
  test.setTimeout(180_000);

  await loginAsAdmin(page);
  await page.goto("/admin/packages");
  await expect(page).toHaveURL(/\/admin\/packages(?:\/|$)/);
  await expect(page.getByRole("heading", { name: /Dakika \/ Sure Paketleri/i })).toBeVisible();
  await expect(page.getByTestId("packages-table")).toBeVisible();

  const table = page.getByTestId("packages-table");
  const existingRow = page.locator("tbody tr").filter({ has: page.locator(`input[type="text"][value="${PACKAGE_NAME}"]`) }).first();
  if ((await existingRow.count()) > 0) {
    await existingRow.getByRole("button", { name: /Pasife Al/i }).click();
  }

  await createPackage(page);
  await expect(table.locator(`input[type="text"][value="${PACKAGE_NAME}"]`).first()).toBeVisible({ timeout: 60_000 });

  const targetRow = page.locator("tbody tr").filter({ has: page.locator(`input[type="text"][value="${PACKAGE_NAME}"]`) }).first();
  await expect(targetRow).toContainText(/Aktif/i, { timeout: 20_000 });

  await targetRow.getByRole("button", { name: /Pasife Cek/i }).first().click();
  await expect(targetRow).toContainText(/Pasif/i, { timeout: 20_000 });
});
