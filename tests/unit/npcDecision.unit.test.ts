import { describe, expect, it } from "vitest";
import { buildDecisionCandidates } from "../../lib/npc_decision";
import { NpcEnvironment, NpcState } from "../../lib/types";

describe("buildDecisionCandidates", () => {
  const defaultNpc: NpcState = {
    id: "npc-1",
    name: "Test Npc",
    role: "farmer",
    position: { x: 0, y: 0 },
    inventory: { grain: 0, wood: 0, food: 0 },
    status: { hunger: 100, energy: 100, social: 100, focus: 100 },
    lastDecisionTick: 0,
    plan: null,
    currentAction: null,
  };

  const defaultEnv: NpcEnvironment = {
    timeOfDay: "morning",
    distances: {},
    nearby: {
      people: [],
    },
  };

  it("returns base candidates correctly for morning", () => {
    const candidates = buildDecisionCandidates(defaultNpc, defaultEnv);
    const workBase = candidates.find(c => c.type === "work")?.base;
    expect(workBase).toBeCloseTo(1.1);
    expect(candidates).toContainEqual(expect.objectContaining({ type: "eat", base: 0.75 }));
    expect(candidates).toContainEqual(expect.objectContaining({ type: "rest", base: 0.65 }));
    expect(candidates).toContainEqual(expect.objectContaining({ type: "social", base: 0.55 }));
    expect(candidates).toContainEqual(expect.objectContaining({ type: "trade", base: 0.6 }));
    expect(candidates).toContainEqual(expect.objectContaining({ type: "wait", base: 0.25 }));
  });

  it("increases rest base value at night and decreases work base value", () => {
    const nightEnv = { ...defaultEnv, timeOfDay: "night" as const };
    const candidates = buildDecisionCandidates(defaultNpc, nightEnv);
    const workBase = candidates.find(c => c.type === "work")?.base;
    expect(workBase).toBeCloseTo(0.8);
    expect(candidates).toContainEqual(expect.objectContaining({ type: "rest", base: 0.9 }));
  });

  it("increases eat base value if food is in inventory", () => {
    const npcWithFood = { ...defaultNpc, inventory: { ...defaultNpc.inventory, food: 1 } };
    const candidates = buildDecisionCandidates(npcWithFood, defaultEnv);
    expect(candidates).toContainEqual(expect.objectContaining({ type: "eat", base: 0.9 }));
  });

  it("increases trade base value if grain or wood is in inventory", () => {
    const npcWithGrain = { ...defaultNpc, inventory: { ...defaultNpc.inventory, grain: 1 } };
    const candidates = buildDecisionCandidates(npcWithGrain, defaultEnv);
    expect(candidates).toContainEqual(expect.objectContaining({ type: "trade", base: 0.7 }));
  });

  it("increases social base value if people are nearby", () => {
    const envWithPeople = { ...defaultEnv, nearby: { people: [{ id: "person-1", name: "Person 1", position: { x: 1, y: 1 } }] } };
    const candidates = buildDecisionCandidates(defaultNpc, envWithPeople);
    expect(candidates).toContainEqual(expect.objectContaining({ type: "social", base: 0.65 }));
  });

  it("extracts work target from env", () => {
     const envWithMarket = { ...defaultEnv, nearby: { people: [], market: { id: "market-1", label: "Market", position: { x: 10, y: 10 } } } };
     const candidates = buildDecisionCandidates(defaultNpc, envWithMarket);
     expect(candidates.find(c => c.type === "work")?.target).toEqual({ id: "market-1", kind: "location", position: { x: 10, y: 10 }, label: "Market" });
  });

  it("extracts eat target from env", () => {
     const envWithFood = { ...defaultEnv, nearby: { people: [], food: { id: "food-1", label: "Food", position: { x: 10, y: 10 } } } };
     const candidates = buildDecisionCandidates(defaultNpc, envWithFood);
     expect(candidates.find(c => c.type === "eat")?.target).toEqual({ id: "food-1", kind: "location", position: { x: 10, y: 10 }, label: "Food" });
  });

  it("extracts rest target from env", () => {
     const envWithHome = { ...defaultEnv, nearby: { people: [], home: { id: "home-1", label: "Home", position: { x: 10, y: 10 } } } };
     const candidates = buildDecisionCandidates(defaultNpc, envWithHome);
     expect(candidates.find(c => c.type === "rest")?.target).toEqual({ id: "home-1", kind: "location", position: { x: 10, y: 10 }, label: "Home" });
  });

  it("extracts trade target from env (market prioritized over food)", () => {
     const envWithMarketAndFood = { ...defaultEnv, nearby: { people: [], food: { id: "food-1", label: "Food", position: { x: 10, y: 10 } }, market: { id: "market-1", label: "Market", position: { x: 20, y: 20 } } } };
     const candidates = buildDecisionCandidates(defaultNpc, envWithMarketAndFood);
     expect(candidates.find(c => c.type === "trade")?.target).toEqual({ id: "market-1", kind: "location", position: { x: 20, y: 20 }, label: "Market" });
  });

  it("extracts social target from env (person prioritized over plaza)", () => {
     const envWithPersonAndPlaza = { ...defaultEnv, nearby: { people: [{ id: "person-1", name: "Person 1", position: { x: 1, y: 1 } }], plaza: { id: "plaza-1", label: "Plaza", position: { x: 10, y: 10 } } } };
     const candidates = buildDecisionCandidates(defaultNpc, envWithPersonAndPlaza);
     expect(candidates.find(c => c.type === "social")?.target).toEqual({ id: "person-1", kind: "npc", position: { x: 1, y: 1 }, label: "Person 1" });
  });

  it("extracts social target from env (plaza fallback)", () => {
     const envWithPlaza = { ...defaultEnv, nearby: { people: [], plaza: { id: "plaza-1", label: "Plaza", position: { x: 10, y: 10 } } } };
     const candidates = buildDecisionCandidates(defaultNpc, envWithPlaza);
     expect(candidates.find(c => c.type === "social")?.target).toEqual({ id: "plaza-1", kind: "location", position: { x: 10, y: 10 }, label: "Plaza" });
  });
});
