import { expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { attachPrivateRoomDiagnostics, extractSupabaseAccessToken } from "./private-room-diagnostics";
import { gotoDomWithRetry } from "./navigation";
import { normalizeTestFixtures } from "./normalize-fixtures";
import { ensureStreamerLive } from "./studio";

export type CreatePrivateSessionForEdaAndVeliOptions = {
  streamerPage: Page;
  memberPage: Page;
  request: APIRequestContext;
  /** Attach diagnostics on failure when provided. */
  testInfo?: TestInfo;
  /** When true, skips `normalizeTestFixtures` at the start (caller already normalized). Default false. */
  skipNormalizeFixtures?: boolean;
  /** Override default room wait for slow CI. */
  waitRoomTimeoutMs?: number;
};

export type CreatePrivateSessionForEdaAndVeliResult = {
  roomId: string;
  /** From `data-session-id` when the panel is visible. */
  sessionId: string | null;
};

async function waitForActivePrivateSessionApi(
  request: APIRequestContext,
  page: Page,
  roleLabel: string,
  timeoutMs: number,
): Promise<string> {
  let lastSid: string | null = null;
  await expect
    .poll(
      async () => {
        const token = await extractSupabaseAccessToken(page);
        if (!token) {
          return null;
        }
        const res = await request.get("/api/private-sessions/active", {
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        });
        if (!res.ok()) {
          return null;
        }
        const body = (await res.json()) as { ok?: boolean; session?: { sessionId?: string } | null };
        const sid = body?.session?.sessionId;
        if (typeof sid === "string" && sid.length > 0) {
          lastSid = sid;
          return sid;
        }
        return null;
      },
      {
        timeout: timeoutMs,
        intervals: [400, 800, 1200],
        message: `${roleLabel}: aktif özel oda oturumu /api/private-sessions/active üzerinden görünmeli (accept sonrası).`,
      },
    )
    .not.toBeNull();
  if (!lastSid) {
    throw new Error(`${roleLabel}: aktif oturum ID alınamadı.`);
  }
  return lastSid;
}

/**
 * Ortak akış: studio canlı, üye odada, özel oda talebi → kabul → paneller.
 * Login çağırmaz; sayfaların Eda (streamer) ve Veli (member) olarak giriş yapmış olması gerekir.
 */
export async function createPrivateSessionForEdaAndVeli(
  opts: CreatePrivateSessionForEdaAndVeliOptions,
): Promise<CreatePrivateSessionForEdaAndVeliResult> {
  const {
    streamerPage,
    memberPage,
    request,
    testInfo,
    skipNormalizeFixtures = false,
    waitRoomTimeoutMs = 60_000,
  } = opts;

  if (!skipNormalizeFixtures) {
    await normalizeTestFixtures(request);
  }

  let roomId = "";

  try {
    await gotoDomWithRetry(streamerPage, "/studio");
    roomId = (await ensureStreamerLive(streamerPage, request, { waitRoomTimeoutMs })).id;

    await gotoDomWithRetry(memberPage, "/member");
    await memberPage.locator(`a[href="/rooms/${roomId}"]`).first().click();
    await expect(memberPage).toHaveURL(new RegExp(`/rooms/${roomId}$`), { timeout: 20_000 });

    const privateRequestButton = memberPage.getByTestId("private-room-request-button");
    await expect(privateRequestButton).toBeEnabled({ timeout: 60_000 });
    await privateRequestButton.click();
    await expect(memberPage.getByTestId("private-request-feedback")).toContainText(/iletildi|bekleyen/i, { timeout: 20_000 });

    const acceptButton = streamerPage.getByTestId("accept-private-request-button").first();
    await expect(acceptButton).toBeVisible({ timeout: 25_000 });
    await acceptButton.click();

    await waitForActivePrivateSessionApi(request, memberPage, "member (Veli)", 45_000);
    await waitForActivePrivateSessionApi(request, streamerPage, "studio (Eda)", 45_000);

    await expect(memberPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 60_000 });
    await expect(streamerPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 60_000 });

    const sessionIdMember = await memberPage.getByTestId("private-session-panel").getAttribute("data-session-id");
    const sessionIdStreamer = await streamerPage.getByTestId("private-session-panel").getAttribute("data-session-id");
    const sessionId = sessionIdMember?.trim() || sessionIdStreamer?.trim() || null;

    return { roomId, sessionId };
  } catch (e) {
    if (testInfo) {
      await attachPrivateRoomDiagnostics(testInfo, {
        memberPage,
        streamerPage,
        request,
        roomId: roomId || undefined,
      }).catch(() => {});
    }
    throw e;
  }
}
