import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = "admin@test.com";
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
    loginPath: "/login";
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

async function adjustMinutesOnRow(
  page: import("@playwright/test").Page,
  row: import("@playwright/test").Locator,
  amount: string,
  reason: string,
  actionName: RegExp,
) {
  await row.locator('input[type="number"]').first().fill(amount);
  await row.locator('input[type="text"]').first().fill(reason);
  await row.getByRole("button", { name: actionName }).first().click();
  await expect(page.getByText(/Dakika duzenleme basariyla kaydedildi/i).first()).toBeVisible({ timeout: 20_000 });
}

async function getSessionUserId(page: import("@playwright/test").Page) {
  const userId = await page.evaluate(() => {
    const authStorageKey = Object.keys(window.localStorage).find((key) => key.includes("auth-token"));
    if (!authStorageKey) {
      return null;
    }

    const rawToken = window.localStorage.getItem(authStorageKey);
    if (!rawToken) {
      return null;
    }

    try {
      const parsedToken = JSON.parse(rawToken) as
        | { user?: { id?: string | null } | null; currentSession?: { user?: { id?: string | null } | null } | null }
        | null;

      return parsedToken?.user?.id ?? parsedToken?.currentSession?.user?.id ?? null;
    } catch {
      return null;
    }
  });

  return typeof userId === "string" && userId.length > 0 ? userId : null;
}

async function readMemberWalletBalance(page: import("@playwright/test").Page) {
  const balanceText = (await page.getByTestId("member-wallet-balance").textContent()) ?? "";
  const parsed = Number.parseInt(balanceText.replace(/\D+/g, " ").trim().split(" ")[0] ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

test("admin can add/remove member wallet minutes and member sees updated balance", async ({ browser }) => {
  test.setTimeout(180_000);

  const adminContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const memberPage = await memberContext.newPage();

  try {
    await login(memberPage, {
      loginPath: "/login",
      email: MEMBER_EMAIL,
      password: PASSWORD,
      successUrl: /\/member(?:\/|$)/,
    });
    await memberPage.goto("/member");
    await expect(memberPage.getByTestId("member-wallet-balance")).toContainText(/dk/i, { timeout: 20_000 });
    const initialBalance = await readMemberWalletBalance(memberPage);
    const memberUserId = await getSessionUserId(memberPage);
    expect(memberUserId, "member oturumu user id bulunamadi").toBeTruthy();

    await login(adminPage, {
      loginPath: "/login",
      email: ADMIN_EMAIL,
      password: PASSWORD,
      successUrl: /\/admin(?:\/|$)/,
    });

    await adminPage.goto("/admin/finance");
    await expect(adminPage).toHaveURL(/\/admin\/finance(?:\/|$)/);

    const targetRow = adminPage.locator("tr").filter({ hasText: memberUserId! }).first();
    await expect(targetRow).toBeVisible({ timeout: 20_000 });
    await adjustMinutesOnRow(adminPage, targetRow, "100", "Playwright +100", /Dakika Ekle/i);
    await expect
      .poll(
        async () => readMemberWalletBalance(memberPage),
        {
          timeout: 30_000,
          message: "member cüzdan bakiyesi admin +100 sonrası güncellenmedi",
        },
      )
      .toBeGreaterThanOrEqual(initialBalance + 100);

    await adminPage.reload();
    const rowAfterAdd = adminPage.locator("tr").filter({ hasText: memberUserId! }).first();
    await expect(rowAfterAdd).toBeVisible({ timeout: 20_000 });

    const rowText = (await rowAfterAdd.textContent()) ?? "";
    const balanceMatch = rowText.match(/(\d+)\s*dk/i);
    const adminSeenBalance = Number.parseInt(balanceMatch?.[1] ?? "0", 10);
    const cleanupAmount = Math.max(1, Math.min(100, adminSeenBalance));
    await adjustMinutesOnRow(adminPage, rowAfterAdd, String(cleanupAmount), "Playwright -cleanup", /Dakika Dus/i);
  } finally {
    await memberContext.close().catch(() => {});
    await adminContext.close().catch(() => {});
  }
});
