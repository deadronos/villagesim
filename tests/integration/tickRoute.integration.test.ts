import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST, GET } from "../../app/api/tick/route";
import { createTownFromProfile, ensureLocalMockTownState, resetLocalMockTown, setLocalMockTownState } from "../../lib/mockData";
import { encodeSession, SESSION_COOKIE_NAME } from "../../lib/session";

describe("/api/tick local route", () => {
  const originalStateMode = process.env.VILLAGESIM_STATE_MODE;
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    delete process.env.VILLAGESIM_STATE_MODE;
    process.env.SESSION_SECRET = "vitest-session-secret";
  });

  afterEach(() => {
    if (originalStateMode === undefined) {
      delete process.env.VILLAGESIM_STATE_MODE;
    } else {
      process.env.VILLAGESIM_STATE_MODE = originalStateMode;
    }

    if (originalSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSecret;
    }
  });

  it("advances a local town and clamps batch counts to the configured maximum", async () => {
    const townId = "tick-route-batch-town";
    resetLocalMockTown({ id: townId });

    const response = await GET(new Request(`http://localhost:3000/api/tick?townId=${townId}&count=99`));
    const payload = (await response.json()) as { mode: string; ok: boolean; tickCount: number; town: { tick: number } };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(payload).toMatchObject({
      mode: "mock-local",
      ok: true,
      tickCount: 5,
      town: { tick: 5 },
    });
  });

  it("resets a local town from POST body data before running the next tick", async () => {
    const townId = "tick-route-reset-town";
    ensureLocalMockTownState({ id: townId, seed: "old-seed" });

    const response = await POST(
      new Request("http://localhost:3000/api/tick", {
        body: JSON.stringify({
          count: 1,
          reset: true,
          seed: "new-seed",
          townId,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );

    const payload = (await response.json()) as { ok: boolean; town: { seed: string; tick: number } };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      town: {
        seed: "new-seed",
        tick: 1,
      },
    });
  });

  it("blocks writes to a profile-owned town when the caller session does not match", async () => {
    const town = createTownFromProfile({ login: "deadronos", name: "Deadronos" });
    setLocalMockTownState(town);

    const session = encodeSession({
      expiresAt: Date.now() + 60_000,
      townId: "someone-else-town",
      user: { login: "someone-else", name: "Someone Else" },
    });

    const response = await GET(
      new Request(`http://localhost:3000/api/tick?townId=${town.id}`, {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${session}`,
        },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: `Town ${town.id} belongs to @deadronos. Sign in as that user to change it.`,
      mode: "mock-local",
      ok: false,
    });
  });
});
