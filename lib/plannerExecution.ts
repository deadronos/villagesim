import { buildPlannerPrompt } from "./prompt_templates";
import { createMockPlannerResult, createQueuedPlaceholderPlannerResult, requestNpcPlan } from "./model_proxy";
import { appendTownEvent, assignPlanToTown, createTownEventId, startNpcPlanIfIdle } from "./sim_engine";
import type {
  PlannerQueueEntry,
  PlannerRequest,
  PlannerRequestSnapshot,
  SimulationTickSummary,
  TownPlannerState,
  TownState,
} from "./types";

const DEFAULT_HOSTED_PLANNER_BUDGET_PER_TICK = 2;
const DEFAULT_HOSTED_PLANNER_DRAIN_PER_DISPATCH = 4;
const MAX_RETAINED_QUEUE_ITEMS = 40;

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function readHostedPlannerBudgetPerTick(): number {
  return readPositiveInt(process.env.VILLAGESIM_PLANNER_BUDGET_PER_TICK, DEFAULT_HOSTED_PLANNER_BUDGET_PER_TICK);
}

export function readHostedPlannerDrainPerDispatch(): number {
  return readPositiveInt(process.env.VILLAGESIM_PLANNER_DRAIN_PER_DISPATCH, DEFAULT_HOSTED_PLANNER_DRAIN_PER_DISPATCH);
}

function ensurePlannerState(town: TownState): TownPlannerState {
  if (!town.metadata.planner) {
    town.metadata.planner = {
      queue: [],
      lastTickBudget: null,
      metrics: {
        totalQueued: 0,
        totalCompleted: 0,
        totalFailed: 0,
        totalFallbacks: 0,
        placeholderAssignments: 0,
        completedBySource: {},
      },
    };
  }
  return town.metadata.planner;
}

function trimPlannerQueue(queue: PlannerQueueEntry[]): PlannerQueueEntry[] {
  if (queue.length <= MAX_RETAINED_QUEUE_ITEMS) {
    return queue;
  }
  return queue.slice(-MAX_RETAINED_QUEUE_ITEMS);
}

function toPlannerRequestSnapshot(input: PlannerRequest): PlannerRequestSnapshot {
  return {
    townId: input.townId,
    tick: input.tick,
    npc: input.npc,
    env: input.env,
    intent: input.intent,
    now: input.now,
  };
}

function shouldApplyQueuedResult(town: TownState, item: PlannerQueueEntry): boolean {
  const npc = town.npcs[item.npcId];
  if (!npc) {
    return false;
  }
  if (!npc.plan) {
    return true;
  }
  if (npc.plan.status === "done") {
    return true;
  }
  return npc.plan.id === item.placeholderPlanId || npc.plan.planner?.queueId === item.id;
}

export function hasQueuedPlannerRequests(town: TownState): boolean {
  return Boolean(town.metadata.planner?.queue.some((item) => item.status === "queued"));
}

export function createHostedPlannerQueueForTick(townId: string, tick: number) {
  const budget = readHostedPlannerBudgetPerTick();
  const queued: PlannerQueueEntry[] = [];
  let usedBudget = 0;

  return {
    planner: async (input: PlannerRequest) => {
      if (usedBudget < budget) {
        usedBudget += 1;
        const prompt = buildPlannerPrompt(input);
        const queueId = `${townId}:${tick}:${input.npc.id}:${input.intent}:${usedBudget}:${input.now}`;
        const placeholder = createQueuedPlaceholderPlannerResult(input, { queueId, prompt });
        queued.push({
          id: queueId,
          npcId: input.npc.id,
          intent: input.intent,
          requestedAt: input.now,
          requestedTick: tick,
          prompt,
          request: toPlannerRequestSnapshot(input),
          placeholderPlanId: placeholder.plan.id,
          status: "queued",
        });
        return placeholder;
      }

      return createMockPlannerResult(input, {
        latencyMs: 0,
        fallbackReason: "budget_exhausted",
        failureReason: "Hosted planner budget exhausted for this tick.",
      });
    },
    finalizeTown(town: TownState, tickSummary: SimulationTickSummary["planner"]) {
      const plannerState = ensurePlannerState(town);
      plannerState.queue = trimPlannerQueue([...plannerState.queue, ...queued]);
      plannerState.lastTickBudget = {
        tick,
        maxRequests: budget,
        usedRequests: usedBudget,
        exhausted: tickSummary.fallbackCount > 0,
      };
      plannerState.metrics.totalQueued += queued.length;
      plannerState.metrics.placeholderAssignments += queued.length;

      for (const item of queued) {
        appendTownEvent(town, {
          id: createTownEventId(town, item.npcId, "planner-queued"),
          tick: town.tick,
          at: town.now,
          npcId: item.npcId,
          kind: "planner_queued",
          message: `${town.npcs[item.npcId]?.name ?? item.npcId} queued a hosted planner request.`,
          details: {
            queueId: item.id,
            intent: item.intent,
            prompt: item.prompt,
          },
        });
      }

      if (tickSummary.fallbackCount > 0) {
        plannerState.metrics.totalFallbacks += tickSummary.fallbackCount;
        appendTownEvent(town, {
          id: createTownEventId(town, undefined, "planner-budget-exhausted"),
          tick: town.tick,
          at: town.now,
          kind: "planner_budget_exhausted",
          message: `Hosted planner budget exhausted for tick ${tick}.`,
          details: {
            tick,
            maxRequests: budget,
            usedRequests: usedBudget,
            fallbackCount: tickSummary.fallbackCount,
          },
        });
      }
    },
  };
}

