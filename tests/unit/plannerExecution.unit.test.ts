import { describe, expect, it } from "vitest";

import { createMockPlannerResult } from "../../lib/model_proxy";
import { createMockTown, getEnvironmentForNpc } from "../../lib/mockData";
import {
  claimHostedPlannerQueueEntry,
  completeHostedPlannerQueueEntry,
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
});
