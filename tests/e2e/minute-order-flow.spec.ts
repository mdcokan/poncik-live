import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = "admin@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";
const PACKAGE_NAME = "Playwright Order 150 dk";

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

async function readMemberWalletBalance(page: import("@playwright/test").Page) {
  const balanceText = (await page.getByTestId("member-wallet-balance").textContent()) ?? "";
  const parsed = Number.parseInt(balanceText.replace(/\D+/g, " ").trim().split(" ")[0] ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

test("member creates minute order and admin approves it", async ({ browser }) => {
  test.setTimeout(220_000);

  const adminContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const memberPage = await memberContext.newPage();

  const packageRows = () =>
    adminPage.locator("tbody tr").filter({ has: adminPage.locator(`input[type="text"][value="${PACKAGE_NAME}"]`) });

  try {
    await login(adminPage, {
      email: ADMIN_EMAIL,
      password: PASSWORD,
      successUrl: /\/admin(?:\/|$)/,
    });

    await adminPage.goto("/admin/packages");
    await expect(adminPage).toHaveURL(/\/admin\/packages(?:\/|$)/);
    await expect(adminPage.getByTestId("packages-table")).toBeVisible();

    const existingRows = packageRows();
    const existingCount = await existingRows.count();
    for (let i = 0; i < existingCount; i += 1) {
      const row = existingRows.nth(i);
      const rowText = (await row.textContent()) ?? "";
      if (/Aktif/i.test(rowText)) {
        await row.getByRole("button", { name: /Pasife Cek|Pasife Al/i }).first().click();
        await expect(row).toContainText(/Pasif/i, { timeout: 20_000 });
      }
    }

    await adminPage.getByTestId("package-create-name").fill(PACKAGE_NAME);
    await adminPage.getByTestId("package-create-type").selectOption("minute");
    await adminPage.getByTestId("package-create-amount").fill("150");
    await adminPage.getByTestId("package-create-price").fill("149");
    await adminPage.getByTestId("package-create-sort-order").fill("997");
    await adminPage.getByTestId("package-create-is-active").check();
    await adminPage.getByTestId("package-create-submit").click();

    const createdPackageRow = packageRows().first();
    await expect(createdPackageRow).toBeVisible({ timeout: 30_000 });
    await expect(createdPackageRow).toContainText(/Aktif/i, { timeout: 20_000 });

    await login(memberPage, {
      email: MEMBER_EMAIL,
      password: PASSWORD,
      successUrl: /\/member(?:\/|$)/,
    });
    await memberPage.goto("/member");
    const initialBalance = await readMemberWalletBalance(memberPage);

    await memberPage.getByTestId("member-minute-load-button").click();
    await expect(memberPage.getByTestId("member-section-packages")).toBeVisible();
    await expect(memberPage.getByRole("heading", { name: PACKAGE_NAME }).first()).toBeVisible({ timeout: 20_000 });
    await memberPage
      .locator("article")
      .filter({ hasText: PACKAGE_NAME })
      .getByRole("button", { name: "Satın Al" })
      .first()
      .click();

    await expect(memberPage.getByTestId("member-packages-purchase-message")).toHaveText(
      "Satın alma talebin alındı. Admin onayından sonra dakika bakiyene eklenecek.",
    );
    const myOrdersSection = memberPage
      .getByRole("heading", { name: "Son taleplerim" })
      .locator("xpath=ancestor::section[1]");
    const pendingOrderCard = myOrdersSection.locator("article").filter({ hasText: PACKAGE_NAME }).first();
    await expect(pendingOrderCard).toContainText(/Beklemede/i);

    await adminPage.bringToFront();
    await adminPage.goto("/admin/finance");
    await expect(adminPage).toHaveURL(/\/admin\/finance(?:\/|$)/);
    const pendingOrder = adminPage.locator("article").filter({ hasText: PACKAGE_NAME }).first();
    await expect(pendingOrder).toBeVisible({ timeout: 20_000 });
    await pendingOrder.getByRole("button", { name: /Onayla/i }).first().click();
    await expect(adminPage.getByText("Talep onaylandı.")).toBeVisible({ timeout: 20_000 });

    await memberPage.bringToFront();
    await expect
      .poll(
        async () => readMemberWalletBalance(memberPage),
        {
          timeout: 40_000,
          message: "uye bakiyesi +150 dk olarak guncellenmedi",
        },
      )
      .toBeGreaterThanOrEqual(initialBalance + 150);

    await memberPage.reload();
    await memberPage.getByTestId("member-minute-load-button").click();
    const refreshedOrdersSection = memberPage
      .getByRole("heading", { name: "Son taleplerim" })
      .locator("xpath=ancestor::section[1]");
    const approvedOrderCard = refreshedOrdersSection.locator("article").filter({ hasText: PACKAGE_NAME }).first();
    await expect(approvedOrderCard).toContainText(/Onaylandı/i);
  } finally {
    if (!adminPage.isClosed()) {
      await adminPage.goto("/admin/packages").catch(() => {});
      const row = packageRows().filter({ hasText: /Aktif/i }).first();
      if ((await row.count().catch(() => 0)) > 0) {
        await row.getByRole("button", { name: /Pasife Cek|Pasife Al/i }).first().click().catch(() => {});
      }
    }
    await memberContext.close().catch(() => {});
    await adminContext.close().catch(() => {});
  }
});
