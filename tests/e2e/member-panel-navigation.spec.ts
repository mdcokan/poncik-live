import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";
import { normalizeTestFixtures } from "./helpers/normalize-fixtures";

const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

test("member panel navigation and sections", async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);

  await normalizeTestFixtures(request);

  await loginWithStabilizedAuth(
    page,
    {
      role: "member",
      loginPath: "/login",
      email: MEMBER_EMAIL,
      password: PASSWORD,
      successUrl: /\/member(?:\/|$)/,
      targetUrl: "/member",
      successIndicator: page.getByTestId("member-section-home"),
    },
    testInfo,
  );

  await page.goto("/member");
  await expect(page.getByTestId("member-section-home")).toBeVisible();
  await expect(page.getByTestId("member-wallet-balance")).toBeVisible();
  await expect(page.getByTestId("member-section-home")).toContainText("Günün Popüler Yayıncıları");
  await expect(page.getByTestId("member-section-home")).toContainText("Online Yayıncılar");

  const emptyLive = page.getByText("Şu an canlı yayın yok.");
  const liveCards = page.getByTestId("member-live-card");
  expect((await emptyLive.count()) + (await liveCards.count())).toBeGreaterThan(0);

  await page.getByTestId("member-sidebar-packages-button").click();
  await expect(page.getByTestId("member-section-packages")).toBeVisible();
  const packagesEmpty = page.getByText("Şu an aktif dakika paketi bulunmuyor.");
  const packagesHeading = page.getByTestId("member-section-packages").getByText("Dakika Paketleri");
  expect((await packagesEmpty.isVisible().catch(() => false)) || (await packagesHeading.isVisible().catch(() => false))).toBe(
    true,
  );
  await page.getByTestId("member-packages-close").click();

  await page.getByTestId("member-sidebar-messages").click();
  await expect(page.getByTestId("member-section-messages")).toBeVisible();

  await page.getByTestId("member-sidebar-account").click();
  const accountPanel = page.getByTestId("member-section-account");
  await expect(accountPanel).toBeVisible();
  await expect(accountPanel).toContainText("Özel oda talepleri");
  await expect(accountPanel).toContainText(/Henüz özel oda talebin yok|Beklemede|Kabul edildi|Reddedildi|İptal edildi|Yükleniyor/i, {
    timeout: 20_000,
  });

  await page.getByTestId("member-sidebar-profile").click();
  await expect(page.getByTestId("member-section-profile")).toBeVisible();

  await page.getByTestId("member-profile-full-link").click();
  await expect(page.getByTestId("profile-page")).toBeVisible();
  await page.getByTestId("profile-return-member-button").click();
  await expect(page).toHaveURL(/\/member(?:\/|$)/);
});