export async function drainHostedPlannerQueue(
  town: TownState,
): Promise<{
  processed: number;
  remaining: number;
}> {
  const plannerState = ensurePlannerState(town);
  const pending = plannerState.queue.filter((item) => item.status === "queued").slice(0, readHostedPlannerDrainPerDispatch());
  let processed = 0;

  for (const item of pending) {
    try {
      const result = await requestNpcPlan(item.request);
      processed += 1;
      item.status = "completed";
      item.completedAt = Date.now();
      item.source = result.source === "queued-placeholder" ? "mock" : result.source;
      item.latencyMs = result.latencyMs;
      item.failureReason = result.failureReason ?? null;
      item.fallbackReason = result.fallbackReason ?? null;
      plannerState.metrics.totalCompleted += 1;
      plannerState.metrics.completedBySource[item.source] = (plannerState.metrics.completedBySource[item.source] ?? 0) + 1;
      if (result.fallbackReason) {
        plannerState.metrics.totalFallbacks += 1;
      }

      const applyPlan = shouldApplyQueuedResult(town, item);
      item.appliedPlan = applyPlan;
      if (applyPlan) {
        assignPlanToTown(town, item.npcId, {
          ...result.plan,
          planner: {
            source: result.plan.planner?.source ?? result.source,
            queueId: item.id,
            requestedAt: result.plan.planner?.requestedAt,
            completedAt: result.plan.planner?.completedAt,
            latencyMs: result.plan.planner?.latencyMs,
            fallbackReason: result.plan.planner?.fallbackReason,
            failureReason: result.plan.planner?.failureReason,
          },
        });
        item.assignedPlanId = town.npcs[item.npcId]?.plan?.id;
        startNpcPlanIfIdle(town, item.npcId);
      }

      appendTownEvent(town, {
        id: createTownEventId(town, item.npcId, "planner-completed"),
        tick: town.tick,
        at: town.now,
        npcId: item.npcId,
        kind: "planner_completed",
        message: `${town.npcs[item.npcId]?.name ?? item.npcId} completed hosted planner processing from ${item.source}.`,
        details: {
          queueId: item.id,
          source: item.source,
          latencyMs: item.latencyMs,
          failureReason: item.failureReason,
          fallbackReason: item.fallbackReason,
          assignedPlanId: item.assignedPlanId,
          appliedPlan: item.appliedPlan,
        },
      });

      if (item.fallbackReason) {
        appendTownEvent(town, {
          id: createTownEventId(town, item.npcId, "planner-fallback"),
          tick: town.tick,
          at: town.now,
          npcId: item.npcId,
          kind: "planner_fallback",
          message: `${town.npcs[item.npcId]?.name ?? item.npcId} used planner fallback ${item.fallbackReason}.`,
          details: {
            queueId: item.id,
            failureReason: item.failureReason,
            fallbackReason: item.fallbackReason,
          },
        });
      }
    } catch (error) {
      processed += 1;
      item.status = "failed";
      item.completedAt = Date.now();
      item.failureReason = error instanceof Error ? error.message : "Unknown planner queue failure";
      plannerState.metrics.totalFailed += 1;
      appendTownEvent(town, {
        id: createTownEventId(town, item.npcId, "planner-failed"),
        tick: town.tick,
        at: town.now,
        npcId: item.npcId,
        kind: "planner_failed",
        message: `${town.npcs[item.npcId]?.name ?? item.npcId} failed hosted planner processing.`,
        details: {
          queueId: item.id,
          failureReason: item.failureReason,
        },
      });
    }
  }

  plannerState.metrics.lastDispatchAt = town.now;
  plannerState.queue = trimPlannerQueue(plannerState.queue);

  return {
    processed,
    remaining: plannerState.queue.filter((item) => item.status === "queued").length,
  };
}
