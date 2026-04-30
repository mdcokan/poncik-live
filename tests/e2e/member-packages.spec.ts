import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = "admin@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";
const PACKAGE_NAME = "Playwright Member 100 dk";

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
    email: string;
    password: string;
    successUrl: RegExp;
  },
) {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login(?:\/|$)/);
  await fillWithFallback(page.getByLabel(/email/i), page.locator('input[type="email"]'), opts.email);
  await fillWithFallback(
    page.getByLabel(/s[ıi]fre|[şs]ifre|password/i),
    page.locator('input[type="password"]'),
    opts.password,
  );
  await page.getByRole("button", { name: /giri[sş]\s*yap/i }).first().click();
  await page.waitForURL(opts.successUrl, { timeout: 20_000 });
}

function packageRows(page: import("@playwright/test").Page) {
  return page.locator("tbody tr").filter({ has: page.locator(`input[type="text"][value="${PACKAGE_NAME}"]`) });
}

async function deactivateMatchingPackages(page: import("@playwright/test").Page) {
  const rows = packageRows(page);
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const rowText = (await row.textContent()) ?? "";
    if (/Aktif/i.test(rowText)) {
      const deactivateButton = row.getByRole("button", { name: /Pasife Cek|Pasife Al/i }).first();
      await deactivateButton.click();
      await expect(row).toContainText(/Pasif/i, { timeout: 20_000 });
    }
  }
}

test("member sees active package and hidden when package is deactivated", async ({ browser }) => {
  test.setTimeout(200_000);

  const adminContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const memberPage = await memberContext.newPage();

  try {
    await login(adminPage, {
      email: ADMIN_EMAIL,
      password: PASSWORD,
      successUrl: /\/admin(?:\/|$)/,
    });
    await adminPage.goto("/admin/packages");
    await expect(adminPage).toHaveURL(/\/admin\/packages(?:\/|$)/);
    await expect(adminPage.getByTestId("packages-table")).toBeVisible();

    await deactivateMatchingPackages(adminPage);

    await adminPage.getByTestId("package-create-name").fill(PACKAGE_NAME);
    await adminPage.getByTestId("package-create-type").selectOption("minute");
    await adminPage.getByTestId("package-create-amount").fill("100");
    await adminPage.getByTestId("package-create-price").fill("99");
    await adminPage.getByTestId("package-create-sort-order").fill("998");
    await adminPage.getByTestId("package-create-is-active").check();
    await adminPage.getByTestId("package-create-submit").click();

    const createdRow = packageRows(adminPage).first();
    await expect(createdRow).toBeVisible({ timeout: 30_000 });
    await expect(createdRow).toContainText(/Aktif/i, { timeout: 20_000 });

    await login(memberPage, {
      email: MEMBER_EMAIL,
      password: PASSWORD,
      successUrl: /\/member(?:\/|$)/,
    });
    await memberPage.goto("/member");
    await expect(memberPage).toHaveURL(/\/member(?:\/|$)/);

    await memberPage.getByTestId("open-member-packages").click();
    await expect(memberPage.getByTestId("member-packages-modal")).toBeVisible();
    await expect(memberPage.getByRole("heading", { name: "Dakika Paketleri" })).toBeVisible();
    await expect(memberPage.getByText(PACKAGE_NAME)).toBeVisible({ timeout: 20_000 });

    await memberPage.getByRole("button", { name: "Satın Al" }).first().click();
    await expect(memberPage.getByTestId("member-packages-purchase-message")).toHaveText(
      "Ödeme altyapısı bir sonraki fazda bağlanacak.",
    );

    await adminPage.bringToFront();
    await adminPage.goto("/admin/packages");
    await expect(adminPage).toHaveURL(/\/admin\/packages(?:\/|$)/);
    const activeTargetRow = packageRows(adminPage).filter({ hasText: /Aktif/i }).first();
    await expect(activeTargetRow).toBeVisible({ timeout: 30_000 });
    await activeTargetRow.getByRole("button", { name: /Pasife Cek|Pasife Al/i }).first().click();
    await expect(activeTargetRow).toContainText(/Pasif/i, { timeout: 20_000 });

    await memberPage.bringToFront();
    await memberPage.reload();
    await memberPage.getByTestId("open-member-packages").click();
    await expect(memberPage.getByTestId("member-packages-modal")).toBeVisible();
    await expect(memberPage.getByText(PACKAGE_NAME)).toHaveCount(0);
  } finally {
    await memberContext.close().catch(() => {});
    await adminContext.close().catch(() => {});
  }
});
