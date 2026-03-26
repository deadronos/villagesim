import { randomUUID } from "node:crypto";

import { buildPlannerPrompt } from "./prompt_templates";
import { isPlannerServiceEnabled, readPlannerServiceConfig } from "./plannerConfig";
import {
  createPlannerServiceRequest,
  parsePlannerPayload,
  plannerPayloadSchema,
  plannerServiceRequestMetadataSchema,
  plannerServiceRequestSchema,
  plannerServiceResponseSchema,
  planStepSchema,
  positionSchema,
  type PlannerPayload,
  type PlannerPayloadStep,
} from "./plannerContract";
import { createPlannerServiceHeaders } from "./plannerSigning";
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

const RETRYABLE_PLANNER_SERVICE_STATUS_CODES = new Set([408, 502, 503, 504]);
const MAX_PLANNER_SERVICE_ATTEMPTS = 2;

class PlannerServiceRequestError extends Error {
  constructor(
    message: string,
    readonly options: {
      retryable: boolean;
      status?: number;
    },
  ) {
    super(message);
  }
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

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Planner request failed";
}

function createPlannerServiceEnvelope(input: PlannerRequest, prompt: string) {
  return createPlannerServiceRequest({
    callerLogin: input.callerLogin ?? null,
    intent: input.intent,
    npcId: input.npc.id,
    prompt,
    requestId: randomUUID(),
    requestedAt: new Date().toISOString(),
    simulationTimeMs: input.now,
    tick: input.tick,
    townId: input.townId,
  });
}

async function readPlannerServiceFailure(response: Response): Promise<string> {
  let errorCode: string | null = null;

  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) {
      errorCode = payload.error;
    }
  } catch {
    // Ignore non-JSON failure payloads and fall back to the HTTP status text.
  }

  return errorCode
    ? `Planner service request failed with ${response.status} (${errorCode})`
    : `Planner service request failed with ${response.status}`;
}

function shouldRetryPlannerServiceRequest(error: unknown): boolean {
  return error instanceof PlannerServiceRequestError && error.options.retryable;
}

async function sendPlannerServiceRequest(
  url: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<PlannerPayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new PlannerServiceRequestError(await readPlannerServiceFailure(response), {
        retryable: RETRYABLE_PLANNER_SERVICE_STATUS_CODES.has(response.status),
        status: response.status,
      });
    }

    const payload = await response.json();
    return parsePlannerPayload(payload);
  } catch (error) {
    if (error instanceof PlannerServiceRequestError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new PlannerServiceRequestError(`Planner service timed out after ${timeoutMs}ms`, {
        retryable: true,
      });
    }

    throw new PlannerServiceRequestError(normalizeErrorMessage(error), {
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestRemotePlanner(input: PlannerRequest, prompt: string): Promise<PlannerPayload | null> {
  const config = readPlannerServiceConfig();
  if (!isPlannerServiceEnabled(config) || !config.url || !config.token) {
    return null;
  }

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_PLANNER_SERVICE_ATTEMPTS; attempt += 1) {
    const requestEnvelope = createPlannerServiceEnvelope(input, prompt);
    const body = JSON.stringify(requestEnvelope);
    const headers = createPlannerServiceHeaders({
      body,
      requestId: requestEnvelope.metadata.requestId,
      requestedAt: requestEnvelope.metadata.requestedAt,
      signingSecret: config.signingSecret,
      token: config.token,
    });

    try {
      return await sendPlannerServiceRequest(config.url, body, headers, config.timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_PLANNER_SERVICE_ATTEMPTS || !shouldRetryPlannerServiceRequest(error)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("Planner service request failed");
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
    const remotePayload = await requestRemotePlanner(input, prompt);
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
  plannerServiceRequestMetadataSchema,
  plannerServiceRequestSchema,
  plannerServiceResponseSchema,
};
