import { z } from "zod";

import { buildPlannerPrompt } from "./prompt_templates";
import type {
  NpcPlan,
  NpcPlanStep,
  PlannerFallbackReason,
  PlannerRequest,
  PlannerResult,
  PlannerSource,
  Position,
  RandomSource,
} from "./types";

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const planStepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move"), target: positionSchema, note: z.string().optional() }),
  z.object({ type: z.literal("work"), task: z.string().min(1), targetId: z.string().optional(), note: z.string().optional() }),
  z.object({ type: z.literal("gather"), item: z.enum(["grain", "wood"]), count: z.number().int().positive(), targetId: z.string().optional(), note: z.string().optional() }),
  z.object({ type: z.literal("speak"), text: z.string().min(1), targetId: z.string().optional(), note: z.string().optional() }),
  z.object({ type: z.literal("rest"), note: z.string().optional() }),
  z.object({ type: z.literal("trade"), item: z.enum(["food", "grain", "wood", "coins"]), amount: z.number().int().positive(), targetId: z.string().optional(), note: z.string().optional() }),
  z.object({ type: z.literal("wait"), seconds: z.number().int().positive(), note: z.string().optional() }),
]);

const plannerPayloadSchema = z.object({
  rationale: z.string().optional().default("Short local-first plan"),
  plan: z.array(planStepSchema).min(1).max(6),
});

export type PlannerPayloadStep =
  | { type: "move"; target: Position; note?: string }
  | { type: "work"; task: string; targetId?: string; note?: string }
  | { type: "gather"; item: "grain" | "wood"; count: number; targetId?: string; note?: string }
  | { type: "speak"; text: string; targetId?: string; note?: string }
  | { type: "rest"; note?: string }
  | { type: "trade"; item: "food" | "grain" | "wood" | "coins"; amount: number; targetId?: string; note?: string }
  | { type: "wait"; seconds: number; note?: string };

export interface PlannerPayload {
  rationale: string;
  plan: PlannerPayloadStep[];
}

function nextPlanId(input: PlannerRequest): string {
  return `${input.npc.id}:${input.intent}:${input.now}`;
}

function distanceTo(target: Position | undefined, current: Position): number {
  if (!target) {
    return Infinity;
  }
  return Math.hypot(target.x - current.x, target.y - current.y);
}

function withIds(planId: string, payload: PlannerPayload, now: number, intent: PlannerRequest["intent"]): NpcPlan {
  const steps: NpcPlanStep[] = payload.plan.map((step: PlannerPayloadStep, index: number) => ({
    ...step,
    id: `${planId}:step-${index + 1}`,
    status: "pending",
  })) as NpcPlanStep[];

  return {
    id: planId,
    intent,
    rationale: payload.rationale,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    currentStepIndex: 0,
    steps,
  };
}

function withPlannerMetadata(
  plan: NpcPlan,
  input: PlannerRequest,
  options: {
    source: PlannerSource;
    queueId?: string;
    latencyMs: number;
    fallbackReason?: PlannerFallbackReason;
    failureReason?: string | null;
    completedAt?: number;
  },
): NpcPlan {
  return {
    ...plan,
    planner: {
      source: options.source,
      queueId: options.queueId,
      requestedAt: input.now,
      completedAt: options.completedAt ?? input.now + options.latencyMs,
      latencyMs: options.latencyMs,
      fallbackReason: options.fallbackReason ?? null,
      failureReason: options.failureReason ?? null,
    },
  };
}

function createPlannerResult(
  input: PlannerRequest,
  payload: PlannerPayload,
  prompt: string,
  options: {
    source: PlannerSource;
    latencyMs?: number;
    queueId?: string;
    fallbackReason?: PlannerFallbackReason;
    failureReason?: string | null;
    completedAt?: number;
    planId?: string;
  },
): PlannerResult {
  const latencyMs = options.latencyMs ?? 0;
  const plan = withPlannerMetadata(
    withIds(options.planId ?? nextPlanId(input), payload, input.now, input.intent),
    input,
    {
      source: options.source,
      queueId: options.queueId,
      latencyMs,
      fallbackReason: options.fallbackReason,
      failureReason: options.failureReason ?? null,
      completedAt: options.completedAt,
    },
  );

  return {
    source: options.source,
    prompt,
    plan,
    latencyMs,
    fallbackReason: options.fallbackReason,
    failureReason: options.failureReason ?? null,
  };
}

