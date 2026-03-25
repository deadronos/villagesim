import type { PlannerServiceRequest, PlannerServiceResponse } from "../../../../lib/plannerContract";

export interface PlannerProvider {
  readonly name: string;
  plan(request: PlannerServiceRequest): Promise<PlannerServiceResponse> | PlannerServiceResponse;
}

export type PlannerProviderFailureReason = "invalid_provider_response" | "planner_provider_failed" | "planner_provider_timeout";

export class PlannerProviderError extends Error {
  readonly failureReason: PlannerProviderFailureReason;
  readonly statusCode: number;

  constructor(
    statusCode: number,
    failureReason: PlannerProviderFailureReason,
    message: string,
    options?: {
      cause?: unknown;
    },
  ) {
    super(message, options);
    this.name = "PlannerProviderError";
    this.statusCode = statusCode;
    this.failureReason = failureReason;
  }
}
