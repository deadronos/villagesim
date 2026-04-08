import { describe, expect, it } from "vitest";

import { createMockTown } from "../../lib/mockData";
import {
  appendTownEvent,
  applyNpcActionToTown,
  assignPlanToTown,
  collectNpcsNeedingDecision,
  createTownEventId,
  runSimulationTick,
  startNpcPlanIfIdle,
} from "../../lib/sim_engine";

describe("sim_engine helpers", () => {
  it("trims retained town events and generates stable event ids", () => {
    const town = createMockTown({ id: "event-town" });

    for (let index = 0; index < 205; index += 1) {
      appendTownEvent(town, {
        at: town.now + index,
        id: `event-${index}`,
        kind: "tick",
        message: `Event ${index}`,
        tick: town.tick,
      });
    }

    expect(town.events).toHaveLength(200);
    expect(createTownEventId(town, "npc-mira", "suffix")).toBe(`event-town:0:npc-mira:suffix:${town.events.length + 1}`);
  });

  it("applies actions and plans to NPCs and filters decision candidates", () => {
    const town = createMockTown({ id: "decision-town" });
    const plan = {
      createdAt: town.now,
      currentStepIndex: 0,
      id: "speak-plan",
      intent: "social" as const,
      rationale: "Say hi.",
      status: "pending" as const,
      steps: [{ id: "speak-step", status: "pending" as const, text: "Hello!", type: "speak" as const }],
      updatedAt: town.now,
    };

    applyNpcActionToTown(town, "npc-juno", {
      amount: 1,
      item: "food",
      type: "trade",
    });
    assignPlanToTown(town, "npc-mira", plan);

    const started = startNpcPlanIfIdle(town, "npc-mira");

    expect(started).toMatchObject({
      planStepId: "speak-step",
      text: "Hello!",
      type: "speak",
    });
    expect(collectNpcsNeedingDecision(town, 1).some((npc) => npc.id === "npc-mira")).toBe(false);
    expect(() => applyNpcActionToTown(town, "missing", { remainingTicks: 1, type: "wait" })).toThrow("NPC missing");
  });

  it("progresses actions and planner-assigned work during a simulation tick", async () => {
    const town = createMockTown({ id: "tick-town" });

    for (const npc of Object.values(town.npcs)) {
      npc.currentAction = { remainingTicks: 3, type: "wait" };
    }

    town.npcs["npc-mira"]!.currentAction = {
      amount: 1,
      item: "food",
      remainingTicks: 1,
      type: "trade",
    };
    town.npcs["npc-juno"]!.currentAction = {
      count: 2,
      item: "wood",
      remainingTicks: 1,
      type: "gather",
    };
    town.npcs["npc-toma"]!.plan = {
      createdAt: town.now,
      currentStepIndex: 0,
      id: "move-plan",
      intent: "work",
      rationale: "Go work.",
      status: "pending",
      steps: [{ id: "move-step", status: "pending", target: { x: 14, y: 4 }, type: "move" }],
      updatedAt: town.now,
    };
    town.npcs["npc-toma"]!.currentAction = null;

    const result = await runSimulationTick(town, { now: town.now + 60_000, rng: () => 0.5 });

    expect(result.tick).toBe(1);
    expect(result.summary.actionsCompleted).toBeGreaterThanOrEqual(2);
    expect(result.town.npcs["npc-mira"]!.inventory.food).toBeGreaterThan(0);
    expect(result.town.npcs["npc-juno"]!.inventory.wood).toBeGreaterThan(town.npcs["npc-juno"]!.inventory.wood);
    expect(result.town.npcs["npc-toma"]!.currentAction?.type).toBe("move");
    expect(result.events.some((event) => event.kind === "action_completed")).toBe(true);
  });

  it("covers additional action progress branches for eat, rest, speak, work, and move", async () => {
    const town = createMockTown({ id: "action-branches-town" });

    for (const npc of Object.values(town.npcs)) {
      npc.currentAction = { remainingTicks: 3, type: "wait" };
    }

    town.npcs["npc-mira"]!.currentAction = {
      amount: 1,
      targetId: "bakery-main",
      type: "eat",
    };
    town.npcs["npc-juno"]!.currentAction = {
      remainingTicks: 1,
      targetId: "home-west",
      type: "rest",
    };
    town.npcs["npc-toma"]!.currentAction = {
      targetId: "npc-mira",
      text: "Morning!",
      type: "speak",
    };
    town.npcs["npc-ivy"]!.currentAction = {
      remainingTicks: 1,
      targetId: "workshop-yard",
      task: "repair fence",
      type: "work",
    };
    town.npcs["npc-soren"]!.currentAction = {
      remainingTicks: 2,
      speed: 1,
      target: { x: 20, y: 20 },
      type: "move",
    };

    const beforeFood = town.npcs["npc-mira"]!.inventory.food;
    const beforeEnergy = town.npcs["npc-juno"]!.status.energy;
    const beforeSocial = town.npcs["npc-toma"]!.status.social;
    const beforeWood = town.npcs["npc-ivy"]!.inventory.wood;
    const beforePosition = { ...town.npcs["npc-soren"]!.position };

    const result = await runSimulationTick(town, { now: town.now + 60_000, rng: () => 0.5 });

    expect(result.summary.actionsCompleted).toBeGreaterThanOrEqual(4);
    expect(result.town.npcs["npc-mira"]!.inventory.food).toBeLessThanOrEqual(beforeFood);
    expect(result.town.npcs["npc-juno"]!.status.energy).toBeLessThan(beforeEnergy);
    expect(result.town.npcs["npc-toma"]!.status.social).toBeLessThan(beforeSocial);
    expect(result.town.npcs["npc-ivy"]!.inventory.wood).toBeLessThanOrEqual(beforeWood);
    expect(result.town.npcs["npc-soren"]!.position).not.toEqual(beforePosition);
    expect(result.town.npcs["npc-soren"]!.currentAction?.type).toBe("move");
  });

  describe("collectNpcsNeedingDecision", () => {
    it("filters NPCs correctly based on plan status, current action, and decision threshold", () => {
      const town = createMockTown({ id: "collect-decision-town" });
      town.tick = 10;

      // Base setup: Make all idle, threshold is 0.
      for (const npc of Object.values(town.npcs)) {
        npc.plan = null;
        npc.currentAction = null;
        npc.lastDecisionTick = 0;
      }

      // Scenario 1: Needs decision (Happy path). No plan, no current action, tick threshold met.
      town.npcs["npc-mira"]!.lastDecisionTick = 5;

      // Scenario 2: Active plan.
      town.npcs["npc-juno"]!.plan = {
        id: "active-plan",
        intent: "work",
        rationale: "Work",
        status: "active",
        currentStepIndex: 0,
        steps: [{ id: "step-1", status: "pending", type: "wait" }],
        createdAt: town.now,
        updatedAt: town.now,
      };

      // Scenario 3: Completed plan. Should need decision.
      town.npcs["npc-toma"]!.plan = {
        id: "completed-plan",
        intent: "rest",
        rationale: "Rest",
        status: "done",
        currentStepIndex: 0,
        steps: [{ id: "step-1", status: "done", type: "wait" }],
        createdAt: town.now,
        updatedAt: town.now,
      };

      // Scenario 4: Current action.
      town.npcs["npc-ivy"]!.currentAction = {
        type: "wait",
        remainingTicks: 1,
      };

      // Scenario 5: Tick threshold not met.
      // town.tick is 10. thresholdTicks = 5. Therefore, lastDecisionTick > 5 means threshold not met.
      town.npcs["npc-soren"]!.lastDecisionTick = 8;

      const npcs = collectNpcsNeedingDecision(town, 5);

      const npcIds = npcs.map((n) => n.id);

      expect(npcIds).toContain("npc-mira"); // Scenario 1
      expect(npcIds).not.toContain("npc-juno"); // Scenario 2
      expect(npcIds).toContain("npc-toma"); // Scenario 3
      expect(npcIds).not.toContain("npc-ivy"); // Scenario 4
      expect(npcIds).not.toContain("npc-soren"); // Scenario 5

      // Scenario 6: Mixed state - Completed plan BUT with a current action
      town.npcs["npc-toma"]!.currentAction = { type: "wait", remainingTicks: 1 };
      const npcsMixed = collectNpcsNeedingDecision(town, 5);
      expect(npcsMixed.map(n => n.id)).not.toContain("npc-toma");
    });
  });
});
