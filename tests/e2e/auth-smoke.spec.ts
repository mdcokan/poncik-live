import { expect, test } from "@playwright/test";

const STREAMER_EMAIL = "eda@test.com";
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

async function loginWithDiagnostics(
  page: import("@playwright/test").Page,
  testInfo: import("@playwright/test").TestInfo,
  opts: {
    role: "streamer" | "member";
    loginPath: "/streamer-login" | "/login";
    email: string;
    password: string;
    successUrl: RegExp;
  },
) {
  const diagnostics = {
    failedToFetch: false,
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    requestFailures: [] as string[],
  };

  const onPageError = (error: Error) => {
    const message = String(error?.message ?? error);
    diagnostics.pageErrors.push(message);
    if (/failed to fetch/i.test(message)) {
      diagnostics.failedToFetch = true;
    }
  };

  const onConsole = (msg: import("@playwright/test").ConsoleMessage) => {
    if (msg.type() !== "error") {
      return;
    }
    const text = msg.text();
    diagnostics.consoleErrors.push(text);
    if (/failed to fetch/i.test(text)) {
      diagnostics.failedToFetch = true;
    }
  };

  const onRequestFailed = (request: import("@playwright/test").Request) => {
    const failureText = request.failure()?.errorText ?? "unknown request failure";
    const entry = `${request.method()} ${request.url()} => ${failureText}`;
    diagnostics.requestFailures.push(entry);
    if (/failed to fetch/i.test(failureText)) {
      diagnostics.failedToFetch = true;
    }
  };

  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  page.on("requestfailed", onRequestFailed);

  try {
    await page.goto(opts.loginPath);
    await expect(page).toHaveURL(new RegExp(`${opts.loginPath.replace("/", "\\/")}$`));
    await expect(page.locator("form")).toBeVisible();

    await fillWithFallback(page.getByLabel(/email/i), page.locator('input[type="email"]'), opts.email);
    await fillWithFallback(
      page.getByLabel(/s[ıi]fre|[şs]ifre|password/i),
      page.locator('input[type="password"]'),
      opts.password,
    );
    await page.getByRole("button", { name: /giri[sş]\s*yap/i }).first().click();

    const loginResult = await Promise.race([
      page.waitForURL(opts.successUrl, { timeout: 15_000 }).then(() => "success" as const),
      page
        .getByText(/hatal[ıi]|ba[sş]ar[ıi]s[ıi]z|ge[çc]ersiz|yanl[ıi][şs]|error|failed/i)
        .first()
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => "auth-error" as const),
      page.waitForEvent("requestfailed", { timeout: 15_000 }).then(() => "network-failure" as const),
    ]);

    if (loginResult !== "success") {
      const currentUrl = page.url();
      const title = await page.title().catch(() => "<no title>");
      const visibleErrorText = await page
        .locator('text=/hatal[ıi]|ba[sş]ar[ıi]s[ıi]z|ge[çc]ersiz|yanl[ıi][şs]|error|failed/i')
        .first()
        .textContent()
        .catch(() => null);
      const screenshotPath = testInfo.outputPath(`${opts.role}-auth-smoke-failure.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

      throw new Error(
        [
          `${opts.role} login failed (${loginResult})`,
          `current URL: ${currentUrl}`,
          `title: ${title}`,
          `visible error text: ${visibleErrorText?.trim() || "<none>"}`,
          `failed to fetch seen: ${diagnostics.failedToFetch ? "yes" : "no"}`,
          `screenshot: ${screenshotPath}`,
          diagnostics.pageErrors.length > 0 ? `page errors: ${diagnostics.pageErrors.join(" | ")}` : "",
          diagnostics.consoleErrors.length > 0 ? `console errors: ${diagnostics.consoleErrors.join(" | ")}` : "",
          diagnostics.requestFailures.length > 0
            ? `request failures: ${diagnostics.requestFailures.join(" | ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
    page.off("requestfailed", onRequestFailed);
  }
}

test("auth smoke: streamer login redirects to streamer area", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page).toHaveURL(/http:\/\/localhost:3000\/?/);

  await loginWithDiagnostics(page, testInfo, {
    role: "streamer",
    loginPath: "/streamer-login",
    email: STREAMER_EMAIL,
    password: PASSWORD,
    successUrl: /\/(streamer|studio)(?:\/|$)/,
  });

  await expect(page).toHaveURL(/\/(streamer|studio)(?:\/|$)/, { timeout: 10_000 });
});

test("auth smoke: member login redirects to member area", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page).toHaveURL(/http:\/\/localhost:3000\/?/);

  await loginWithDiagnostics(page, testInfo, {
    role: "member",
    loginPath: "/login",
    email: MEMBER_EMAIL,
    password: PASSWORD,
    successUrl: /\/member(?:\/|$)/,
  });

  await expect(page).toHaveURL(/\/member(?:\/|$)/, { timeout: 10_000 });
});
