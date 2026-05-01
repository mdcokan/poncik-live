import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { EDA_STREAMER_ROOM_MATCHER, waitForLiveRoomByStreamerName, type MatchedLiveRoom } from "./live-room";

export type EnsureStreamerLiveOptions = {
  roomMatcher?: RegExp | string;
  waitRoomTimeoutMs?: number;
};

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

  if (await stopButton.isVisible().catch(() => false)) {
    await stopButton.click();
    await expect(startButton).toBeVisible({ timeout: 20_000 });
  }

  try {
    await expect(startButton).toBeEnabled({ timeout: 25_000 });
  } catch {
    const hints: string[] = [];
    const restricted = page.getByText("Hesap kısıtlı");
    if (await restricted.isVisible().catch(() => false)) {
      hints.push((await restricted.textContent())?.trim() || "Hesap kısıtlı");
    }
    const streamerOnly = page.getByText("Bu alan sadece yayıncılar içindir");
    if (await streamerOnly.isVisible().catch(() => false)) {
      hints.push("Bu alan sadece yayıncılar içindir");
    }
    const busyLabel = (await startButton.textContent().catch(() => ""))?.trim() || "";
    hints.push(`startButtonText=${busyLabel}`);
    hints.push(`startButtonDisabled=${await startButton.isDisabled().catch(() => true)}`);
    const mainSnippet = (await page.locator("main").first().innerText().catch(() => "")).slice(0, 500);
    throw new Error(
      `YAYINA BAŞLA still disabled after 25s (restriction / busy / hydration). visibleHints=${hints.join(" | ")} mainSnippet=${JSON.stringify(mainSnippet)}`,
    );
  }

  await startButton.click();
  await expect(stopButton).toBeVisible({ timeout: 20_000 });

  const matcher = options?.roomMatcher ?? EDA_STREAMER_ROOM_MATCHER;
  const waitMs = options?.waitRoomTimeoutMs ?? 60_000;
  return waitForLiveRoomByStreamerName(request, matcher, waitMs);
}
