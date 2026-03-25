import { describe, expect, it, vi } from "vitest";

import { createPlannerServiceRequest } from "../../lib/plannerContract";
import { CopilotPlannerProvider, PlannerProviderError, createPlannerProviderFromEnv } from "../../services/planner/src/providers";

function createRequest() {
  return createPlannerServiceRequest({
    callerLogin: "deadronos",
    intent: "social",
    npcId: "npc-mira",
    prompt: "Plan a safe social interaction for npc-mira.",
    requestId: "planner-request-provider-test",
    requestedAt: "2026-03-25T12:00:00.000Z",
    simulationTimeMs: 123_456,
    tick: 8,
    townId: "demo-town",
  });
}

function createCopilotFactory(options: {
  assistantContent?: string;
  rejection?: Error;
}) {
  const disconnect = vi.fn().mockResolvedValue(undefined);
  const sendAndWait = options.rejection
    ? vi.fn().mockRejectedValue(options.rejection)
    : vi.fn().mockResolvedValue({ data: { content: options.assistantContent ?? "" } });
  const createSession = vi.fn().mockResolvedValue({
    disconnect,
    sendAndWait,
  });
  const start = vi.fn().mockResolvedValue(undefined);
  const stop = vi.fn().mockResolvedValue([]);
  const factory = vi.fn(() => ({
    createSession,
    start,
    stop,
  }));

  return {
    disconnect,
    factory,
    sendAndWait,
    start,
    stop,
    createSession,
  };
}

describe("planner providers", () => {
  it("defaults to the mock provider when no planner runtime is configured", () => {
    const provider = createPlannerProviderFromEnv({});

    expect(provider.name).toBe("mock");
  });

  it("creates the Copilot provider when explicitly requested", () => {
    const provider = createPlannerProviderFromEnv({
      VILLAGESIM_PLANNER_SERVICE_PROVIDER: "copilot",
    });

    expect(provider.name).toBe("copilot");
  });

  it("parses fenced JSON from the Copilot runtime and returns the shared service envelope", async () => {
    const client = createCopilotFactory({
      assistantContent: '```json\n{"rationale":"Keep it friendly","plan":[{"type":"wait","seconds":1}]}\n```',
    });
    const provider = new CopilotPlannerProvider(
      {
        cliPath: "copilot",
        model: "gpt-5",
        timeoutMs: 5_000,
        workingDirectory: "/tmp/villagesim",
      },
      client.factory,
    );

    const response = await provider.plan(createRequest());

    expect(response).toEqual({
      requestId: "planner-request-provider-test",
      plan: {
        rationale: "Keep it friendly",
        plan: [{ type: "wait", seconds: 1 }],
      },
    });
    expect(client.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        availableTools: [],
        model: "gpt-5",
        workingDirectory: "/tmp/villagesim",
      }),
    );
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(client.stop).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed Copilot output before returning it to the app", async () => {
    const provider = new CopilotPlannerProvider(
      {
        cliPath: "copilot",
        model: "gpt-5",
        timeoutMs: 5_000,
        workingDirectory: "/tmp/villagesim",
      },
      createCopilotFactory({
        assistantContent: "This is not planner JSON.",
      }).factory,
    );

    await expect(provider.plan(createRequest())).rejects.toMatchObject({
      failureReason: "invalid_provider_response",
      statusCode: 502,
    } satisfies Partial<PlannerProviderError>);
  });

  it("sanitizes Copilot runtime failures into a safe provider error", async () => {
    const provider = new CopilotPlannerProvider(
      {
        cliPath: "copilot",
        model: "gpt-5",
        timeoutMs: 5_000,
        workingDirectory: "/tmp/villagesim",
      },
      createCopilotFactory({
        rejection: new Error("tool trace\nstack details\npermission failure"),
      }).factory,
    );

    await expect(provider.plan(createRequest())).rejects.toMatchObject({
      failureReason: "planner_provider_failed",
      message: "Copilot planner runtime failed.",
      statusCode: 502,
    } satisfies Partial<PlannerProviderError>);
  });
});
