import { describe, expect, it, vi } from "vitest";

import { createMockTown, getLocalMockTownState, resetLocalMockTown } from "../../lib/mockData";
import { runLocalMockTick, runSimulationTick } from "../../lib/sim_engine";
import type { PlannerRequest, PlannerResult } from "../../lib/types";

function createPlannerResult(request: PlannerRequest): PlannerResult {
  return {
    source: "mock",
    prompt: "integration-test-prompt",
    latencyMs: 0,
    plan: {
      id: `${request.npc.id}:integration-plan`,
      intent: request.intent,
      rationale: "Use a short wait plan for integration coverage.",
      createdAt: request.now,
      updatedAt: request.now,
      status: "pending",
      currentStepIndex: 0,
      steps: [
        {
          id: `${request.npc.id}:integration-plan:step-1`,
          type: "wait",
          seconds: 1,
          status: "pending",
        },
      ],
      planner: {
        source: "mock",
        requestedAt: request.now,
        completedAt: request.now,
        latencyMs: 0,
        fallbackReason: null,
        failureReason: null,
      },
    },
  };
}

describe("simulation integration", () => {
  it("progresses an in-flight action and records completion events", async () => {
    const town = createMockTown({ id: "integration-town" });
    const npc = town.npcs["npc-mira"];

    npc.currentAction = { type: "wait", remainingTicks: 1 };
    npc.lastDecisionTick = 0;

    const planner = vi.fn(async (request: PlannerRequest) => createPlannerResult(request));
    const result = await runSimulationTick(town, { planner });

    expect(result.tick).toBe(1);
    expect(result.summary.actionsCompleted).toBeGreaterThanOrEqual(1);
    expect(result.town.npcs["npc-mira"].currentAction?.type).not.toBe("wait");
    expect(result.events.some((event) => event.kind === "action_completed" && event.npcId === "npc-mira")).toBe(true);
  });

  it("persists local mock tick results back into the in-memory store", async () => {
    resetLocalMockTown({ id: "integration-local-town" });

    const before = getLocalMockTownState("integration-local-town");
    const result = await runLocalMockTick("integration-local-town");
    const after = getLocalMockTownState("integration-local-town");

    expect(before.tick).toBe(0);
    expect(result.tick).toBe(1);
    expect(after.tick).toBe(1);
    expect(after.events.length).toBeGreaterThan(before.events.length);
  });
});