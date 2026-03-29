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
    const encoded = encodeSession({
      user: { login: "deadronos" },
      townId: "deadronos-town",
      expiresAt: "invalid" as any,
    });

    expect(decodeSession(encoded)).toBeNull();
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