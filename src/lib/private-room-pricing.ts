export type PrivateRoomPricing = {
  pricePerMinute: number;
  streamerSharePercent: number;
};

export const DEFAULT_PRIVATE_ROOM_PRICING: PrivateRoomPricing = {
  pricePerMinute: 1,
  streamerSharePercent: 70,
};

function coerceInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function normalizePrivateRoomPricing(raw: unknown): PrivateRoomPricing {
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const rawPrice = coerceInteger(base.pricePerMinute);
  const rawShare = coerceInteger(base.streamerSharePercent);

  const pricePerMinute = Math.max(1, rawPrice ?? DEFAULT_PRIVATE_ROOM_PRICING.pricePerMinute);
  const streamerSharePercent = Math.min(
    100,
    Math.max(0, rawShare ?? DEFAULT_PRIVATE_ROOM_PRICING.streamerSharePercent),
  );

  return { pricePerMinute, streamerSharePercent };
}
