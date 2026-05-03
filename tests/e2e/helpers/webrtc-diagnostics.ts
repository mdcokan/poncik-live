import type { Page, TestInfo } from "@playwright/test";

function snippet(value: string, max = 1200) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) {
    return collapsed;
  }
  return `${collapsed.slice(0, max)}…`;
}

/**
 * Focused WebRTC / private-session DOM snapshot for e2e failures (URLs, panel text, state attrs, signaling).
 */
export async function attachWebRtcDiagnostics(testInfo: TestInfo, memberPage: Page, streamerPage: Page) {
  const lines: string[] = [];

  lines.push(`memberUrl=${memberPage.isClosed() ? "<closed>" : memberPage.url()}`);
  lines.push(`streamerUrl=${streamerPage.isClosed() ? "<closed>" : streamerPage.url()}`);

  for (const label of ["member", "streamer"] as const) {
    const page = label === "member" ? memberPage : streamerPage;
    if (page.isClosed()) {
      lines.push(`${label}.pageClosed=true`);
      continue;
    }

    const panel = page.getByTestId("private-webrtc-panel");
    const panelText = await panel.innerText().catch(() => "");
    lines.push(`${label}.private-webrtc-panel=${JSON.stringify(snippet(panelText, 2000))}`);

    const state = page.getByTestId("private-webrtc-state");
    const stateText = await state.innerText().catch(() => "");
    const connState = await state.getAttribute("data-connection-state").catch(() => null);
    lines.push(`${label}.private-webrtc-state.text=${JSON.stringify(snippet(stateText, 500))}`);
    lines.push(`${label}.private-webrtc-state.data-connection-state=${connState ?? "<missing>"}`);

    const sessionPanel = page.getByTestId("private-session-panel");
    const sessionAttrs = [
      "data-session-id",
      "data-current-role",
      "data-viewer-ready",
      "data-streamer-ready",
      "data-webrtc-enabled",
    ] as const;
    for (const a of sessionAttrs) {
      const v = await sessionPanel.getAttribute(a).catch(() => null);
      lines.push(`${label}.private-session-panel.${a}=${v ?? "<missing>"}`);
    }

    const lastSig = await page.getByTestId("private-signal-last").innerText().catch(() => "");
    const sigCount = await page.getByTestId("private-signal-count").innerText().catch(() => "");
    lines.push(`${label}.private-signal-last=${JSON.stringify(snippet(lastSig, 800))}`);
    lines.push(`${label}.private-signal-count=${JSON.stringify(snippet(sigCount, 200))}`);

    const bodyText = await page.locator("body").innerText().catch(() => "");
    lines.push(`${label}.bodySnippet=${JSON.stringify(snippet(bodyText, 1500))}`);
  }

  const body = lines.join("\n");
  await testInfo.attach("webrtc-diagnostics.txt", { body, contentType: "text/plain" });
}
