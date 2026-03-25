import * as plannerContract from "../../../../lib/plannerContract";
import type { PlannerPayload, PlannerServiceRequest, PlannerServiceResponse } from "../../../../lib/plannerContract";
import type { PlannerProvider } from "./base.js";

const plannerContractModule = ("default" in plannerContract ? plannerContract.default : plannerContract) as typeof import("../../../../lib/plannerContract");
const { plannerServiceResponseSchema } = plannerContractModule;

function buildMockPayload(request: PlannerServiceRequest): PlannerPayload {
  const { intent, npcId } = request.metadata;

  switch (intent) {
    case "work":
      return {
        rationale: `Mock planner provider queued a role-safe work loop for ${npcId}.`,
        plan: [
          { type: "work", task: "Continue the next useful village task.", targetId: "mock-worksite", note: "Validate the hosted work path." },
          { type: "wait", seconds: 1, note: "Pause before the next tick." },
        ],
      };
    case "trade":
      return {
        rationale: `Mock planner provider produced a simple trade plan for ${npcId}.`,
        plan: [
          { type: "trade", item: "grain", amount: 1, targetId: "mock-market", note: "Keep the trade flow deterministic." },
          { type: "wait", seconds: 1, note: "Leave room for inventory updates." },
        ],
      };
    case "social":
      return {
        rationale: `Mock planner provider produced a lightweight social plan for ${npcId}.`,
        plan: [
          { type: "speak", text: "Checking in on the village today.", note: "Exercise the hosted social planner path." },
          { type: "wait", seconds: 1, note: "Allow a short follow-up beat." },
        ],
      };
    case "restock":
      return {
        rationale: `Mock planner provider produced a safe restock loop for ${npcId}.`,
        plan: [
          { type: "gather", item: "grain", count: 1, targetId: "mock-storage", note: "Fetch a single resource to validate the contract." },
          { type: "wait", seconds: 1, note: "Reassess after the pickup." },
        ],
      };
    case "explore":
    default:
      return {
        rationale: `Mock planner provider produced a short exploration step for ${npcId}.`,
        plan: [
          { type: "move", target: { x: 0, y: 0 }, note: "Move to a deterministic public coordinate." },
          { type: "wait", seconds: 1, note: "Pause before choosing a new path." },
        ],
      };
  }
}

export class MockPlannerProvider implements PlannerProvider {
  readonly name = "mock";

  plan(request: PlannerServiceRequest): PlannerServiceResponse {
    return plannerServiceResponseSchema.parse({
      requestId: request.metadata.requestId,
      plan: buildMockPayload(request),
    });
  }
}
