import type { Page } from "@playwright/test";

/** Dev server occasionally aborts navigations under load; retry with domcontentloaded. */
export async function gotoDomWithRetry(page: Page, url: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, { timeout: 60_000, waitUntil: "domcontentloaded" });
      return;
    } catch {
      if (attempt === 2) {
        throw new Error(`goto failed after retries: ${url}`);
      }
      await page.waitForTimeout(800);
    }
  }
}
