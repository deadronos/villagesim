import { afterEach, describe, expect, it } from "vitest";

import { isPlannerServiceEnabled, readPlannerServiceConfig } from "../../lib/plannerConfig";

const ENV_KEYS = [
  "MODEL_API_KEY",
  "MODEL_API_URL",
  "MODEL_MOCK",
  "VILLAGESIM_PLANNER_MOCK",
  "VILLAGESIM_PLANNER_SERVICE_SIGNING_SECRET",
  "VILLAGESIM_PLANNER_SERVICE_TIMEOUT_MS",
  "VILLAGESIM_PLANNER_SERVICE_TOKEN",
  "VILLAGESIM_PLANNER_SERVICE_URL",
  "VILLAGESIM_PLANNER_TIMEOUT_MS",
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<(typeof ENV_KEYS)[number], string | undefined>;

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("planner service config", () => {
  it("defaults to mock mode with the shared timeout fallback", () => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }

    expect(readPlannerServiceConfig()).toEqual({
      mockEnabled: true,
      signingSecret: null,
      timeoutMs: 3000,
      token: null,
      url: null,
    });
    expect(isPlannerServiceEnabled()).toBe(false);
  });

  it("prefers the new planner-service env names and still falls back to legacy aliases", () => {
    process.env.VILLAGESIM_PLANNER_MOCK = "false";
    process.env.VILLAGESIM_PLANNER_SERVICE_URL = "https://planner.example.test/plan";
    process.env.VILLAGESIM_PLANNER_SERVICE_TOKEN = "planner-service-token";
    process.env.VILLAGESIM_PLANNER_SERVICE_SIGNING_SECRET = "planner-secret";
    process.env.VILLAGESIM_PLANNER_SERVICE_TIMEOUT_MS = "4500";
    process.env.MODEL_API_URL = "https://legacy.example.test/plan";
    process.env.MODEL_API_KEY = "legacy-token";
    process.env.VILLAGESIM_PLANNER_TIMEOUT_MS = "9000";

    expect(readPlannerServiceConfig()).toEqual({
      mockEnabled: false,
      signingSecret: "planner-secret",
      timeoutMs: 4500,
      token: "planner-service-token",
      url: "https://planner.example.test/plan",
    });
    expect(isPlannerServiceEnabled()).toBe(true);
  });
});
