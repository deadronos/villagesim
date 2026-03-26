import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockTown } from "../../lib/mockData";
import { TownAccessError } from "../../lib/townAccess";

const {
  after,
  createInternalApiHeaders,
  dispatchHostedPlannerQueue,
  getSessionFromCookieHeader,
  hasQueuedPlannerRequests,
  isHostedConvexModeEnabled,
  readInternalApiToken,
  runAuthoritativeTick,
} = vi.hoisted(() => ({
  after: vi.fn(async (callback: () => Promise<void> | void) => {
    await callback();
  }),
  createInternalApiHeaders: vi.fn(() => ({ Authorization: "Bearer internal-token" })),
  dispatchHostedPlannerQueue: vi.fn(),
  getSessionFromCookieHeader: vi.fn(),
  hasQueuedPlannerRequests: vi.fn(),
  isHostedConvexModeEnabled: vi.fn(),
  readInternalApiToken: vi.fn(),
  runAuthoritativeTick: vi.fn(),
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after,
  };
});

vi.mock("../../lib/internalApi", () => ({
  createInternalApiHeaders,
  readInternalApiToken,
}));

vi.mock("../../lib/session", async () => {
  const actual = await vi.importActual<typeof import("../../lib/session")>("../../lib/session");
  return {
    ...actual,
    getSessionFromCookieHeader,
  };
});

vi.mock("../../lib/authoritativeTownStore", () => ({
  dispatchHostedPlannerQueue,
  isHostedConvexModeEnabled,
  runAuthoritativeTick,
}));

vi.mock("../../lib/plannerExecution", () => ({
  hasQueuedPlannerRequests,
}));

import { GET } from "../../app/api/tick/route";

describe("GET /api/tick hosted mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    isHostedConvexModeEnabled.mockReturnValue(true);
    getSessionFromCookieHeader.mockReturnValue({
      expiresAt: Date.now() + 60_000,
      townId: "deadronos-town",
      user: { login: "deadronos" },
    });
  });

  it("returns hosted tick data and triggers a direct dispatch when no internal token is configured", async () => {
    const town = createMockTown({ id: "demo-town" });
    runAuthoritativeTick.mockResolvedValue({
      events: town.events,
      mode: "convex-hosted",
      npcResults: [],
      summary: { actionsCompleted: 0, actionsStarted: 0, plansAssigned: 0, planner: { averageLatencyMs: null, fallbackCount: 0, queuedRequests: 0, requested: 0, sourceCounts: {} }, processedNpcs: 5 },
      tick: 1,
      town,
    });
    hasQueuedPlannerRequests.mockReturnValue(true);
    readInternalApiToken.mockReturnValue(null);
    dispatchHostedPlannerQueue.mockResolvedValue({
      claimed: 1,
      completed: 1,
      dispatching: 0,
      failed: 0,
      processed: 1,
      queued: 0,
      remaining: 0,
      skipped: 0,
    });

    const response = await GET(new Request("http://localhost:3000/api/tick?townId=demo-town&count=2&reset=yes"));
    const payload = (await response.json()) as { mode: string; ok: boolean; tickCount: number };

    expect(payload).toMatchObject({
      mode: "convex-hosted",
      ok: true,
      tickCount: 2,
    });
    expect(runAuthoritativeTick).toHaveBeenCalledWith(
      expect.objectContaining({
        callerLogin: "deadronos",
        count: 2,
        reset: true,
        townId: "demo-town",
      }),
    );
    expect(after).toHaveBeenCalled();
    expect(dispatchHostedPlannerQueue).toHaveBeenCalledWith({
      callerLogin: "deadronos",
      source: "after-response",
      townId: "demo-town",
    });
  });

  it("falls back to direct dispatch when the internal route request fails", async () => {
    const town = createMockTown({ id: "demo-town" });
    runAuthoritativeTick.mockResolvedValue({
      events: town.events,
      mode: "convex-hosted",
      npcResults: [],
      summary: { actionsCompleted: 0, actionsStarted: 0, plansAssigned: 0, planner: { averageLatencyMs: null, fallbackCount: 0, queuedRequests: 0, requested: 0, sourceCounts: {} }, processedNpcs: 5 },
      tick: 1,
      town,
    });
    hasQueuedPlannerRequests.mockReturnValue(true);
    readInternalApiToken.mockReturnValue("internal-token");
    dispatchHostedPlannerQueue.mockResolvedValue({
      claimed: 0,
      completed: 0,
      dispatching: 0,
      failed: 0,
      processed: 0,
      queued: 0,
      remaining: 0,
      skipped: 0,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(new Request("http://localhost:3000/api/tick?townId=demo-town"));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      new URL("/api/internal/planner-dispatch", "http://localhost:3000/api/tick?townId=demo-town"),
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(createInternalApiHeaders).toHaveBeenCalledWith("internal-token");
    expect(dispatchHostedPlannerQueue).toHaveBeenCalledWith({
      callerLogin: "deadronos",
      source: "after-response",
      townId: "demo-town",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Hosted planner queue dispatch trigger failed; retrying direct dispatch.",
      expect.any(Error),
    );
  });

  it("returns hosted error payloads for both forbidden and unexpected failures", async () => {
    runAuthoritativeTick
      .mockRejectedValueOnce(new TownAccessError("Town demo-town belongs to @deadronos. Sign in as that user to change it."))
      .mockRejectedValueOnce(new Error("boom"));
    hasQueuedPlannerRequests.mockReturnValue(false);

    const forbidden = await GET(new Request("http://localhost:3000/api/tick?townId=demo-town"));
    const boom = await GET(new Request("http://localhost:3000/api/tick?townId=demo-town"));

    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({ mode: "convex-hosted", ok: false });
    expect(boom.status).toBe(500);
    await expect(boom.json()).resolves.toMatchObject({ error: "boom", mode: "convex-hosted", ok: false });
  });
});
