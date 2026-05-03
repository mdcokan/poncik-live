import { expect, test } from "@playwright/test";
import {
  DEFAULT_ICE_SERVERS,
  getRtcIceServers,
  hasTurnServer,
  parseIceServersFromEnv,
} from "../../src/lib/rtc/ice-servers";

test.describe("RTC ICE server env parsing", () => {
  test("parseIceServersFromEnv(null) returns default", () => {
    expect(parseIceServersFromEnv(null)).toEqual(DEFAULT_ICE_SERVERS);
    expect(parseIceServersFromEnv(undefined)).toEqual(DEFAULT_ICE_SERVERS);
    expect(parseIceServersFromEnv("")).toEqual(DEFAULT_ICE_SERVERS);
    expect(parseIceServersFromEnv("   ")).toEqual(DEFAULT_ICE_SERVERS);
  });

  test("invalid JSON returns default", () => {
    expect(parseIceServersFromEnv("{not json")).toEqual(DEFAULT_ICE_SERVERS);
  });

  test("non-array JSON returns default", () => {
    expect(parseIceServersFromEnv("{}")).toEqual(DEFAULT_ICE_SERVERS);
    expect(parseIceServersFromEnv('"stun"')).toEqual(DEFAULT_ICE_SERVERS);
  });

  test("valid STUN array parses", () => {
    const json = JSON.stringify([{ urls: "stun:custom.example.com:3478" }]);
    const parsed = parseIceServersFromEnv(json);
    expect(parsed).toEqual([{ urls: "stun:custom.example.com:3478" }]);
    expect(hasTurnServer(parsed)).toBe(false);
  });

  test("valid TURN array yields hasTurnServer true", () => {
    const parsed = parseIceServersFromEnv(
      JSON.stringify([
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "turn:turn.example.com:3478", username: "u", credential: "p" },
      ]),
    );
    expect(hasTurnServer(parsed)).toBe(true);
    expect(parsed.some((s) => typeof s.username === "string")).toBe(true);
  });

  test("turns: URLs count as TURN", () => {
    expect(hasTurnServer(parseIceServersFromEnv(JSON.stringify([{ urls: "turns:relay.example:5349" }])))).toBe(true);
  });

  test("invalid items are filtered", () => {
    const json = JSON.stringify([
      null,
      { urls: 123 },
      { urls: "" },
      { urls: "stun:keep.me:19302" },
    ]);
    expect(parseIceServersFromEnv(json)).toEqual([{ urls: "stun:keep.me:19302" }]);
  });

  test("empty array after filter returns default", () => {
    expect(parseIceServersFromEnv(JSON.stringify([{ urls: "" }, { foo: "bar" }]))).toEqual(DEFAULT_ICE_SERVERS);
  });

  test("getRtcIceServers respects env when set", () => {
    const prev = process.env.NEXT_PUBLIC_RTC_ICE_SERVERS;
    process.env.NEXT_PUBLIC_RTC_ICE_SERVERS = JSON.stringify([{ urls: "turn:t:1", credential: "x", username: "y" }]);
    try {
      expect(hasTurnServer(getRtcIceServers())).toBe(true);
    } finally {
      if (prev === undefined) {
        delete process.env.NEXT_PUBLIC_RTC_ICE_SERVERS;
      } else {
        process.env.NEXT_PUBLIC_RTC_ICE_SERVERS = prev;
      }
    }
  });
});
