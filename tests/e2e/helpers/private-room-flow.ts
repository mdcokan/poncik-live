import { expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { attachPrivateRoomDiagnostics, extractSupabaseAccessToken } from "./private-room-diagnostics";
import { gotoDomWithRetry } from "./navigation";
import { normalizeTestFixtures, type NormalizeFixturesSuccess } from "./normalize-fixtures";
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

export type CleanupPrivateRoomFlowOpts = {
  request: APIRequestContext;
  streamerPage?: Page;
  memberPage?: Page;
};

export type WaitForViewerPrivateSessionPanelAfterAcceptOptions = {
  memberPage: Page;
  request: APIRequestContext;
  timeoutMs?: number;
};

async function requestWithTransientEconnresetRetry(
  request: APIRequestContext,
  path: string,
  token: string,
  maxAttempts = 3,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await request.get(path, {
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
      });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isTransientEconnreset = /ECONNRESET/i.test(message);
      if (!isTransientEconnreset || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unknown request failure.");
}

/** Best-effort fixture reset after private-room tests (same as `normalizeTestFixtures`). */
export async function cleanupPrivateRoomFlow(opts: CleanupPrivateRoomFlowOpts): Promise<void> {
  await normalizeTestFixtures(opts.request).catch(() => {});
}

/**
 * After normalize, Veli must not still see a stale active session (avoids “Özel oda aktif.” instead of a new request).
 */
export async function waitForMemberPrivatePanelSessionMatchesActiveApi(
  request: APIRequestContext,
  memberPage: Page,
  timeoutMs = 30_000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const token = await extractSupabaseAccessToken(memberPage);
        const panelId =
          (await memberPage.getByTestId("private-session-panel").getAttribute("data-session-id"))?.trim() ?? "";
        if (!token || !panelId) {
          return null;
        }
        const res = await requestWithTransientEconnresetRetry(request, "/api/private-sessions/active", token);
        if (!res.ok()) {
          return null;
        }
        const body = (await res.json()) as { session?: { sessionId?: string } | null };
        const apiId = body?.session?.sessionId;
        return typeof apiId === "string" && apiId === panelId ? panelId : null;
      },
      {
        timeout: timeoutMs,
        intervals: [300, 600, 1200],
        message: "Veli: private-session-panel data-session-id aktif oturum API ile aynı olmalı (stale oturum yok).",
      },
    )
    .not.toBeNull();
}

export async function waitForFixtureMemberNoActivePrivateSession(
  request: APIRequestContext,
  memberPage: Page,
  timeoutMs = 25_000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const token = await extractSupabaseAccessToken(memberPage);
        if (!token) {
          return false;
        }
        const res = await requestWithTransientEconnresetRetry(request, "/api/private-sessions/active", token);
        if (!res.ok()) {
          return false;
        }
        const body = (await res.json()) as { session?: { sessionId?: string } | null };
        return body?.session == null;
      },
      {
        timeout: timeoutMs,
        intervals: [200, 400, 800, 1200],
        message: "Veli: aktif özel oda kalmamalı (normalize + API /private-sessions/active).",
      },
    )
    .toBe(true);
}

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
        const res = await requestWithTransientEconnresetRetry(request, "/api/private-sessions/active", token);
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

export async function waitForViewerPrivateSessionPanelAfterAccept({
  memberPage,
  request,
  timeoutMs = 45_000,
}: WaitForViewerPrivateSessionPanelAfterAcceptOptions): Promise<string> {
  const activeSessionId = await waitForActivePrivateSessionApi(request, memberPage, "member (Veli)", timeoutMs);

  const memberPanel = memberPage.getByTestId("private-session-panel");
  await expect(memberPanel).toBeVisible({ timeout: timeoutMs });

  await expect
    .poll(
      async () => {
        const panelSessionId = (await memberPanel.getAttribute("data-session-id"))?.trim() ?? "";
        return panelSessionId.length > 0 ? panelSessionId : null;
      },
      {
        timeout: timeoutMs,
        intervals: [250, 500, 1000],
        message: "Veli: private-session-panel data-session-id dolu olmalı.",
      },
    )
    .toBe(activeSessionId);

  return activeSessionId;
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

  let lastNormalizeSnapshot: NormalizeFixturesSuccess["snapshot"] | undefined;
  if (!skipNormalizeFixtures) {
    const norm = await normalizeTestFixtures(request);
    lastNormalizeSnapshot = norm.snapshot;
  }

  let roomId = "";

  try {
    await gotoDomWithRetry(streamerPage, "/studio");
    roomId = (await ensureStreamerLive(streamerPage, request, { waitRoomTimeoutMs })).id;

    await gotoDomWithRetry(memberPage, "/member");
    await memberPage.locator(`a[href="/rooms/${roomId}"]`).first().click();
    await expect(memberPage).toHaveURL(new RegExp(`/rooms/${roomId}$`), { timeout: 20_000 });

    await waitForFixtureMemberNoActivePrivateSession(request, memberPage, 25_000);

    const privateRequestButton = memberPage.getByTestId("private-room-request-button");
    await expect(privateRequestButton).toBeEnabled({ timeout: 60_000 });
    await privateRequestButton.click();
    await expect(memberPage.getByTestId("private-request-feedback")).toContainText(
      /g[oö]nderildi|bekleniyor|onay[ıi] bekleniyor|davet/i,
      { timeout: 20_000 },
    );

    const acceptButton = streamerPage.getByTestId("studio-private-request-accept-button").first();
    await expect(acceptButton).toBeVisible({ timeout: 25_000 });
    await acceptButton.click();

    await waitForActivePrivateSessionApi(request, memberPage, "member (Veli)", 45_000);
    await waitForActivePrivateSessionApi(request, streamerPage, "studio (Eda)", 45_000);

    await expect(memberPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 60_000 });
    await expect(streamerPage.getByTestId("private-session-panel")).toBeVisible({ timeout: 60_000 });

    await waitForMemberPrivatePanelSessionMatchesActiveApi(request, memberPage, 30_000);

    const streamerPanelId = (await streamerPage.getByTestId("private-session-panel").getAttribute("data-session-id"))?.trim();
    const memberPanelId = (await memberPage.getByTestId("private-session-panel").getAttribute("data-session-id"))?.trim();
    expect(streamerPanelId).toBe(memberPanelId);

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
        normalizeSnapshot: lastNormalizeSnapshot,
      }).catch(() => {});
    }
    throw e;
  }
}
