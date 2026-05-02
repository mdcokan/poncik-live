import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const STREAMER_EMAIL = "eda@test.com";
const PASSWORD = "123123";

test("streamer panel navigation and sections", async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);

  await normalizeTestFixtures(request);

  await loginWithStabilizedAuth(
    page,
    {
      role: "streamer",
      loginPath: "/streamer-login",
      email: STREAMER_EMAIL,
      password: PASSWORD,
      successUrl: /\/(streamer|studio)(?:\/|$)/,
      targetUrl: "/streamer",
      successIndicator: page.getByTestId("streamer-section-dashboard"),
    },
    testInfo,
  );

  await page.goto("/streamer");
  await expect(page.getByTestId("streamer-section-dashboard")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Yayıncı Ana Ekran|Yayinci Ana Ekran/i })).toBeVisible();
  await expect(page.getByTestId("streamer-goto-broadcast-cta")).toBeVisible();

  await page.getByTestId("streamer-sidebar-messages").click();
  await expect(page.getByTestId("streamer-section-messages")).toBeVisible();
  await expect(page.getByTestId("dm-panel")).toBeVisible();

  await page.getByTestId("streamer-sidebar-private-earnings").click();
  await expect(page.getByTestId("streamer-section-private-earnings")).toBeVisible();
  const privateSection = page.getByTestId("streamer-section-private-earnings");
  await expect(
    privateSection.getByText(/Çekilebilir bakiye|Özel Oda Kazançlarım/i).first(),
  ).toBeVisible({ timeout: 15_000 });

  await page.getByTestId("streamer-sidebar-profile").click();
  await expect(page.getByTestId("streamer-section-profile")).toBeVisible();
  await expect(page.getByTestId("streamer-profile-full-link")).toBeVisible();

  await page.getByRole("button", { name: "Yayın Kuralları" }).click();
  await expect(page.getByTestId("streamer-section-rules")).toBeVisible();
  await expect(page.getByTestId("streamer-section-rules")).toContainText(/sosyal medya|Telefon/i);

  await page.getByRole("button", { name: "Canlı Destek" }).click();
  await expect(page.getByTestId("streamer-section-support")).toBeVisible();

  await page.goto("/streamer");
  await expect(page.getByTestId("streamer-section-dashboard")).toBeVisible();
  const studioCta = page.getByTestId("streamer-goto-broadcast-cta");
  await expect(studioCta).toBeVisible();
  await expect(studioCta).toHaveAttribute("href", "/studio");
  const sidebarStudio = page.getByTestId("streamer-sidebar-studio");
  await expect(sidebarStudio).toHaveAttribute("href", "/studio");
});
