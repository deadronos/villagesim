import { describe, expect, it } from "vitest";

import { createPlannerServiceRequest, parsePlannerPayload } from "../../lib/plannerContract";

describe("planner contract helpers", () => {
  it("builds a validated planner-service request envelope", () => {
    expect(
      createPlannerServiceRequest({
        callerLogin: "deadronos",
        intent: "social",
        npcId: "npc-mira",
        prompt: "Plan a safe social interaction for npc-mira.",
        requestId: "request-1",
        requestedAt: "2026-03-25T12:00:00.000Z",
        simulationTimeMs: 123_456,
        tick: 8,
        townId: "demo-town",
      }),
    ).toEqual({
      metadata: {
        callerLogin: "deadronos",
        intent: "social",
        npcId: "npc-mira",
        requestId: "request-1",
        requestedAt: "2026-03-25T12:00:00.000Z",
        simulationTimeMs: 123_456,
        tick: 8,
        townId: "demo-town",
      },
      prompt: "Plan a safe social interaction for npc-mira.",
    });
  });

  it("parses provider payloads from service envelopes and OpenAI-style choices", () => {
    expect(
      parsePlannerPayload({
        requestId: "request-1",
        plan: {
          rationale: "Short local-first plan",
          plan: [{ type: "wait", seconds: 1 }],
        },
      }),
    ).toEqual({
      rationale: "Short local-first plan",
      plan: [{ type: "wait", seconds: 1 }],
    });

    expect(
      parsePlannerPayload({
        choices: [
          {
            message: {
              content: '{"rationale":"Keep it light","plan":[{"type":"rest"}]}',
            },
          },
        ],
      }),
    ).toEqual({
      rationale: "Keep it light",
      plan: [{ type: "rest" }],
    });
  });

  it("unwraps nested output payloads and rejects invalid plans", () => {
    expect(
      parsePlannerPayload({
        output: {
          rationale: "Structured nested output",
          plan: [{ type: "speak", text: "Hello there" }],
        },
      }),
    ).toEqual({
      rationale: "Structured nested output",
      plan: [{ type: "speak", text: "Hello there" }],
    });

    expect(() => parsePlannerPayload({ rationale: "Missing steps", plan: [] })).toThrowError();
  });
});
