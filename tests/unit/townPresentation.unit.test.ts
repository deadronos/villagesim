import { describe, expect, it } from "vitest";

import { createMockTown } from "../../lib/mockData";
import { mapTownData, normalizeTownId, titleizeTownId } from "../../app/town/[id]/townPresentation";

describe("town presentation helpers", () => {
  describe("normalizeTownId", () => {
    it("handles single valid string", () => {
      expect(normalizeTownId("my-town")).toBe("my-town");
    });

    it("handles array of valid strings by taking the first element", () => {
      expect(normalizeTownId(["my-town", "other-town"])).toBe("my-town");
    });

    it("handles undefined by returning the default town id", () => {
      expect(normalizeTownId(undefined)).toBe("starter-hollow");
    });

    it("lowercases strings", () => {
      expect(normalizeTownId("My-Town")).toBe("my-town");
    });

    it("replaces special characters and spaces with hyphens", () => {
      expect(normalizeTownId("  My Cool Town!!  ")).toBe("my-cool-town");
      expect(normalizeTownId([" Hello World ", "test"])).toBe("hello-world");
    });

    it("handles strings that become empty after replacement and trimming", () => {
      expect(normalizeTownId("--++--")).toBe("starter-hollow");
    });

    it("handles empty string", () => {
      expect(normalizeTownId("")).toBe("starter-hollow");
    });

    it("handles empty array", () => {
      expect(normalizeTownId([])).toBe("starter-hollow");
    });
  });

  describe("titleizeTownId", () => {
    it("titleizes normal hyphenated ids", () => {
      expect(titleizeTownId("lantern-hollow")).toBe("Lantern Hollow");
      expect(titleizeTownId("super-cool-town")).toBe("Super Cool Town");
    });

    it("handles single words", () => {
      expect(titleizeTownId("hollow")).toBe("Hollow");
    });

    it("handles empty strings", () => {
      expect(titleizeTownId("")).toBe("");
    });

    it("handles consecutive hyphens", () => {
      expect(titleizeTownId("lantern--hollow")).toBe("Lantern Hollow");
    });

    it("handles leading and trailing hyphens", () => {
      expect(titleizeTownId("-lantern-hollow-")).toBe("Lantern Hollow");
    });

    it("preserves existing capitalization in parts", () => {
      expect(titleizeTownId("lANtern-Hollow")).toBe("LANtern Hollow");
    });
  });

  it("maps a town state into UI-friendly town data", () => {
    const town = createMockTown({ id: "lantern-hollow" });
    town.tick = 19;
    town.events.push(
      {
        at: town.now + 1_000,
        id: "event-decision",
        kind: "decision",
        message: "Mira reconsidered her next move.",
        npcId: "npc-mira",
        tick: town.tick,
      },
      {
        at: town.now + 2_000,
        id: "event-plan-assigned",
        kind: "plan_assigned",
        message: "Juno picked up a fresh social plan.",
        npcId: "npc-juno",
        tick: town.tick,
      },
    );
    town.npcs["npc-mira"]!.currentAction = {
      count: 2,
      remainingTicks: 1,
      type: "gather",
      item: "wood",
    };
    town.npcs["npc-juno"]!.plan = {
      createdAt: town.now,
      currentStepIndex: 0,
      id: "plan-1",
      intent: "social",
      planner: { source: "mock" },
      rationale: "Say hello at the market.",
      status: "pending",
      steps: [
        {
          id: "plan-1-step-1",
          status: "pending",
          text: "Morning!",
          type: "speak",
        },
      ],
      updatedAt: town.now,
    };

    const presented = mapTownData(town);
    const mira = presented.npcs.find((npc) => npc.id === "npc-mira");
    const juno = presented.npcs.find((npc) => npc.id === "npc-juno");

    expect(presented.id).toBe("lantern-hollow");
    expect(presented.timeOfDay).toBe("Evening wind-down");
    expect(presented.weather).toBe("Soft rain");
    expect(presented.activityFeed[0]).toEqual({
      id: "event-plan-assigned",
      label: "Juno picked up a fresh social plan.",
      tone: "good",
    });
    expect(presented.activityFeed[1]?.tone).toBe("alert");
    expect(mira?.currentAction).toBe("gathering wood");
    expect(mira?.summary).toContain("gathering wood");
    expect(juno?.currentAction).toBe("planning social");
    expect(presented.map.flat()).toContain("plaza");
    expect(presented.map.flat()).toContain("home");
    expect(presented.map.flat()).toContain("field");
    expect(presented.map.flat()).toContain("path");
  });
});
