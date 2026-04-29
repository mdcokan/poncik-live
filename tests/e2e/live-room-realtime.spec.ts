import { expect, test } from "@playwright/test";

const STREAMER_EMAIL = "eda@test.com";
const MEMBER_EMAIL = "veli@test.com";
const PASSWORD = "123123";

const streamerNameRegex = /Eda/i;
const noLiveRoomRegex = /[ŞS]u\s+an\s+canl[ıi]\s+yay[ıi]n\s+yok/i;

async function collectPageDiagnostics(page: import("@playwright/test").Page) {
  const currentUrl = page.url();
  const title = await page.title().catch(() => "<no title>");
  const visibleErrorText = await page
    .locator('text=/hatal[ıi]|ba[sş]ar[ıi]s[ıi]z|ge[çc]ersiz|yanl[ıi][şs]|izin|permission|error|failed/i')
    .first()
    .textContent()
    .catch(() => null);

  return {
    currentUrl,
    title,
    visibleErrorText: visibleErrorText?.trim() || "<none>",
  };
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

    if (loginResult === "success") {
      return;
    }

    const currentUrl = page.url();
    const title = await page.title().catch(() => "<no title>");
    const visibleErrorText = await page
      .locator('text=/hatal[ıi]|ba[sş]ar[ıi]s[ıi]z|ge[çc]ersiz|yanl[ıi][şs]|error|failed/i')
      .first()
      .textContent()
      .catch(() => null);
    const screenshotPath = testInfo.outputPath(`${opts.role}-login-failure.png`);
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
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
    page.off("requestfailed", onRequestFailed);
  }
}

test("live room card appears and disappears without member refresh", async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const streamerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const streamerPage = await streamerContext.newPage();
  const memberPage = await memberContext.newPage();

  const streamerLiveCardsOnMember = memberPage.locator('a[href^="/rooms/"]').filter({ hasText: streamerNameRegex });
  const noLiveRoomText = memberPage.getByText(noLiveRoomRegex).first();
  const startButton = streamerPage.getByRole("button", { name: /ba[sş]la/i });
  const stopButton = streamerPage.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i });

  try {
    await streamerPage.goto("/");
    await expect(streamerPage).toHaveURL(/http:\/\/localhost:3000\/?/);
    await memberPage.goto("/");
    await expect(memberPage).toHaveURL(/http:\/\/localhost:3000\/?/);

    await loginWithDiagnostics(streamerPage, testInfo, {
      role: "streamer",
      loginPath: "/streamer-login",
      email: STREAMER_EMAIL,
      password: PASSWORD,
      successUrl: /\/(streamer|studio)(?:\/|$)/,
    });
    if (!/\/studio(?:\/)?$/.test(streamerPage.url())) {
      await streamerPage.goto("/studio");
      await expect(streamerPage).toHaveURL(/\/studio/, { timeout: 10_000 });
    }
    await expect(startButton.or(stopButton)).toBeVisible();

    await loginWithDiagnostics(memberPage, testInfo, {
      role: "member",
      loginPath: "/login",
      email: MEMBER_EMAIL,
      password: PASSWORD,
      successUrl: /\/member(?:\/|$)/,
    });
    await expect(memberPage).toHaveURL(/\/member/, { timeout: 10_000 });

    const initialLiveCardCount = await streamerLiveCardsOnMember.count();
    const streamerAlreadyLive = await stopButton.isVisible().catch(() => false);
    if (!streamerAlreadyLive) {
      await startButton.click();
      const publishResult = await Promise.race([
        stopButton.waitFor({ state: "visible", timeout: 20_000 }).then(() => "started" as const),
        streamerPage
          .locator('text=/hatal[ıi]|ba[sş]ar[ıi]s[ıi]z|ge[çc]ersiz|yanl[ıi][şs]|izin|permission|error|failed/i')
          .first()
          .waitFor({ state: "visible", timeout: 20_000 })
          .then(() => "ui-error" as const),
      ]);
      if (publishResult !== "started") {
        const diagnostics = await collectPageDiagnostics(streamerPage);
        const screenshotPath = testInfo.outputPath("stream-start-failure.png");
        await streamerPage.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
        throw new Error(
          [
            "stream start failed after clicking start button",
            `current URL: ${diagnostics.currentUrl}`,
            `title: ${diagnostics.title}`,
            `visible error text: ${diagnostics.visibleErrorText}`,
            `screenshot: ${screenshotPath}`,
          ].join("\n"),
        );
      }
    }
    await expect(streamerLiveCardsOnMember.first()).toBeVisible({ timeout: 20_000 });

    await stopButton.click();
    await expect(startButton).toBeVisible();
    await expect(streamerLiveCardsOnMember).toHaveCount(initialLiveCardCount, { timeout: 30_000 });

    // If no other streams exist, an empty-state text should be shown.
    if (initialLiveCardCount === 0 && (await noLiveRoomText.isVisible())) {
      await expect(noLiveRoomText).toBeVisible();
    }
  } finally {
    if (!streamerPage.isClosed()) {
      const canStop = await stopButton.isVisible().catch(() => false);
      if (canStop) {
        await stopButton.click();
      }
    }

    await memberContext.close().catch(() => {});
    await streamerContext.close().catch(() => {});
  }
});
