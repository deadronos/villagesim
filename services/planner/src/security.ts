import { createHmac, timingSafeEqual } from "node:crypto";

import * as plannerContract from "../../../lib/plannerContract";
import type { PlannerServiceRequest } from "../../../lib/plannerContract";

const plannerContractModule = ("default" in plannerContract ? plannerContract.default : plannerContract) as typeof import("../../../lib/plannerContract");
const { plannerServiceRequestSchema } = plannerContractModule;

export interface PlannerSecurityConfig {
  bearerToken: string;
  replayWindowMs: number;
  signingSecret: string;
}

export class SecurityError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly failureReason: string,
    message?: string,
  ) {
    super(message ?? failureReason);
  }
}

export class ReplayProtector {
  private readonly seen = new Map<string, number>();

  assertFreshRequest(requestId: string, expiresAtMs: number, nowMs: number = Date.now()): void {
    for (const [key, expiry] of this.seen.entries()) {
      if (expiry <= nowMs) {
        this.seen.delete(key);
      }
    }

    if (this.seen.has(requestId)) {
      throw new SecurityError(409, "request_replay", "Planner request replay detected");
    }

    this.seen.set(requestId, expiresAtMs);
  }
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function headerValue(headers: Headers, name: string): string | null {
  const value = headers.get(name);
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function computePlannerSignature(body: string, requestId: string, requestedAt: string, signingSecret: string): string {
  return createHmac("sha256", signingSecret).update(`${requestId}.${requestedAt}.${body}`).digest("hex");
}

function assertValidBearerToken(authorizationHeader: string | null, expectedToken: string): void {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new SecurityError(401, "missing_bearer_token", "Missing planner bearer token");
  }

  const providedToken = authorizationHeader.slice("Bearer ".length).trim();
  if (!providedToken || !constantTimeEquals(providedToken, expectedToken)) {
    throw new SecurityError(401, "invalid_bearer_token", "Invalid planner bearer token");
  }
}

function assertFreshTimestamp(requestedAt: string, replayWindowMs: number, nowMs: number): number {
  const requestedAtMs = Date.parse(requestedAt);
  if (!Number.isFinite(requestedAtMs)) {
    throw new SecurityError(400, "invalid_requested_at", "Planner request timestamp is invalid");
  }

  if (Math.abs(nowMs - requestedAtMs) > replayWindowMs) {
    throw new SecurityError(401, "stale_request_timestamp", "Planner request timestamp is outside the replay window");
  }

  return requestedAtMs;
}

function assertValidSignature(
  body: string,
  requestId: string,
  requestedAt: string,
  signatureHeader: string | null,
  signingSecret: string,
): void {
  if (!signatureHeader) {
    throw new SecurityError(401, "missing_signature", "Missing planner request signature");
  }

  const expectedSignature = computePlannerSignature(body, requestId, requestedAt, signingSecret);
  if (!constantTimeEquals(signatureHeader, expectedSignature)) {
    throw new SecurityError(401, "invalid_signature", "Invalid planner request signature");
  }
}

export function verifyPlannerRequest(args: {
  config: PlannerSecurityConfig;
  headers: Headers;
  nowMs?: number;
  rawBody: string;
  replayProtector: ReplayProtector;
}): PlannerServiceRequest {
  assertValidBearerToken(headerValue(args.headers, "authorization"), args.config.bearerToken);

  const requestIdHeader = headerValue(args.headers, "x-villagesim-request-id");
  if (!requestIdHeader) {
    throw new SecurityError(400, "missing_request_id", "Missing planner request ID");
  }

  const requestedAtHeader = headerValue(args.headers, "x-villagesim-requested-at");
  if (!requestedAtHeader) {
    throw new SecurityError(400, "missing_requested_at", "Missing planner request timestamp");
  }

  const nowMs = args.nowMs ?? Date.now();
  const requestedAtMs = assertFreshTimestamp(requestedAtHeader, args.config.replayWindowMs, nowMs);
  assertValidSignature(
    args.rawBody,
    requestIdHeader,
    requestedAtHeader,
    headerValue(args.headers, "x-villagesim-signature"),
    args.config.signingSecret,
  );

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(args.rawBody);
  } catch {
    throw new SecurityError(400, "invalid_json", "Planner request body must be valid JSON");
  }

  const requestEnvelope = plannerServiceRequestSchema.parse(parsedJson);
  if (requestEnvelope.metadata.requestId !== requestIdHeader) {
    throw new SecurityError(400, "request_id_mismatch", "Planner request ID header does not match the body");
  }
  if (requestEnvelope.metadata.requestedAt !== requestedAtHeader) {
    throw new SecurityError(400, "requested_at_mismatch", "Planner request timestamp header does not match the body");
  }

  args.replayProtector.assertFreshRequest(requestEnvelope.metadata.requestId, requestedAtMs + args.config.replayWindowMs, nowMs);
  return requestEnvelope;
}
