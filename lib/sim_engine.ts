import {
  cloneTownState,
  createSeededRng,
  ensureLocalMockTownState,
  getEnvironmentForNpc,
  getLocalMockTownState,
  listTownNpcs,
  setLocalMockTownState,
} from "./mockData";
import { requestNpcPlan } from "./model_proxy";
import { weightedDecision } from "./npc_decision";
import type {
  NpcAction,
  NpcPlan,
  NpcPlanStep,
  NpcState,
  RandomSource,
  SimulationTickResult,
  TickNpcResult,
  TownEvent,
  TownState,
} from "./types";

export interface SimulationTickOptions {
  now?: number;
  rng?: RandomSource;
  planner?: typeof requestNpcPlan;
}

function clampNeed(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function pushEvent(town: TownState, event: TownEvent): void {
  town.events.push(event);
  if (town.events.length > 200) {
    town.events = town.events.slice(-200);
  }
}

function makeEventId(town: TownState, npcId: string | undefined, suffix: string): string {
  return `${town.id}:${town.tick}:${npcId ?? "town"}:${suffix}:${town.events.length + 1}`;
}

function touchNpcMemory(npc: NpcState, message: string): void {
  npc.memory.recentEvents = [...npc.memory.recentEvents.slice(-3), message];
  npc.memory.summary = [...npc.memory.recentEvents.slice(-2), message].join(" | ");
}

function defaultActionDuration(action: NpcAction): number {
  switch (action.type) {
    case "move":
    case "eat":
    case "speak":
    case "trade":
      return 1;
    case "rest":
      return action.remainingTicks ?? 2;
    case "work":
      return action.remainingTicks ?? 2;
    case "gather":
      return action.remainingTicks ?? 2;
    case "wait":
    default:
      return action.remainingTicks ?? 1;
  }
}

function normalizeAction(town: TownState, action: NpcAction): NpcAction {
  return {
    ...action,
    startedAtTick: action.startedAtTick ?? town.tick,
    remainingTicks: action.remainingTicks ?? defaultActionDuration(action),
  };
}

function moveTowards(current: NpcState["position"], target: NpcState["position"], speed: number): { next: NpcState["position"]; arrived: boolean } {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= speed) {
    return { next: { ...target }, arrived: true };
  }
  return {
    next: {
      x: Math.round((current.x + (dx / distance) * speed) * 100) / 100,
      y: Math.round((current.y + (dy / distance) * speed) * 100) / 100,
    },
    arrived: false,
  };
}

function applyPassiveDrift(npc: NpcState): void {
  npc.status.hunger = clampNeed(npc.status.hunger + 2);
  npc.status.energy = clampNeed(npc.status.energy + 1);
  npc.status.social = clampNeed(npc.status.social + 1);
  npc.status.focus = clampNeed(npc.status.focus + 1);
}

function completePlanStep(npc: NpcState, completedAction: NpcAction | null, now: number): void {
  if (!npc.plan) {
    return;
  }
  const stepIndex = completedAction?.planStepId
    ? npc.plan.steps.findIndex((step) => step.id === completedAction.planStepId)
    : npc.plan.currentStepIndex;
  const step = npc.plan.steps[stepIndex];
  if (!step) {
    return;
  }
  step.status = "done";
  npc.plan.currentStepIndex = stepIndex + 1;
  npc.plan.updatedAt = now;
  if (npc.plan.currentStepIndex >= npc.plan.steps.length) {
    npc.plan.status = "done";
  } else {
    npc.plan.status = "active";
  }
}

function beginNextPlanStep(town: TownState, npc: NpcState): NpcAction | null {
  if (!npc.plan || npc.plan.status === "done") {
    return null;
  }
  const step = npc.plan.steps[npc.plan.currentStepIndex];
  if (!step) {
    npc.plan.status = "done";
    return null;
  }
  step.status = "active";
  npc.plan.status = "active";
  const action = planStepToAction(step);
  applyNpcActionToTown(town, npc.id, { ...action, planStepId: step.id });
  return npc.currentAction;
}

