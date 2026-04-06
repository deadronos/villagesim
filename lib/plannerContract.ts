import { z } from "zod";

const plannerIntentSchema = z.enum(["work", "trade", "social", "restock", "explore"]);

export const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const planStepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move"), target: positionSchema, note: z.string().optional() }),
  z.object({ type: z.literal("work"), task: z.string().min(1), targetId: z.string().optional(), note: z.string().optional() }),
  z.object({ type: z.literal("gather"), item: z.enum(["grain", "wood"]), count: z.number().int().positive(), targetId: z.string().optional(), note: z.string().optional() }),
  z.object({ type: z.literal("speak"), text: z.string().min(1), targetId: z.string().optional(), note: z.string().optional() }),
  z.object({ type: z.literal("rest"), note: z.string().optional() }),
  z.object({
    type: z.literal("trade"),
    item: z.enum(["food", "grain", "wood", "coins"]),
    amount: z.number().int().positive(),
    targetId: z.string().optional(),
    note: z.string().optional(),
  }),
  z.object({ type: z.literal("wait"), seconds: z.number().int().positive(), note: z.string().optional() }),
]);

export const plannerPayloadSchema = z.object({
  rationale: z.string().optional().default("Short local-first plan"),
  plan: z.array(planStepSchema).min(1).max(6),
});

export const plannerServiceRequestMetadataSchema = z.object({
  requestId: z.string().min(1),
  requestedAt: z.string().datetime({ offset: true }),
  callerLogin: z.string().min(1).nullable().optional(),
  townId: z.string().min(1),
  tick: z.number().int().nonnegative(),
  simulationTimeMs: z.number().int().nonnegative(),
  npcId: z.string().min(1),
  intent: plannerIntentSchema,
});

export const plannerServiceRequestSchema = z.object({
  metadata: plannerServiceRequestMetadataSchema,
  prompt: z.string().min(1),
});

export const plannerServiceResponseSchema = z.object({
  requestId: z.string().min(1).optional(),
  plan: plannerPayloadSchema,
});

export type PlannerPayloadStep = z.infer<typeof planStepSchema>;
export type PlannerPayload = z.infer<typeof plannerPayloadSchema>;
export type PlannerServiceRequestMetadata = z.infer<typeof plannerServiceRequestMetadataSchema>;
export type PlannerServiceRequest = z.infer<typeof plannerServiceRequestSchema>;
export type PlannerServiceResponse = z.infer<typeof plannerServiceResponseSchema>;

export function createPlannerServiceRequest(args: {
  callerLogin?: string | null;
  intent: PlannerServiceRequestMetadata["intent"];
  npcId: string;
  prompt: string;
  requestId: string;
  requestedAt: string;
  simulationTimeMs: number;
  tick: number;
  townId: string;
}): PlannerServiceRequest {
  return plannerServiceRequestSchema.parse({
    metadata: {
      requestId: args.requestId,
      requestedAt: args.requestedAt,
      callerLogin: args.callerLogin ?? null,
      townId: args.townId,
      tick: args.tick,
      simulationTimeMs: args.simulationTimeMs,
      npcId: args.npcId,
      intent: args.intent,
    },
    prompt: args.prompt,
  });
}

export function parsePlannerPayload(raw: unknown): PlannerPayload {
  if (typeof raw === "string") {
    return parsePlannerPayload(JSON.parse(raw));
  }

  if (raw && typeof raw === "object") {
    if ("choices" in raw && Array.isArray((raw as { choices?: unknown[] }).choices)) {
      const firstChoice = (raw as { choices: Array<{ message?: { content?: string }; text?: string }> }).choices[0];
      const content = firstChoice?.message?.content ?? firstChoice?.text;
      if (content) {
        return parsePlannerPayload(content);
      }
    }

    const serviceResponse = plannerServiceResponseSchema.safeParse(raw);
    if (serviceResponse.success) {
      return serviceResponse.data.plan;
    }

    if ("output" in raw) {
      return parsePlannerPayload((raw as { output: unknown }).output);
    }
  }

  return plannerPayloadSchema.parse(raw);
}
