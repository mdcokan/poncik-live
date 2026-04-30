import { expect, test } from "@playwright/test";
import { loginWithStabilizedAuth } from "./helpers/auth";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

test("auth smoke: streamer login redirects to streamer area", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page).toHaveURL(/http:\/\/localhost:3000\/?/);

  await loginWithStabilizedAuth(
    page,
    {
      role: "streamer",
      loginPath: "/streamer-login",
      email: STREAMER_EMAIL,
      password: PASSWORD,
      successUrl: /\/(streamer|studio)(?:\/|$)/,
      targetUrl: "/studio",
      successIndicator: page.getByRole("button", { name: /ba[sş]la/i }).first(),
    },
    testInfo,
  );

  await expect(page).toHaveURL(/\/(streamer|studio)(?:\/|$)/, { timeout: 10_000 });
});

test("auth smoke: member login redirects to member area", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page).toHaveURL(/http:\/\/localhost:3000\/?/);

  await loginWithStabilizedAuth(
    page,
    {
      role: "member",
      loginPath: "/login",
      email: MEMBER_EMAIL,
      password: PASSWORD,
      successUrl: /\/member(?:\/|$)/,
      targetUrl: "/member",
      successIndicator: page.getByRole("heading", { name: /Online Yayincilar|Online Yayıncılar/i }).first(),
    },
    testInfo,
  );

  await expect(page).toHaveURL(/\/member(?:\/|$)/, { timeout: 10_000 });
});