function safeParsePlannerJson(raw: unknown): PlannerPayload {
  if (typeof raw === "string") {
    return plannerPayloadSchema.parse(JSON.parse(raw));
  }
  if (raw && typeof raw === "object") {
    if ("choices" in raw && Array.isArray((raw as { choices?: unknown[] }).choices)) {
      const firstChoice = (raw as { choices: Array<{ message?: { content?: string }; text?: string }> }).choices[0];
      const content = firstChoice?.message?.content ?? firstChoice?.text;
      if (content) {
        return safeParsePlannerJson(content);
      }
    }
    if ("output" in raw) {
      return safeParsePlannerJson((raw as { output: unknown }).output);
    }
  }
  return plannerPayloadSchema.parse(raw);
}

function buildMockPayload(input: PlannerRequest, rng: RandomSource): PlannerPayload {
  const home = input.env.nearby.home;
  const field = input.env.nearby.field;
  const market = input.env.nearby.market ?? input.env.nearby.food;
  const plaza = input.env.nearby.plaza;
  const workshop = input.env.nearby.workshop;
  const nearestPerson = input.env.nearby.people[0];
  const upbeatGreeting = rng() > 0.5 ? "Morning! Need a hand?" : "How's the village feeling today?";

  switch (input.intent) {
    case "work": {
      const workplace = input.npc.workplaceId === workshop?.id ? workshop : input.npc.workplaceId === market?.id ? market : field ?? workshop ?? market;
      const steps: PlannerPayload["plan"] = [];
      if (workplace && distanceTo(workplace.position, input.npc.position) > 1.5) {
        steps.push({ type: "move", target: workplace.position, note: `Head toward ${workplace.label}.` });
      }
      if (input.npc.role === "builder") {
        steps.push({ type: "gather", item: "wood", count: 1, targetId: workshop?.id, note: "Collect wood for the next repair task." });
      }
      steps.push({ type: "work", task: `${input.npc.role} shift`, targetId: workplace?.id, note: "Perform the next useful job for the village." });
      steps.push({ type: "wait", seconds: 1, note: "Pause and re-evaluate after working." });
      return { rationale: `${input.npc.name} should progress their role-driven work loop.`, plan: steps };
    }
    case "trade": {
      const steps: PlannerPayload["plan"] = [];
      if (market && distanceTo(market.position, input.npc.position) > 1.5) {
        steps.push({ type: "move", target: market.position, note: "Walk to the market." });
      }
      steps.push({ type: "trade", item: input.npc.status.hunger > 60 ? "food" : "grain", amount: 1, targetId: market?.id, note: "Make a small safe trade." });
      if (nearestPerson) {
        steps.push({ type: "speak", text: upbeatGreeting, targetId: nearestPerson.id, note: "Keep trade social." });
      }
      return { rationale: `${input.npc.name} should visit the market and keep goods flowing.`, plan: steps };
    }
    case "social": {
      const targetPosition = nearestPerson?.position ?? plaza?.position ?? home?.position ?? input.npc.position;
      const steps: PlannerPayload["plan"] = [];
      if (distanceTo(targetPosition, input.npc.position) > 1.5) {
        steps.push({ type: "move", target: targetPosition, note: "Move toward someone to talk to." });
      }
      steps.push({ type: "speak", text: upbeatGreeting, targetId: nearestPerson?.id, note: "Check in with a neighbour." });
      steps.push({ type: "wait", seconds: 1, note: "Leave room for a response." });
      return { rationale: `${input.npc.name} looks socially ready for a lightweight interaction.`, plan: steps };
    }
    case "restock": {
      const target = market ?? field ?? workshop ?? home;
      return {
        rationale: `${input.npc.name} should fetch supplies before the next task.`,
        plan: [
          ...(target && distanceTo(target.position, input.npc.position) > 1.5 ? [{ type: "move" as const, target: target.position, note: `Head toward ${target.label}.` }] : []),
          { type: "gather", item: target?.kind === "workshop" ? "wood" : "grain", count: 1, targetId: target?.id, note: "Collect a single useful resource." },
          { type: "wait", seconds: 1, note: "Check if more supplies are still needed." },
        ],
      };
    }
    case "explore":
    default:
      return {
        rationale: `${input.npc.name} can do a safe short wander and reassess.`,
        plan: [
          { type: "move", target: plaza?.position ?? input.npc.position, note: "Walk to a visible public spot." },
          { type: "speak", text: "Anything new around town?", targetId: nearestPerson?.id, note: "Gather local context." },
          { type: "wait", seconds: 1, note: "Pause before the next choice." },
        ],
      };
  }
}

function readPlannerTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.VILLAGESIM_PLANNER_TIMEOUT_MS ?? "3000", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 3000;
  }
  return parsed;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Planner request failed";
}

async function requestRemotePlanner(prompt: string): Promise<PlannerPayload | null> {
  const apiUrl = process.env.MODEL_API_URL;
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiUrl || !apiKey || process.env.MODEL_MOCK === "true") {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), readPlannerTimeoutMs());
  let response: Response;

  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        response_format: { type: "json_object" },
        temperature: 0,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Planner proxy timed out after ${readPlannerTimeoutMs()}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Planner proxy request failed with ${response.status}`);
  }

  const payload = await response.json();
  return safeParsePlannerJson(payload);
}

export function createMockPlannerResult(
  input: PlannerRequest,
  options: {
    prompt?: string;
    latencyMs?: number;
    fallbackReason?: PlannerFallbackReason;
    failureReason?: string | null;
  } = {},
): PlannerResult {
  const prompt = options.prompt ?? buildPlannerPrompt(input);
  const rng = input.rng ?? (() => 0.5);
  const mockPayload = plannerPayloadSchema.parse(buildMockPayload(input, rng));
  return createPlannerResult(input, mockPayload, prompt, {
    source: "mock",
    latencyMs: options.latencyMs ?? 0,
    fallbackReason: options.fallbackReason,
    failureReason: options.failureReason ?? null,
  });
}

export function createQueuedPlaceholderPlannerResult(
  input: PlannerRequest,
  options: {
    queueId: string;
    prompt?: string;
    latencyMs?: number;
  },
): PlannerResult {
  const prompt = options.prompt ?? buildPlannerPrompt(input);
  const placeholderPayload = plannerPayloadSchema.parse({
    rationale: `Queued background planner request for ${input.npc.name}.`,
    plan: [{ type: "wait", seconds: 1, note: "Wait for the hosted background planner to finish." }],
  });
  return createPlannerResult(input, placeholderPayload, prompt, {
    source: "queued-placeholder",
    queueId: options.queueId,
    latencyMs: options.latencyMs ?? 0,
    planId: `${options.queueId}:placeholder`,
  });
}

export async function requestNpcPlan(input: PlannerRequest): Promise<PlannerResult> {
  const prompt = buildPlannerPrompt(input);
  const startedAt = Date.now();
  let failureReason: string | null = null;

  try {
    const remotePayload = await requestRemotePlanner(prompt);
    if (remotePayload) {
      return createPlannerResult(input, remotePayload, prompt, {
        source: "remote",
        latencyMs: Date.now() - startedAt,
      });
    }
  } catch (error) {
    failureReason = normalizeErrorMessage(error);
  }

  return createMockPlannerResult(input, {
    prompt,
    latencyMs: Date.now() - startedAt,
    fallbackReason: failureReason ? "remote_failure" : undefined,
    failureReason,
  });
}

export const plannerSchemas = {
  positionSchema,
  planStepSchema,
  plannerPayloadSchema,
};
