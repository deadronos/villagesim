import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockTown } from "../../lib/mockData";
import type { SimulationTickResult } from "../../lib/types";

const {
  claimHostedPlannerQueueEntry,
  completeHostedPlannerQueueEntry,
  createHostedPlannerQueueForTick,
  failHostedPlannerQueueEntry,
  fetchMutation,
  fetchQuery,
  randomUUID,
  readHostedPlannerDrainPerDispatch,
  recordHostedPlannerDispatchMetrics,
  requestNpcPlan,
  runLocalMockTick,
  runSimulationTick,
} = vi.hoisted(() => ({
  claimHostedPlannerQueueEntry: vi.fn(),
  completeHostedPlannerQueueEntry: vi.fn(),
  createHostedPlannerQueueForTick: vi.fn(),
  failHostedPlannerQueueEntry: vi.fn(),
  fetchMutation: vi.fn(),
  fetchQuery: vi.fn(),
  randomUUID: vi.fn(() => "dispatch-token-1"),
  readHostedPlannerDrainPerDispatch: vi.fn(),
  recordHostedPlannerDispatchMetrics: vi.fn(),
  requestNpcPlan: vi.fn(),
  runLocalMockTick: vi.fn(),
  runSimulationTick: vi.fn(),
}));

vi.mock("convex/nextjs", () => ({
  fetchMutation,
  fetchQuery,
}));

vi.mock("convex/server", () => ({
  makeFunctionReference: vi.fn((name: string) => name),
}));

vi.mock("node:crypto", () => ({
  randomUUID,
}));

vi.mock("../../lib/localTick", () => ({
  runLocalMockTick,
}));

vi.mock("../../lib/sim_engine", () => ({
  runSimulationTick,
}));

vi.mock("../../lib/model_proxy", () => ({
  requestNpcPlan,
}));

vi.mock("../../lib/plannerExecution", async () => {
  const actual = await vi.importActual<typeof import("../../lib/plannerExecution")>("../../lib/plannerExecution");
  return {
    ...actual,
    claimHostedPlannerQueueEntry,
    completeHostedPlannerQueueEntry,
    createHostedPlannerQueueForTick,
    failHostedPlannerQueueEntry,
    readHostedPlannerDrainPerDispatch,
    recordHostedPlannerDispatchMetrics,
  };
});

import {
  createOrReopenTownForProfile,
  dispatchHostedPlannerQueue,
  ensureAuthoritativeTown,
  isHostedConvexModeEnabled,
  runAuthoritativeTick,
} from "../../lib/authoritativeTownStore";

