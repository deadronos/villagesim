import { afterEach, describe, expect, it, vi } from "vitest";

import * as modelProxy from "../../lib/model_proxy";
import { createMockPlannerResult } from "../../lib/model_proxy";
import { createMockTown, getEnvironmentForNpc } from "../../lib/mockData";
import {
  claimHostedPlannerQueueEntry,
  completeHostedPlannerQueueEntry,
  createHostedPlannerQueueForTick,
  drainHostedPlannerQueue,
  ensurePlannerState,
  failHostedPlannerQueueEntry,
  recordHostedPlannerDispatchMetrics,
} from "../../lib/plannerExecution";
import type { PlannerQueueEntry, PlannerRequest } from "../../lib/types";

function createQueuedEntry(overrides: Partial<PlannerQueueEntry> = {}): PlannerQueueEntry {
  const town = createMockTown({ id: "planner-test-town" });
  const npc = town.npcs["npc-mira"];
  const request: PlannerRequest = {
    callerLogin: town.owner.login,
    env: getEnvironmentForNpc(town, npc.id),
    intent: "social",
    now: town.now,
    npc,
    rng: () => 0.5,
    tick: town.tick,
    townId: town.id,
  };

  return {
    id: "queue-1",
    intent: request.intent,
    npcId: npc.id,
    placeholderPlanId: "queue-1:placeholder",
    prompt: "Plan a safe social interaction.",
    request: {
      callerLogin: request.callerLogin,
      env: request.env,
      intent: request.intent,
      now: request.now,
      npc: request.npc,
      tick: request.tick,
      townId: request.townId,
    },
    requestedAt: request.now,
    requestedTick: request.tick,
    status: "queued",
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.VILLAGESIM_PLANNER_BUDGET_PER_TICK;
  delete process.env.VILLAGESIM_PLANNER_DRAIN_PER_DISPATCH;
  vi.restoreAllMocks();
});

