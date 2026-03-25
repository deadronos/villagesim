import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockTown, getEnvironmentForNpc } from "../../lib/mockData";
import { requestNpcPlan } from "../../lib/model_proxy";
import type { PlannerRequest } from "../../lib/types";

const ENV_KEYS = [
  "VILLAGESIM_PLANNER_MOCK",
  "VILLAGESIM_PLANNER_SERVICE_SIGNING_SECRET",
  "VILLAGESIM_PLANNER_SERVICE_TOKEN",
  "VILLAGESIM_PLANNER_SERVICE_URL",
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<(typeof ENV_KEYS)[number], string | undefined>;

function createPlannerRequest(): PlannerRequest {
  const town = createMockTown({ id: "planner-contract-town" });
  const npc = town.npcs["npc-mira"];

  return {
    townId: town.id,
    callerLogin: "deadronos",
    tick: 4,
    npc,
    env: getEnvironmentForNpc(town, npc.id),
    intent: "social",
    now: 123_456,
    rng: () => 0.4,
  };
}

beforeEach(() => {
  process.env.VILLAGESIM_PLANNER_MOCK = "false";
  process.env.VILLAGESIM_PLANNER_SERVICE_URL = "https://planner.example.test/plan";
  process.env.VILLAGESIM_PLANNER_SERVICE_TOKEN = "planner-service-token";
  process.env.VILLAGESIM_PLANNER_SERVICE_SIGNING_SECRET = "planner-secret";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();

  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("requestNpcPlan", () => {
  it("sends the shared planner-service envelope and parses the shared response shape", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          requestId: "planner-response-1",
          plan: {
            rationale: "Remote planner response",
            plan: [{ type: "wait", seconds: 1, note: "Pause for coverage." }],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await requestNpcPlan(createPlannerRequest());

    expect(result.source).toBe("remote");
    expect(result.plan.rationale).toBe("Remote planner response");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    const body = JSON.parse(String(init.body)) as {
      metadata: {
        requestId: string;
        requestedAt: string;
        callerLogin: string | null;
        townId: string;
        tick: number;
        simulationTimeMs: number;
        npcId: string;
        intent: string;
      };
      prompt: string;
    };

    expect(url).toBe("https://planner.example.test/plan");
    expect(headers.get("Authorization")).toBe("Bearer planner-service-token");
    expect(headers.get("X-VillageSim-Request-Id")).toBe(body.metadata.requestId);
    expect(headers.get("X-VillageSim-Requested-At")).toBe(body.metadata.requestedAt);
    expect(headers.get("X-VillageSim-Signature")).toMatch(/^[a-f0-9]{64}$/);
    expect(body).toMatchObject({
      metadata: {
        callerLogin: "deadronos",
        townId: "planner-contract-town",
        tick: 4,
        simulationTimeMs: 123_456,
        npcId: "npc-mira",
        intent: "social",
      },
    });
    expect(body.prompt).toContain("npc-mira");
  });

  it("falls back to the mock planner when the remote planner service fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("planner service unavailable");
      }),
    );

    const result = await requestNpcPlan(createPlannerRequest());

    expect(result.source).toBe("mock");
    expect(result.fallbackReason).toBe("remote_failure");
    expect(result.failureReason).toBe("planner service unavailable");
    expect(result.plan.steps.length).toBeGreaterThan(0);
  });
});
