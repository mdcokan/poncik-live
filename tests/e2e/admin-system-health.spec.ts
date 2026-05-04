import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { gotoDomWithRetry } from "./helpers/navigation";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const ADMIN_EMAIL = "admin@test.com";
const PASSWORD = "123123";

test("admin sistem sağlığı sayfası", async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  await normalizeTestFixtures(request);

  await loginWithStabilizedAuth(
    page,
    {
      role: "member",
      loginPath: "/login",
      email: ADMIN_EMAIL,
      password: PASSWORD,
      successUrl: /\/admin(?:\/|$)/,
      targetUrl: "/admin/users",
      successIndicator: page.getByRole("heading", { name: /kullan[ıi]c[ıi] y[öo]netimi/i }).first(),
    },
    testInfo,
  );

  await gotoDomWithRetry(page, "/admin/system-health");
  await expect(page.getByTestId("admin-system-health-page")).toBeVisible({ timeout: 25_000 });

  await expect(page.getByTestId("admin-system-health-rtc")).toBeVisible();
  await expect(page.getByTestId("admin-system-health-environment")).toBeVisible();
  await expect(page.getByTestId("admin-system-health-recent-activity")).toBeVisible();
  await expect(page.getByTestId("admin-system-health-counts")).toBeVisible();

  const realtime = page.getByTestId("admin-system-health-realtime");
  await expect(realtime).toBeVisible();
  await expect(
    realtime
      .getByText("private_room_sessions", { exact: true })
      .or(realtime.getByText("dm_messages", { exact: true }))
      .first(),
  ).toBeVisible();

  await expect(page.getByTestId("admin-system-health-limitations")).toBeVisible();

  await page.getByTestId("admin-system-health-refresh").click();
  await expect(page.getByTestId("admin-system-health-page")).toBeVisible({ timeout: 25_000 });

  const sidebarHealthLink = page.locator('aside a[href="/admin/system-health"]').first();
  await expect(sidebarHealthLink).toBeVisible();
  await expect(sidebarHealthLink).toHaveClass(/bg-pink-400/);
});
