import { createHmac } from "crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SESSION_COOKIE_NAME,
  decodeSession,
  encodeSession,
  getSessionFromCookieHeader,
  parseCookies,
  type SessionPayload,
} from "../../lib/session";

describe("session helpers", () => {
  const originalSecret = process.env.SESSION_SECRET;

  function signSessionPayload(encodedPayload: string): string {
    return createHmac("sha256", process.env.SESSION_SECRET ?? "insecure-dev-fallback-secret")
      .update(encodedPayload)
      .digest("base64url");
  }

  beforeEach(() => {
    process.env.SESSION_SECRET = "vitest-session-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSecret;
    }
  });

  it("round-trips a signed session payload", () => {
    const payload: SessionPayload = {
      user: {
        login: "deadronos",
        name: "Deadronos",
      },
      townId: "deadronos-town",
      expiresAt: Date.now() + 60_000,
    };

    const encoded = encodeSession(payload);

    expect(decodeSession(encoded)).toEqual(payload);
  });

  it("rejects a tampered session token", () => {
    const encoded = encodeSession({
      user: { login: "deadronos" },
      townId: "deadronos-town",
      expiresAt: Date.now() + 60_000,
    });

    const tampered = `${encoded.slice(0, -1)}x`;

    expect(decodeSession(tampered)).toBeNull();
  });


  it("rejects an expired session token", () => {
    const encoded = encodeSession({
      user: { login: "deadronos" },
      townId: "deadronos-town",
      expiresAt: Date.now() - 60_000,
    });

    expect(decodeSession(encoded)).toBeNull();
  });

  it("rejects a session token with invalid expiresAt", () => {
    const payload = {
      user: { login: "deadronos" },
      townId: "deadronos-town",
      expiresAt: "invalid",
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const encoded = `${encodedPayload}.${signSessionPayload(encodedPayload)}`;

    expect(decodeSession(encoded)).toBeNull();
  });

  describe("parseCookies", () => {
    it("returns an empty object for an empty string", () => {
      expect(parseCookies("")).toEqual({});
    });

    it("parses a single cookie", () => {
      expect(parseCookies("theme=night")).toEqual({ theme: "night" });
    });

    it("parses multiple cookies", () => {
      expect(parseCookies("theme=night; mode=mock")).toEqual({ theme: "night", mode: "mock" });
    });

    it("trims whitespace around keys and values", () => {
      expect(parseCookies("  theme = night  ;  mode= mock ")).toEqual({ theme: "night", mode: "mock" });
    });

    it("ignores parts without an equals sign", () => {
      expect(parseCookies("theme=night; badCookie; mode=mock")).toEqual({ theme: "night", mode: "mock" });
    });

    it("handles empty values correctly", () => {
      expect(parseCookies("theme=")).toEqual({ theme: "" });
    });

    it("handles values containing an equals sign", () => {
      expect(parseCookies("theme=night=day")).toEqual({ theme: "night=day" });
    });

    it("ignores parts missing a key (starting with equals sign)", () => {
      expect(parseCookies("=night; theme=dark")).toEqual({ theme: "dark" });
    });
  });

  it("parses cookies and extracts the session from a cookie header", () => {
    const encoded = encodeSession({
      user: { login: "deadronos" },
      townId: "deadronos-town",
      expiresAt: Date.now() + 60_000,
    });

    const cookieHeader = `theme=night; ${SESSION_COOKIE_NAME}=${encoded}; mode=mock`;

    expect(parseCookies(cookieHeader)).toMatchObject({
      mode: "mock",
      theme: "night",
      [SESSION_COOKIE_NAME]: encoded,
    });
    expect(getSessionFromCookieHeader(cookieHeader)?.user.login).toBe("deadronos");
  });
});