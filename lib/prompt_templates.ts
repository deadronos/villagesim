import type { NpcEnvironment, NpcState, PlanIntent } from "./types";

export const PLANNER_SYSTEM_PROMPT = [
  "You are a village planner.",
  "Return compact JSON only.",
  'Schema: {"rationale":"string","plan":[{"type":"move|work|gather|speak|rest|trade|wait",...}]}.',
  "Keep plans short, safe, and grounded in the local village context.",
  "Never invent external systems or credentials.",
].join(" ");

function compactNpcView(npc: NpcState) {
  return {
    id: npc.id,
    name: npc.name,
    role: npc.role,
    position: npc.position,
    status: npc.status,
    inventory: npc.inventory,
    memory: npc.memory,
    currentAction: npc.currentAction,
  };
}

function compactEnvView(env: NpcEnvironment) {
  return {
    tick: env.tick,
    timeOfDay: env.timeOfDay,
    townMood: env.townMood,
    nearby: {
      home: env.nearby.home,
      field: env.nearby.field,
      food: env.nearby.food,
      market: env.nearby.market,
      plaza: env.nearby.plaza,
      workshop: env.nearby.workshop,
      people: env.nearby.people,
    },
  };
}

export interface PlannerPromptInput {
  npc: NpcState;
  env: NpcEnvironment;
  intent: PlanIntent;
}

export function buildPlannerPrompt(input: PlannerPromptInput): string {
  return [
    `SYSTEM: ${PLANNER_SYSTEM_PROMPT}`,
    `NPC: ${JSON.stringify(compactNpcView(input.npc))}`,
    `ENV: ${JSON.stringify(compactEnvView(input.env))}`,
    `INTENT: ${JSON.stringify(input.intent)}`,
    "Allowed actions: move(target:{x,y}), work(task,targetId?), gather(item,count,targetId?), speak(text,targetId?), rest, trade(item,amount,targetId?), wait(seconds).",
    'Return example: {"rationale":"...","plan":[{"type":"move","target":{"x":1,"y":2}}]}',
  ].join("\\n");
}