function planStepToAction(step: NpcPlanStep): NpcAction {
  switch (step.type) {
    case "move":
      return { type: "move", target: step.target, speed: 1, remainingTicks: 1 };
    case "work":
      return { type: "work", task: step.task, targetId: step.targetId, remainingTicks: 2 };
    case "gather":
      return { type: "gather", item: step.item, count: step.count, targetId: step.targetId, remainingTicks: 2 };
    case "speak":
      return { type: "speak", text: step.text, targetId: step.targetId, remainingTicks: 1 };
    case "rest":
      return { type: "rest", remainingTicks: 2 };
    case "trade":
      return { type: "trade", item: step.item, amount: step.amount, targetId: step.targetId, remainingTicks: 1 };
    case "wait":
    default:
      return { type: "wait", remainingTicks: Math.max(1, Math.ceil(step.seconds / 2)) };
  }
}

export function collectNpcsNeedingDecision(town: TownState, thresholdTicks = 0): NpcState[] {
  return listTownNpcs(town).filter((npc) => {
    const hasActivePlan = Boolean(npc.plan && npc.plan.status !== "done");
    const hasCurrentAction = Boolean(npc.currentAction);
    return !hasActivePlan && !hasCurrentAction && town.tick - npc.lastDecisionTick >= thresholdTicks;
  });
}

export function applyNpcActionToTown(town: TownState, npcId: string, action: NpcAction): NpcState {
  const npc = town.npcs[npcId];
  if (!npc) {
    throw new Error(`NPC ${npcId} was not found in town ${town.id}`);
  }
  npc.currentAction = normalizeAction(town, action);
  npc.lastDecisionTick = town.tick;
  touchNpcMemory(npc, `Started ${npc.currentAction.type}`);
  pushEvent(town, {
    id: makeEventId(town, npcId, "action-started"),
    tick: town.tick,
    at: town.now,
    npcId,
    kind: "action_started",
    message: `${npc.name} started ${npc.currentAction.type}.`,
    details: { action: npc.currentAction },
  });
  return npc;
}

export function assignPlanToTown(town: TownState, npcId: string, plan: NpcPlan): NpcState {
  const npc = town.npcs[npcId];
  if (!npc) {
    throw new Error(`NPC ${npcId} was not found in town ${town.id}`);
  }
  npc.plan = plan;
  npc.currentAction = null;
  npc.lastDecisionTick = town.tick;
  touchNpcMemory(npc, `Assigned plan ${plan.intent}`);
  pushEvent(town, {
    id: makeEventId(town, npcId, "plan-assigned"),
    tick: town.tick,
    at: town.now,
    npcId,
    kind: "plan_assigned",
    message: `${npc.name} received a ${plan.intent} plan.`,
    details: { planId: plan.id, intent: plan.intent },
  });
  return npc;
}

function completeCurrentAction(town: TownState, npc: NpcState, action: NpcAction): void {
  touchNpcMemory(npc, `Completed ${action.type}`);
  pushEvent(town, {
    id: makeEventId(town, npc.id, "action-complete"),
    tick: town.tick,
    at: town.now,
    npcId: npc.id,
    kind: "action_completed",
    message: `${npc.name} completed ${action.type}.`,
    details: { action },
  });
  if (npc.plan) {
    completePlanStep(npc, action, town.now);
    if (npc.plan.status === "done") {
      pushEvent(town, {
        id: makeEventId(town, npc.id, "plan-complete"),
        tick: town.tick,
        at: town.now,
        npcId: npc.id,
        kind: "plan_completed",
        message: `${npc.name} completed plan ${npc.plan.intent}.`,
        details: { planId: npc.plan.id },
      });
      touchNpcMemory(npc, `Completed ${npc.plan.intent} plan`);
    }
  }
  npc.currentAction = null;
}