describe("authoritativeTownStore", () => {
  const originalStateMode = process.env.VILLAGESIM_STATE_MODE;
  const originalConvexUrl = process.env.CONVEX_URL;
  const originalConvexAdminKey = process.env.CONVEX_ADMIN_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VILLAGESIM_STATE_MODE;
    process.env.CONVEX_URL = "https://demo.convex.cloud";
    process.env.CONVEX_ADMIN_KEY = "convex-admin-key";
  });

  afterEach(() => {
    if (originalStateMode === undefined) {
      delete process.env.VILLAGESIM_STATE_MODE;
    } else {
      process.env.VILLAGESIM_STATE_MODE = originalStateMode;
    }

    if (originalConvexUrl === undefined) {
      delete process.env.CONVEX_URL;
    } else {
      process.env.CONVEX_URL = originalConvexUrl;
    }

    if (originalConvexAdminKey === undefined) {
      delete process.env.CONVEX_ADMIN_KEY;
    } else {
      process.env.CONVEX_ADMIN_KEY = originalConvexAdminKey;
    }
  });

  it("uses local mode by default", async () => {
    const localResult = { mode: "mock-local", tick: 1 } as SimulationTickResult;
    runLocalMockTick.mockResolvedValue(localResult);

    expect(isHostedConvexModeEnabled()).toBe(false);
    await expect(runAuthoritativeTick({ count: 1, townId: "demo-town" })).resolves.toBe(localResult);
    expect(runLocalMockTick).toHaveBeenCalledWith("demo-town", { seed: undefined });
  });

  it("creates or reopens local profile towns when hosted mode is disabled", async () => {
    const town = await createOrReopenTownForProfile({
      profile: { login: "deadronos", name: "Deadronos" },
    });

    expect(town.id).toBe("deadronos-town");
    expect(town.metadata.createdFrom).toBe("profile");
  });

  it("loads existing hosted towns and creates session-owned hosted towns when missing", async () => {
    process.env.VILLAGESIM_STATE_MODE = "convex";
    const hostedTown = createMockTown({ id: "deadronos-town" });

    fetchQuery.mockResolvedValueOnce(hostedTown).mockResolvedValueOnce(null);
    fetchMutation.mockResolvedValueOnce({ ok: true, townId: hostedTown.id, town: hostedTown });

    await expect(
      ensureAuthoritativeTown({
        callerLogin: "deadronos",
        townId: "deadronos-town",
      }),
    ).resolves.toBe(hostedTown);

    await expect(
      ensureAuthoritativeTown({
        callerLogin: "deadronos",
        sessionUser: { login: "deadronos", name: "Deadronos" },
        townId: "deadronos-town",
      }),
    ).resolves.toBe(hostedTown);

    expect(fetchQuery).toHaveBeenCalled();
    expect(fetchMutation).toHaveBeenCalled();
  });

  it("creates the shared demo town in hosted mode and returns null for unknown towns", async () => {
    process.env.VILLAGESIM_STATE_MODE = "convex";
    const demoTown = createMockTown({ id: "demo-town" });

    fetchQuery.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    fetchMutation.mockResolvedValueOnce(demoTown);

    await expect(
      ensureAuthoritativeTown({
        callerLogin: "deadronos",
        townId: "demo-town",
      }),
    ).resolves.toBe(demoTown);

    await expect(
      ensureAuthoritativeTown({
        callerLogin: "deadronos",
        townId: "missing-town",
      }),
    ).resolves.toBeNull();
  });

  it("throws when hosted mode is selected without valid Convex configuration", async () => {
    process.env.VILLAGESIM_STATE_MODE = "convex";
    delete process.env.CONVEX_URL;

    await expect(
      ensureAuthoritativeTown({
        callerLogin: "deadronos",
        townId: "demo-town",
      }),
    ).rejects.toThrow("CONVEX_URL");

    process.env.CONVEX_URL = "https://demo.convex.cloud";
    delete process.env.CONVEX_ADMIN_KEY;

    await expect(
      ensureAuthoritativeTown({
        callerLogin: "deadronos",
        townId: "demo-town",
      }),
    ).rejects.toThrow("CONVEX_ADMIN_KEY");
  });

  it("runs hosted ticks through the shared simulation and queue finalizer", async () => {
    process.env.VILLAGESIM_STATE_MODE = "convex";
    const town = createMockTown({ id: "demo-town" });
    const tickResult: SimulationTickResult = {
      events: town.events,
      mode: "mock-local",
      npcResults: [],
      summary: {
        actionsCompleted: 0,
        actionsStarted: 0,
        decisions: 0,
        planner: { fallbackCount: 0, remoteCount: 0, sourceCounts: {}, queuedCount: 0 },
      },
      tick: 1,
      town: {
        ...town,
        tick: 1,
      },
    };
    const finalizeTown = vi.fn();

    fetchQuery.mockResolvedValueOnce(town);
    fetchMutation.mockResolvedValueOnce(tickResult.town);
    createHostedPlannerQueueForTick.mockReturnValue({
      finalizeTown,
      planner: vi.fn(),
    });
    runSimulationTick.mockResolvedValue(tickResult);

    const result = await runAuthoritativeTick({
      callerLogin: "deadronos",
      count: 1,
      townId: town.id,
    });

    expect(createHostedPlannerQueueForTick).toHaveBeenCalledWith(town.id, town.tick + 1);
    expect(runSimulationTick).toHaveBeenCalled();
    expect(finalizeTown).toHaveBeenCalledWith(tickResult.town, tickResult.summary.planner);
    expect(result.mode).toBe("convex-hosted");
  });

  it("handles hosted tick resets and rejects missing/zero-tick executions", async () => {
    process.env.VILLAGESIM_STATE_MODE = "convex";
    const town = createMockTown({ id: "demo-town" });
    const resetTown = { ...town, seed: "reset-seed" };
    const tickResult: SimulationTickResult = {
      events: town.events,
      mode: "mock-local",
      npcResults: [],
      summary: {
        actionsCompleted: 0,
        actionsStarted: 0,
        decisions: 0,
        planner: { fallbackCount: 0, remoteCount: 0, sourceCounts: {}, queuedCount: 0 },
      },
      tick: 1,
      town: { ...resetTown, tick: 1 },
    };
    const finalizeTown = vi.fn();

    fetchQuery.mockResolvedValueOnce(town);
    fetchMutation.mockResolvedValueOnce(resetTown).mockResolvedValueOnce(tickResult.town);
    createHostedPlannerQueueForTick.mockReturnValue({
      finalizeTown,
      planner: vi.fn(),
    });
    runSimulationTick.mockResolvedValue(tickResult);

    const result = await runAuthoritativeTick({
      callerLogin: "deadronos",
      count: 1,
      reset: true,
      seed: "reset-seed",
      townId: town.id,
    });

    expect(result.town.seed).toBe("reset-seed");
    expect(fetchMutation).toHaveBeenCalledTimes(2);

    fetchQuery.mockResolvedValueOnce(null);
    await expect(
      runAuthoritativeTick({
        callerLogin: "deadronos",
        count: 1,
        townId: "missing-town",
      }),
    ).rejects.toThrow("Town missing-town was not found");

    fetchQuery.mockResolvedValueOnce(town);
    await expect(
      runAuthoritativeTick({
        callerLogin: "deadronos",
        count: 0,
        townId: town.id,
      }),
    ).rejects.toThrow("No simulation tick was executed");
  });

  it("dispatches hosted planner work and records successful settlements", async () => {
    process.env.VILLAGESIM_STATE_MODE = "convex";
    const town = createMockTown({ id: "demo-town" });
    const entry = {
      id: "queue-1",
      npcId: "npc-mira",
      request: {
        callerLogin: "deadronos",
        env: {} as never,
        intent: "social" as const,
        now: town.now,
        npc: town.npcs["npc-mira"]!,
        tick: town.tick,
        townId: town.id,
      },
    };

    readHostedPlannerDrainPerDispatch.mockReturnValue(1);
    fetchQuery.mockResolvedValueOnce(town).mockResolvedValueOnce(town).mockResolvedValueOnce(town);
    fetchMutation.mockResolvedValue(town);
    claimHostedPlannerQueueEntry.mockReturnValue(entry);
    requestNpcPlan.mockResolvedValue({
      fallbackReason: null,
      failureReason: null,
      latencyMs: 12,
      plan: {
        createdAt: town.now,
        currentStepIndex: 0,
        id: "plan-1",
        intent: "social",
        rationale: "Say hi.",
        status: "pending",
        steps: [{ id: "plan-1-step-1", status: "pending", text: "Hi!", type: "speak" }],
        updatedAt: town.now,
      },
      source: "remote",
    });
    completeHostedPlannerQueueEntry.mockReturnValue({
      appliedPlan: true,
      dispatching: 0,
      outcome: "completed",
      queued: 0,
      remaining: 0,
    });
    recordHostedPlannerDispatchMetrics.mockReturnValue({
      dispatching: 0,
      queued: 0,
      remaining: 0,
    });

    const result = await dispatchHostedPlannerQueue({
      callerLogin: "deadronos",
      townId: town.id,
    });

    expect(randomUUID).toHaveBeenCalled();
    expect(claimHostedPlannerQueueEntry).toHaveBeenCalled();
    expect(completeHostedPlannerQueueEntry).toHaveBeenCalledWith(
      town,
      expect.objectContaining({ queueId: "queue-1", token: "dispatch-token-1" }),
    );
    expect(recordHostedPlannerDispatchMetrics).toHaveBeenCalled();
    expect(result).toMatchObject({
      claimed: 1,
      completed: 1,
      failed: 0,
      processed: 1,
    });
  });

  it("records failed hosted planner dispatches", async () => {
    process.env.VILLAGESIM_STATE_MODE = "convex";
    const town = createMockTown({ id: "demo-town" });
    const entry = {
      id: "queue-1",
      npcId: "npc-mira",
      request: {
        callerLogin: "deadronos",
        env: {} as never,
        intent: "social" as const,
        now: town.now,
        npc: town.npcs["npc-mira"]!,
        tick: town.tick,
        townId: town.id,
      },
    };

    readHostedPlannerDrainPerDispatch.mockReturnValue(1);
    fetchQuery.mockResolvedValueOnce(town).mockResolvedValueOnce(town).mockResolvedValueOnce(town);
    fetchMutation.mockResolvedValue(town);
    claimHostedPlannerQueueEntry.mockReturnValue(entry);
    requestNpcPlan.mockRejectedValue(new Error("planner failed"));
    failHostedPlannerQueueEntry.mockReturnValue({
      dispatching: 0,
      outcome: "failed",
      queued: 0,
      remaining: 0,
    });
    recordHostedPlannerDispatchMetrics.mockReturnValue({
      dispatching: 0,
      queued: 0,
      remaining: 0,
    });

    const result = await dispatchHostedPlannerQueue({
      callerLogin: "deadronos",
      townId: town.id,
    });

    expect(failHostedPlannerQueueEntry).toHaveBeenCalledWith(
      town,
      expect.objectContaining({ queueId: "queue-1", token: "dispatch-token-1" }),
    );
    expect(recordHostedPlannerDispatchMetrics).toHaveBeenCalled();
    expect(result).toMatchObject({
      claimed: 1,
      completed: 0,
      failed: 1,
      processed: 1,
    });
  });

  it("returns zeros when hosted dispatching is disabled and handles empty or missing queue states", async () => {
    await expect(dispatchHostedPlannerQueue({ townId: "demo-town" })).resolves.toEqual({
      claimed: 0,
      completed: 0,
      dispatching: 0,
      failed: 0,
      processed: 0,
      queued: 0,
      remaining: 0,
      skipped: 0,
    });

    process.env.VILLAGESIM_STATE_MODE = "convex";
    const town = createMockTown({ id: "demo-town" });

    readHostedPlannerDrainPerDispatch.mockReturnValue(1);
    fetchQuery.mockResolvedValueOnce(town).mockResolvedValueOnce(town);
    claimHostedPlannerQueueEntry.mockReturnValue(null);
    recordHostedPlannerDispatchMetrics.mockReturnValue({
      dispatching: 0,
      queued: 0,
      remaining: 0,
    });
    fetchMutation.mockResolvedValue(town);

    const empty = await dispatchHostedPlannerQueue({ townId: town.id });
    expect(empty).toMatchObject({
      claimed: 0,
      processed: 0,
      queued: 0,
      skipped: 0,
    });

    fetchQuery.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const missing = await dispatchHostedPlannerQueue({ townId: town.id });
    expect(missing).toMatchObject({
      claimed: 0,
      processed: 0,
      queued: 0,
      skipped: 0,
    });
  });
});