describe("plannerExecution hosted dispatch helpers", () => {
  it("claims queued work, completes it, and records dispatch telemetry", () => {
    const town = createMockTown({ id: "planner-dispatch-town" });
    const plannerState = ensurePlannerState(town);
    plannerState.queue.push(createQueuedEntry());

    const claimed = claimHostedPlannerQueueEntry(town, {
      dispatchToken: "dispatch-token-1",
      now: town.now + 500,
      source: "manual",
    });

    expect(claimed?.status).toBe("dispatching");
    expect(plannerState.metrics.queuedCount).toBe(0);
    expect(plannerState.metrics.dispatchingCount).toBe(1);

    const result = createMockPlannerResult(
      {
        ...claimed!.request,
        rng: () => 0.5,
      },
      { latencyMs: 37 },
    );

    const settled = completeHostedPlannerQueueEntry(town, {
      completedAt: town.now + 1_000,
      queueId: claimed!.id,
      result,
      token: "dispatch-token-1",
    });

    expect(settled).toMatchObject({
      appliedPlan: true,
      outcome: "completed",
      queued: 0,
      remaining: 0,
    });
    expect(plannerState.metrics.totalCompleted).toBe(1);
    expect(plannerState.metrics.lastCompletionLatencyMs).toBe(37);
    expect(town.npcs["npc-mira"]?.plan?.planner?.queueId).toBe("queue-1");

    recordHostedPlannerDispatchMetrics(town, {
      completedAt: town.now + 1_500,
      processed: 1,
      result: "success",
      source: "manual",
      startedAt: town.now + 500,
    });

    expect(plannerState.metrics.lastDispatchSource).toBe("manual");
    expect(plannerState.metrics.lastDispatchDurationMs).toBe(1_000);
    expect(plannerState.metrics.lastDispatchProcessed).toBe(1);
    expect(plannerState.metrics.lastDispatchRemaining).toBe(0);
  });

  it("ignores stale completion attempts after a reclaimed dispatch lease", () => {
    const town = createMockTown({ id: "planner-stale-town" });
    const plannerState = ensurePlannerState(town);
    plannerState.queue.push(
      createQueuedEntry({
        dispatchAttemptCount: 1,
        dispatchStartedAt: town.now,
        dispatchToken: "old-token",
        lastDispatchSource: "after-response",
        status: "dispatching",
      }),
    );

    const reclaimed = claimHostedPlannerQueueEntry(town, {
      dispatchToken: "new-token",
      now: town.now + 31_000,
      source: "cron",
    });

    expect(reclaimed?.dispatchToken).toBe("new-token");

    const staleSettlement = failHostedPlannerQueueEntry(town, {
      completedAt: town.now + 31_500,
      error: new Error("stale failure should not win"),
      queueId: "queue-1",
      token: "old-token",
    });

    expect(staleSettlement.outcome).toBe("stale");
    expect(plannerState.queue[0]?.status).toBe("dispatching");
    expect(plannerState.queue[0]?.dispatchToken).toBe("new-token");
    expect(plannerState.metrics.totalFailed).toBe(0);
  });

  it("queues planner placeholders within budget and records budget exhaustion when finalized", async () => {
    process.env.VILLAGESIM_PLANNER_BUDGET_PER_TICK = "1";

    const town = createMockTown({ id: "planner-budget-town" });
    const queue = createHostedPlannerQueueForTick(town.id, town.tick + 1);
    const npc = town.npcs["npc-mira"]!;

    const first = await queue.planner({
      callerLogin: town.owner.login,
      env: getEnvironmentForNpc(town, npc.id),
      intent: "social",
      now: town.now,
      npc,
      rng: () => 0.5,
      tick: town.tick,
      townId: town.id,
    });
    const second = await queue.planner({
      callerLogin: town.owner.login,
      env: getEnvironmentForNpc(town, npc.id),
      intent: "trade",
      now: town.now + 1,
      npc,
      rng: () => 0.5,
      tick: town.tick,
      townId: town.id,
    });

    queue.finalizeTown(town, {
      averageLatencyMs: 0,
      fallbackCount: 1,
      queuedRequests: 1,
      requested: 2,
      sourceCounts: {
        mock: 1,
        "queued-placeholder": 1,
      },
    });

    const plannerState = ensurePlannerState(town);

    expect(first.source).toBe("queued-placeholder");
    expect(second.fallbackReason).toBe("budget_exhausted");
    expect(plannerState.queue).toHaveLength(1);
    expect(plannerState.lastTickBudget).toEqual({
      exhausted: true,
      maxRequests: 1,
      tick: 1,
      usedRequests: 1,
    });
    expect(plannerState.metrics.totalQueued).toBe(1);
    expect(plannerState.metrics.placeholderAssignments).toBe(1);
    expect(town.events.some((event) => event.kind === "planner_queued")).toBe(true);
    expect(town.events.some((event) => event.kind === "planner_budget_exhausted")).toBe(true);
  });

  it("drains queued planner work through success and failure paths", async () => {
    process.env.VILLAGESIM_PLANNER_DRAIN_PER_DISPATCH = "2";

    const town = createMockTown({ id: "planner-drain-town" });
    const plannerState = ensurePlannerState(town);
    const firstEntry = createQueuedEntry({ id: "queue-success", npcId: "npc-mira" });
    const secondEntry = createQueuedEntry({ id: "queue-failure", npcId: "npc-juno", request: { ...createQueuedEntry().request, npc: town.npcs["npc-juno"]!, env: getEnvironmentForNpc(town, "npc-juno") } });
    plannerState.queue.push(firstEntry, secondEntry);

    vi.spyOn(modelProxy, "requestNpcPlan")
      .mockResolvedValueOnce(
        createMockPlannerResult(
          {
            ...firstEntry.request,
            rng: () => 0.5,
          },
          { fallbackReason: "remote_failure", failureReason: "remote timeout", latencyMs: 21 },
        ),
      )
      .mockRejectedValueOnce(new Error("planner offline"));

    const result = await drainHostedPlannerQueue(town);

    expect(result).toEqual({
      processed: 2,
      remaining: 0,
    });
    expect(plannerState.queue[0]?.status).toBe("completed");
    expect(plannerState.queue[0]?.appliedPlan).toBe(true);
    expect(plannerState.queue[1]?.status).toBe("failed");
    expect(plannerState.metrics.totalCompleted).toBe(1);
    expect(plannerState.metrics.totalFailed).toBe(1);
    expect(plannerState.metrics.totalFallbacks).toBe(1);
    expect(town.events.some((event) => event.kind === "planner_completed")).toBe(true);
    expect(town.events.some((event) => event.kind === "planner_failed")).toBe(true);
    expect(town.events.some((event) => event.kind === "planner_fallback")).toBe(true);
  });
});