function progressAction(town: TownState, npc: NpcState): NpcAction | null {
  const action = npc.currentAction;
  if (!action) {
    return null;
  }

  switch (action.type) {
    case "move": {
      const next = moveTowards(npc.position, action.target, action.speed ?? 1);
      npc.position = next.next;
      npc.status.hunger = clampNeed(npc.status.hunger + 1);
      npc.status.energy = clampNeed(npc.status.energy + 2);
      if (next.arrived) {
        completeCurrentAction(town, npc, action);
        return action;
      }
      npc.currentAction = { ...action, remainingTicks: Math.max(0, (action.remainingTicks ?? 1) - 1) };
      return null;
    }
    case "eat": {
      if (npc.inventory.food > 0) {
        npc.inventory.food -= 1;
      }
      npc.status.hunger = clampNeed(npc.status.hunger - 35);
      npc.status.energy = clampNeed(npc.status.energy - 4);
      completeCurrentAction(town, npc, action);
      return action;
    }
    case "rest": {
      npc.status.energy = clampNeed(npc.status.energy - 22);
      npc.status.social = clampNeed(npc.status.social + 1);
      const remaining = Math.max(0, (action.remainingTicks ?? 1) - 1);
      if (remaining <= 0) {
        completeCurrentAction(town, npc, { ...action, remainingTicks: remaining });
        return action;
      }
      npc.currentAction = { ...action, remainingTicks: remaining };
      return null;
    }
    case "speak": {
      npc.status.social = clampNeed(npc.status.social - 28);
      npc.status.focus = clampNeed(npc.status.focus - 3);
      completeCurrentAction(town, npc, action);
      return action;
    }
    case "trade": {
      if (action.item === "food") {
        npc.inventory.coins = Math.max(0, npc.inventory.coins - action.amount);
        npc.inventory.food += action.amount;
      } else if (action.item === "grain") {
        npc.inventory.grain = Math.max(0, npc.inventory.grain - action.amount);
        npc.inventory.coins += action.amount;
      } else if (action.item === "wood") {
        npc.inventory.wood = Math.max(0, npc.inventory.wood - action.amount);
        npc.inventory.coins += action.amount;
      }
      npc.status.social = clampNeed(npc.status.social - 8);
      completeCurrentAction(town, npc, action);
      return action;
    }
    case "gather": {
      if (action.item === "grain") {
        npc.inventory.grain += action.count;
      } else {
        npc.inventory.wood += action.count;
      }
      npc.status.energy = clampNeed(npc.status.energy + 6);
      npc.status.hunger = clampNeed(npc.status.hunger + 4);
      const remaining = Math.max(0, (action.remainingTicks ?? 1) - 1);
      if (remaining <= 0) {
        completeCurrentAction(town, npc, { ...action, remainingTicks: remaining });
        return action;
      }
      npc.currentAction = { ...action, remainingTicks: remaining };
      return null;
    }
    case "work": {
      if (npc.role === "farmer") {
        npc.inventory.grain += 1;
      } else if (npc.role === "baker") {
        npc.inventory.food += 1;
      } else if (npc.role === "builder") {
        npc.inventory.wood = Math.max(0, npc.inventory.wood - 1);
      } else {
        npc.inventory.coins += 1;
      }
      npc.status.energy = clampNeed(npc.status.energy + 8);
      npc.status.hunger = clampNeed(npc.status.hunger + 5);
      npc.status.focus = clampNeed(npc.status.focus - 10);
      const remaining = Math.max(0, (action.remainingTicks ?? 1) - 1);
      if (remaining <= 0) {
        completeCurrentAction(town, npc, { ...action, remainingTicks: remaining });
        return action;
      }
      npc.currentAction = { ...action, remainingTicks: remaining };
      return null;
    }
    case "wait":
    default: {
      const remaining = Math.max(0, (action.remainingTicks ?? 1) - 1);
      if (remaining <= 0) {
        completeCurrentAction(town, npc, { ...action, remainingTicks: remaining });
        return action;
      }
      npc.currentAction = { ...action, remainingTicks: remaining };
      return null;
    }
  }
}

