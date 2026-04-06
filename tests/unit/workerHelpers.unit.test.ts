import { describe, expect, it, vi } from "vitest";

import { getEnvironmentForNpc, resetLocalMockTown } from "../../lib/mockData";
import {
  applyImmediateAction,
  assignPlanToNpc,
  fetchNpcsNeedingDecision,
  fetchTownSnapshot,
  getLocalEnvSlice,
} from "../../workers/worker_helpers";

vi.mock("../../lib/model_proxy", () => ({
  requestNpcPlan: vi.fn(),
}));

describe("worker helpers", () => {
  it("returns the local town snapshot and NPC environment slices", async () => {
    const town = resetLocalMockTown({ id: "worker-town" });

    await expect(fetchTownSnapshot("worker-town")).resolves.toMatchObject({ id: "worker-town" });
    await expect(getLocalEnvSlice("worker-town", "npc-mira")).resolves.toEqual(getEnvironmentForNpc(town, "npc-mira"));
  });

  it("lists NPCs needing decisions with the shared simulation helper", async () => {
    const town = resetLocalMockTown({ id: "worker-decision-town" });

    const npcs = await fetchNpcsNeedingDecision(town.id);

    expect(npcs.length).toBeGreaterThan(0);
    expect(npcs.some((npc) => npc.id === "npc-mira")).toBe(true);
  });

  it("applies immediate actions and assigned plans back into local state", async () => {
    const town = resetLocalMockTown({ id: "worker-mutation-town" });

    const updatedNpc = await applyImmediateAction(town.id, "npc-mira", {
      remainingTicks: 1,
      startedAtTick: town.tick,
      type: "wait",
    });
    expect(updatedNpc.currentAction).toMatchObject({ type: "wait" });

    const plannedNpc = await assignPlanToNpc(town.id, "npc-mira", {
      createdAt: town.now,
      currentStepIndex: 0,
      id: "worker-plan",
      intent: "social",
      rationale: "Talk to someone nearby.",
      status: "pending",
      steps: [{ id: "worker-plan-step-1", status: "pending", text: "Hello!", type: "speak" }],
      updatedAt: town.now,
    });

    expect(plannedNpc.plan?.id).toBe("worker-plan");
  });
});
