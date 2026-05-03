import { expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  EDA_STREAMER_ROOM_MATCHER,
  pollLiveRoomsSnapshot,
  waitForLiveRoomByStreamerName,
  type MatchedLiveRoom,
} from "./live-room";
import { gotoDomWithRetry } from "./navigation";
import { extractSupabaseAccessToken } from "./private-room-diagnostics";

export type EnsureStreamerLiveOptions = {
  roomMatcher?: RegExp | string;
  waitRoomTimeoutMs?: number;
};

const RESTRICTION_TEXT = [
  /Bu alan sadece yayıncılar içindir/i,
  /Hesabınız kısıtlanmıştır/i,
  /Hesap kısıtlı/i,
];

function isStudioPath(pathname: string) {
  return pathname === "/studio" || pathname.startsWith("/studio/");
}

async function bodySnippet(page: Page, max = 900) {
  return (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, max);
}

async function collectAuthStorageHint(page: Page): Promise<string> {
  const keys = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("sb-") && k.includes("auth")),
  );
  const token = await extractSupabaseAccessToken(page);
  return `localStorageAuthKeys=${JSON.stringify(keys)} hasAccessToken=${Boolean(token)}`;
}

async function assertNoStudioRestrictions(page: Page, context: string) {
  for (const re of RESTRICTION_TEXT) {
    const loc = page.getByText(re).first();
    if (await loc.isVisible().catch(() => false)) {
      const text = (await loc.textContent().catch(() => ""))?.trim() || re.source;
      throw new Error(`${context}: studio restriction visible — ${text.slice(0, 300)}`);
    }
  }
}

async function navigateToStudioWithSessionRetry(page: Page): Promise<void> {
  const attemptGoto = async () => {
    await gotoDomWithRetry(page, "/studio");
  };

  await attemptGoto();
  if (page.url().includes("/streamer-login")) {
    await page.waitForTimeout(1000);
    await attemptGoto();
  }
  if (page.url().includes("/streamer-login")) {
    const title = await page.title().catch(() => "");
    const snippet = await bodySnippet(page, 600);
    const authHint = await collectAuthStorageHint(page);
    throw new Error(
      [
        "ensureStreamerLive: redirected to /streamer-login after navigating to /studio (session missing or rejected).",
        `current URL: ${page.url()}`,
        `title: ${title}`,
        authHint,
        `bodySnippet: ${JSON.stringify(snippet)}`,
      ].join("\n"),
    );
  }
}

async function waitForStartButtonEnabled(
  page: Page,
  request: APIRequestContext,
  startButton: ReturnType<Page["getByRole"]>,
  timeoutMs: number,
): Promise<void> {
  await expect(startButton).toBeVisible({ timeout: 20_000 });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await assertNoStudioRestrictions(page, "ensureStreamerLive (polling)");

    if (await startButton.isEnabled().catch(() => false)) {
      return;
    }

    await page.waitForTimeout(1000);
    await assertNoStudioRestrictions(page, "ensureStreamerLive (after wait)");
  }

  const url = page.url();
  const title = await page.title().catch(() => "");
  const snippet = await bodySnippet(page, 1200);
  const btnText = (await startButton.textContent().catch(() => ""))?.trim() || "";
  const disabled = await startButton.isDisabled().catch(() => true);

  let restrictionHints = "";
  for (const re of RESTRICTION_TEXT) {
    const loc = page.getByText(re).first();
    if (await loc.isVisible().catch(() => false)) {
      restrictionHints += ` | ${(await loc.textContent().catch(() => ""))?.trim()}`;
    }
  }

  const liveSnap = await pollLiveRoomsSnapshot(request);
  const normalizeSnapshotHint =
    "Check POST /api/test/normalize-fixtures response `snapshot.eda` (role=streamer, is_banned=false) after a successful normalize call.";

  throw new Error(
    [
      "YAYINA BAŞLA still disabled after 45s.",
      `current URL: ${url}`,
      `title: ${title}`,
      `startButtonText=${btnText} startButtonDisabled=${disabled}`,
      restrictionHints ? `restrictionMessages:${restrictionHints}` : "",
      `mainBodySnippet=${JSON.stringify(snippet)}`,
      `liveRoomsDiagnostic httpStatus=${liveSnap.httpStatus} responseOk=${liveSnap.responseOk} bodySnippet=${liveSnap.bodySnippet}`,
      normalizeSnapshotHint,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

/**
 * Leaves /studio on a live broadcast and waits until the room appears in GET /api/live-rooms.
 * Fails with visible restriction hints if "YAYINA BAŞLA" stays disabled.
 */
export async function ensureStreamerLive(
  page: Page,
  request: APIRequestContext,
  options?: EnsureStreamerLiveOptions,
): Promise<MatchedLiveRoom> {
  const startButton = page.getByRole("button", { name: /ba[sş]la/i }).first();
  const stopButton = page.getByRole("button", { name: /b[ıiİI]t[ıiİI]r/i }).first();

  const initialUrl = page.url();
  if (initialUrl.includes("/streamer-login")) {
    const title = await page.title().catch(() => "");
    const snippet = await bodySnippet(page, 600);
    throw new Error(
      [
        "Streamer is still on /streamer-login before ensureStreamerLive. Login did not complete.",
        `Current URL: ${initialUrl}`,
        `Title: ${title}`,
        `Body snippet: ${snippet}`,
      ].join("\n"),
    );
  }

  const pathname = new URL(page.url()).pathname;
  if (!isStudioPath(pathname)) {
    await navigateToStudioWithSessionRetry(page);
  }

  await assertNoStudioRestrictions(page, "ensureStreamerLive (initial)");

  if (await stopButton.isVisible().catch(() => false)) {
    await stopButton.click();
    await expect(startButton).toBeVisible({ timeout: 20_000 });
  }

  await waitForStartButtonEnabled(page, request, startButton, 45_000);

  await startButton.click();
  await expect(stopButton).toBeVisible({ timeout: 20_000 });

  const matcher = options?.roomMatcher ?? EDA_STREAMER_ROOM_MATCHER;
  const waitMs = options?.waitRoomTimeoutMs ?? 60_000;
  return waitForLiveRoomByStreamerName(request, matcher, waitMs);
}