function makeNpcResult(npc: NpcState): TickNpcResult {
  return {
    npcId: npc.id,
    npcName: npc.name,
    notes: [],
  };
}

export async function runSimulationTick(
  sourceTown: TownState,
  options: SimulationTickOptions = {},
): Promise<SimulationTickResult> {
  const town = cloneTownState(sourceTown);
  town.tick += 1;
  town.now = options.now ?? town.now + 60_000;
  const rng = options.rng ?? createSeededRng(`${town.seed}:${town.tick}`);
  const planner = options.planner ?? requestNpcPlan;
  const npcResults = listTownNpcs(town).map(makeNpcResult);
  const resultIndex = new Map(npcResults.map((npcResult) => [npcResult.npcId, npcResult]));
  let actionsStarted = 0;
  let actionsCompleted = 0;
  let plansAssigned = 0;

  pushEvent(town, {
    id: makeEventId(town, undefined, "tick"),
    tick: town.tick,
    at: town.now,
    kind: "tick",
    message: `Simulation tick ${town.tick} executed.`,
  });

  for (const npc of listTownNpcs(town)) {
    const npcResult = resultIndex.get(npc.id)!;
    applyPassiveDrift(npc);
    const completedAction = progressAction(town, npc);
    if (completedAction) {
      actionsCompleted += 1;
      npcResult.actionCompleted = completedAction;
      npcResult.notes.push(`Completed ${completedAction.type}`);
    }

    if (!npc.currentAction && npc.plan && npc.plan.status !== "done") {
      const startedAction = beginNextPlanStep(town, npc);
      if (startedAction) {
        actionsStarted += 1;
        npcResult.actionStarted = startedAction;
        npcResult.notes.push(`Continued plan ${npc.plan.intent}`);
        continue;
      }
    }

    if (npc.currentAction || (npc.plan && npc.plan.status !== "done")) {
      continue;
    }

    const env = getEnvironmentForNpc(town, npc.id);
    const decision = weightedDecision(npc, env, { rng });
    npcResult.decision = decision;
    pushEvent(town, {
      id: makeEventId(town, npc.id, "decision"),
      tick: town.tick,
      at: town.now,
      npcId: npc.id,
      kind: "decision",
      message: `${npc.name} selected ${decision.selected.type}.`,
      details: { decision },
    });

    if (decision.decision === "immediate_action") {
      applyNpcActionToTown(town, npc.id, decision.action);
      actionsStarted += 1;
      npcResult.actionStarted = town.npcs[npc.id].currentAction;
      npcResult.notes.push(`Started ${decision.action.type}`);
      continue;
    }

    const plannerResult = await planner({
      npc: town.npcs[npc.id],
      env,
      intent: decision.planIntent,
      now: town.now,
      rng,
    });
    assignPlanToTown(town, npc.id, plannerResult.plan);
    plansAssigned += 1;
    npcResult.assignedPlanId = plannerResult.plan.id;
    npcResult.notes.push(`Assigned ${plannerResult.source} plan`);
    const startedAction = beginNextPlanStep(town, town.npcs[npc.id]);
    if (startedAction) {
      actionsStarted += 1;
      npcResult.actionStarted = startedAction;
    }
  }

  return {
    town,
    tick: town.tick,
    summary: {
      processedNpcs: npcResults.length,
      actionsStarted,
      actionsCompleted,
      plansAssigned,
    },
    npcResults,
    events: town.events.slice(-25),
    mode: "mock-local",
  };
}

export async function runLocalMockTick(
  townId: string,
  options: Omit<SimulationTickOptions, "rng"> & { seed?: string } = {},
): Promise<SimulationTickResult> {
  const currentTown = options.seed
    ? ensureLocalMockTownState({ id: townId, seed: options.seed })
    : getLocalMockTownState(townId);
  const rng = createSeededRng(`${currentTown.seed}:${currentTown.tick + 1}`);
  const result = await runSimulationTick(currentTown, { ...options, rng });
  setLocalMockTownState(result.town);
  return result;
}
