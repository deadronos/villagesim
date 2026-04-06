import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { encodeSession, SESSION_COOKIE_NAME } from "../../lib/session";
import { GET } from "../../app/api/auth/session/route";

describe("GET /api/auth/session", () => {
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

  it("returns an unauthenticated payload when no session cookie is present", async () => {
    const response = await GET(new Request("http://localhost:3000/api/auth/session"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      townId: null,
      user: null,
    });
  });

  it("returns the authenticated user and town id from the signed session cookie", async () => {
    const session = encodeSession({
      expiresAt: Date.now() + 60_000,
      townId: "deadronos-town",
      user: {
        login: "deadronos",
        name: "Deadronos",
      },
    });

    const response = await GET(
      new Request("http://localhost:3000/api/auth/session", {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${session}`,
        },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      townId: "deadronos-town",
      user: {
        login: "deadronos",
        name: "Deadronos",
      },
    });
  });
});
