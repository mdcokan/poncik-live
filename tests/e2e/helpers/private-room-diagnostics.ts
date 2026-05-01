import type { APIRequestContext, Page, TestInfo } from "@playwright/test";
import { fetchRoomStateSnapshot, pollLiveRoomsSnapshot } from "./live-room";

function snippet(value: string, max = 1200) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) {
    return collapsed;
  }
  return `${collapsed.slice(0, max)}…`;
}

export async function extractSupabaseAccessToken(page: Page): Promise<string | null> {
  if (page.isClosed()) {
    return null;
  }
  return page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) {
        continue;
      }
      const raw = localStorage.getItem(key);
      if (!raw) {
        continue;
      }
      try {
        const parsed = JSON.parse(raw) as
          | { access_token?: string; currentSession?: { access_token?: string } }
          | null;
        return parsed?.access_token ?? parsed?.currentSession?.access_token ?? null;
      } catch {
        return null;
      }
    }
    return null;
  });
}

export type PrivateRoomDiagnosticsOpts = {
  memberPage: Page;
  streamerPage: Page;
  request: APIRequestContext;
  roomId?: string;
};

/**
 * Test-only: attach URLs, DOM snippets, live-rooms + room state + active private session API snapshots.
 */
export async function attachPrivateRoomDiagnostics(testInfo: TestInfo, opts: PrivateRoomDiagnosticsOpts) {
  const lines: string[] = [];

  lines.push(`memberUrl=${opts.memberPage.isClosed() ? "<closed>" : opts.memberPage.url()}`);
  lines.push(`studioUrl=${opts.streamerPage.isClosed() ? "<closed>" : opts.streamerPage.url()}`);

  for (const label of ["member", "studio"] as const) {
    const page = label === "member" ? opts.memberPage : opts.streamerPage;
    if (page.isClosed()) {
      lines.push(`${label}MainSnippet=<closed>`);
      continue;
    }
    const mainText = await page.locator("main").first().innerText().catch(() => "");
    lines.push(`${label}MainSnippet=${JSON.stringify(snippet(mainText, 1500))}`);
  }

  const liveSnap = await pollLiveRoomsSnapshot(opts.request);
  lines.push(`liveRooms httpStatus=${liveSnap.httpStatus} responseOk=${liveSnap.responseOk}`);
  lines.push(`liveRooms bodySnippet=${liveSnap.bodySnippet}`);

  if (opts.roomId) {
    const rs = await fetchRoomStateSnapshot(opts.request, opts.roomId);
    lines.push(
      `roomState roomId=${opts.roomId} http=${rs.status} ok=${rs.ok} snippet=${snippet(typeof rs.bodyText === "string" ? rs.bodyText : "")}`,
    );
  }

  const memberToken = await extractSupabaseAccessToken(opts.memberPage);
  const streamerToken = await extractSupabaseAccessToken(opts.streamerPage);

  if (memberToken) {
    const res = await opts.request.get("/api/private-sessions/active", {
      headers: { Authorization: `Bearer ${memberToken}` },
      failOnStatusCode: false,
    });
    lines.push(`memberActivePrivateSession http=${res.status()} body=${snippet(await res.text())}`);
  } else {
    lines.push("memberActivePrivateSession=<no bearer token>");
  }

  if (streamerToken) {
    const res = await opts.request.get("/api/private-sessions/active", {
      headers: { Authorization: `Bearer ${streamerToken}` },
      failOnStatusCode: false,
    });
    lines.push(`streamerActivePrivateSession http=${res.status()} body=${snippet(await res.text())}`);
  } else {
    lines.push("streamerActivePrivateSession=<no bearer token>");
  }

  if (!opts.streamerPage.isClosed()) {
    const panelText = await opts.streamerPage.getByTestId("studio-private-requests-panel").innerText().catch(() => "");
    lines.push(`studioPrivateRequestsPanel=${JSON.stringify(snippet(panelText, 1000))}`);
  }

  const body = lines.join("\n");
  await testInfo.attach("private-room-diagnostics.txt", { body, contentType: "text/plain" });
  testInfo.annotations.push({
    type: "private-room-diagnostics",
    description: body.length > 18_000 ? `${body.slice(0, 18_000)}…` : body,
  });
}
