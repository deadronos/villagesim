import { createHmac } from "node:crypto";

export interface PlannerServiceHeadersArgs {
  body: string;
  requestId: string;
  requestedAt: string;
  signingSecret?: string | null;
  token: string;
}

export function computePlannerSignature(body: string, requestId: string, requestedAt: string, signingSecret: string): string {
  return createHmac("sha256", signingSecret).update(`${requestId}.${requestedAt}.${body}`).digest("hex");
}

export function createPlannerServiceHeaders(args: PlannerServiceHeadersArgs): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${args.token}`,
    "X-VillageSim-Request-Id": args.requestId,
    "X-VillageSim-Requested-At": args.requestedAt,
  };

  if (args.signingSecret) {
    headers["X-VillageSim-Signature"] = computePlannerSignature(args.body, args.requestId, args.requestedAt, args.signingSecret);
  }

  return headers;
}
