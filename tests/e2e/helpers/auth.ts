import { expect } from "@playwright/test";

const AUTH_ERROR_TEXT = /hatal[ıi]|ba[sş]ar[ıi]s[ıi]z|ge[çc]ersiz|yanl[ıi][şs]|unauthorized|forbidden|error|failed/i;
const LOGIN_PAGE_URL = /\/(login|streamer-login)(?:\/|$)/i;

function isStaticAssetUrl(url: string) {
  const normalized = url.toLowerCase();
  return (
    normalized.includes("__nextjs_font") ||
    normalized.includes("favicon") ||
    normalized.endsWith(".woff") ||
    normalized.endsWith(".woff2") ||
    normalized.endsWith(".png") ||
    normalized.endsWith(".jpg") ||
    normalized.endsWith(".jpeg") ||
    normalized.endsWith(".svg") ||
    normalized.endsWith(".webp") ||
    normalized.endsWith(".ico") ||
    normalized.endsWith(".css")
  );
}

export function isCriticalFailedRequest(request: import("@playwright/test").Request) {
  const resourceType = request.resourceType();
  if (resourceType === "font" || resourceType === "image" || resourceType === "stylesheet" || resourceType === "media") {
    return false;
  }

  const url = request.url();
  if (isStaticAssetUrl(url)) {
    return false;
  }

  return resourceType === "document" || resourceType === "xhr" || resourceType === "fetch";
}

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

export async function loginWithStabilizedAuth(
  page: import("@playwright/test").Page,
  opts: {
    role: "streamer" | "member" | "admin";
    loginPath: "/streamer-login" | "/login";
    email: string;
    password: string;
    successUrl: RegExp;
    targetUrl: string;
    successIndicator?: import("@playwright/test").Locator;
  },
  testInfo?: import("@playwright/test").TestInfo,
) {
  const diagnostics = {
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    requestFailures: [] as string[],
  };

  const onPageError = (error: Error) => {
    diagnostics.pageErrors.push(String(error?.message ?? error));
  };
  const onConsole = (msg: import("@playwright/test").ConsoleMessage) => {
    if (msg.type() === "error") {
      diagnostics.consoleErrors.push(msg.text());
    }
  };
  const onRequestFailed = (request: import("@playwright/test").Request) => {
    if (!isCriticalFailedRequest(request)) {
      return;
    }
    diagnostics.requestFailures.push(
      `${request.method()} ${request.url()} => ${request.failure()?.errorText ?? "unknown request failure"}`,
    );
  };

  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  page.on("requestfailed", onRequestFailed);

  try {
    await page.goto(opts.loginPath, { timeout: 60_000 });
    await expect(page).toHaveURL(new RegExp(`${opts.loginPath.replace("/", "\\/")}(?:\\/|$)`));
    await expect(page.locator("form").first()).toBeVisible({ timeout: 10_000 });

    await fillWithFallback(page.getByLabel(/email/i), page.locator('input[type="email"]'), opts.email);
    await fillWithFallback(
      page.getByLabel(/s[ıi]fre|[şs]ifre|password/i),
      page.locator('input[type="password"]'),
      opts.password,
    );

    await page.getByRole("button", { name: /giri[sş]\s*yap/i }).first().click();

    let submitResult: "success-url" | "auth-error" | "critical-request-failed" | "wait-timeout" = "wait-timeout";
    try {
      submitResult = await Promise.race([
        page.waitForURL(opts.successUrl, { timeout: 15_000 }).then(() => "success-url" as const),
        page
          .getByText(AUTH_ERROR_TEXT)
          .first()
          .waitFor({ state: "visible", timeout: 15_000 })
          .then(() => "auth-error" as const),
        page
          .waitForEvent("requestfailed", {
            timeout: 15_000,
            predicate: (request) => isCriticalFailedRequest(request),
          })
          .then(() => "critical-request-failed" as const),
      ]);
    } catch {
      submitResult = "wait-timeout";
    }

    if (submitResult === "success-url") {
      return;
    }

    await page.goto(opts.targetUrl, { timeout: 60_000 });
    const currentUrl = page.url();
    const bouncedToLogin = LOGIN_PAGE_URL.test(currentUrl);
    if (!bouncedToLogin) {
      const formVisible = await page.locator("form").first().isVisible().catch(() => false);
      const hasSuccessUrl = opts.successUrl.test(currentUrl);
      const hasSuccessIndicator = opts.successIndicator
        ? await opts.successIndicator.isVisible().catch(() => false)
        : false;
      if (hasSuccessUrl || hasSuccessIndicator || !formVisible) {
        return;
      }
    }

    const title = await page.title().catch(() => "<no title>");
    const visibleErrorText = await page.getByText(AUTH_ERROR_TEXT).first().textContent().catch(() => null);
    const screenshotPath = testInfo?.outputPath(`${opts.role}-login-failure.png`);
    if (screenshotPath) {
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    }

    throw new Error(
      [
        `${opts.role} login failed (${submitResult})`,
        `current URL: ${currentUrl}`,
        `title: ${title}`,
        `visible error text: ${visibleErrorText?.trim() || "<none>"}`,
        screenshotPath ? `screenshot: ${screenshotPath}` : "",
        diagnostics.pageErrors.length > 0 ? `page errors: ${diagnostics.pageErrors.join(" | ")}` : "",
        diagnostics.consoleErrors.length > 0 ? `console errors: ${diagnostics.consoleErrors.join(" | ")}` : "",
        diagnostics.requestFailures.length > 0 ? `request failures: ${diagnostics.requestFailures.join(" | ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
    page.off("requestfailed", onRequestFailed);
  }
}
