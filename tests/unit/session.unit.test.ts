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

  it("correctly encodes and signs a session payload", () => {
    const payload: SessionPayload = {
      user: {
        login: "deadronos",
      },
      townId: "deadronos-town",
      expiresAt: 1234567890000,
    };

    const encoded = encodeSession(payload);
    const [encodedPayload, signature] = encoded.split(".");

    expect(encodedPayload).toBe(Buffer.from(JSON.stringify(payload)).toString("base64url"));
    expect(signature).toBe(signSessionPayload(encodedPayload));
    expect(encoded.split(".")).toHaveLength(2);
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
  it("rejects a session token with an invalid signature length", () => {
    const encoded = encodeSession({
      user: { login: "deadronos" },
      townId: "deadronos-town",
      expiresAt: Date.now() + 60_000,
    });

    // Appending a character changes the length of the signature
    const tampered = `${encoded}x`;

    expect(decodeSession(tampered)).toBeNull();
  });

  it("rejects a malformed session token without a dot", () => {
    expect(decodeSession("invalid-token-without-dot")).toBeNull();
  });

  it("rejects a session token with a non-JSON payload", () => {
    const invalidBase64 = Buffer.from("not-a-json-payload").toString("base64url");
    const signature = signSessionPayload(invalidBase64);
    const tampered = `${invalidBase64}.${signature}`;

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