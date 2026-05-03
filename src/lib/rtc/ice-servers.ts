/** Default STUN when env is missing or invalid (no TURN). */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

function normalizeUrlsField(urls: unknown): string | string[] | null {
  if (typeof urls === "string") {
    const t = urls.trim();
    return t.length > 0 ? t : null;
  }
  if (Array.isArray(urls)) {
    const parts = urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
    if (parts.length === 0) {
      return null;
    }
    return parts.length === 1 ? parts[0]! : parts;
  }
  return null;
}

function parseSingleIceServer(item: unknown): RTCIceServer | null {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }
  const record = item as Record<string, unknown>;
  const urls = normalizeUrlsField(record.urls);
  if (urls === null) {
    return null;
  }
  const server: RTCIceServer = { urls };
  if (typeof record.username === "string") {
    server.username = record.username;
  }
  if (typeof record.credential === "string") {
    server.credential = record.credential;
  }
  return server;
}

/**
 * Parses `NEXT_PUBLIC_RTC_ICE_SERVERS` JSON. On any invalid input returns {@link DEFAULT_ICE_SERVERS}.
 */
export function parseIceServersFromEnv(value?: string | null): RTCIceServer[] {
  if (value === undefined || value === null) {
    return DEFAULT_ICE_SERVERS;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return DEFAULT_ICE_SERVERS;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return DEFAULT_ICE_SERVERS;
  }

  if (!Array.isArray(parsed)) {
    return DEFAULT_ICE_SERVERS;
  }

  const out: RTCIceServer[] = [];
  for (const item of parsed) {
    const server = parseSingleIceServer(item);
    if (server) {
      out.push(server);
    }
  }

  return out.length > 0 ? out : DEFAULT_ICE_SERVERS;
}

function readEnvIceServersRaw(): string | null | undefined {
  if (typeof process === "undefined" || !process.env) {
    return undefined;
  }
  return process.env.NEXT_PUBLIC_RTC_ICE_SERVERS;
}

/** ICE servers from env with safe fallback (client and Node). */
export function getRtcIceServers(): RTCIceServer[] {
  const raw = readEnvIceServersRaw();
  return parseIceServersFromEnv(raw ?? null);
}

function expandUrlsForTurnCheck(urls: string | string[]): string[] {
  if (typeof urls === "string") {
    return [urls];
  }
  return urls;
}

/** True if any URL uses relay (turn / turns). */
export function hasTurnServer(servers: RTCIceServer[]): boolean {
  for (const s of servers) {
    for (const u of expandUrlsForTurnCheck(s.urls)) {
      const lower = u.trim().toLowerCase();
      if (lower.startsWith("turn:") || lower.startsWith("turns:")) {
        return true;
      }
    }
  }
  return false;
}
