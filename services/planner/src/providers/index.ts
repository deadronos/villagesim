import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { CopilotPlannerProvider, type CopilotClientFactory, type CopilotPlannerProviderConfig } from "./copilot.js";
import { MockPlannerProvider } from "./mock.js";
import type { PlannerProvider } from "./base.js";

export * from "./base.js";
export * from "./copilot.js";
export * from "./mock.js";

const DEFAULT_COPILOT_MODEL = "gpt-5";
const DEFAULT_COPILOT_TIMEOUT_MS = 45_000;
const DEFAULT_REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DEFAULT_LOCAL_COPILOT_PATH = fileURLToPath(
  new URL(`../../../../node_modules/.bin/${process.platform === "win32" ? "copilot.cmd" : "copilot"}`, import.meta.url),
);

export type PlannerProviderName = "copilot" | "mock";

function normalizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readPositiveInt(name: string, fallback: number, env: NodeJS.ProcessEnv): number {
  const parsed = Number.parseInt(env[name] ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function readReasoningEffort(env: NodeJS.ProcessEnv): CopilotPlannerProviderConfig["reasoningEffort"] {
  const value = normalizeEnvValue(env.VILLAGESIM_PLANNER_COPILOT_REASONING_EFFORT);
  if (!value) {
    return undefined;
  }

  if (value === "low" || value === "medium" || value === "high" || value === "xhigh") {
    return value;
  }

  return undefined;
}

function readLogLevel(env: NodeJS.ProcessEnv): CopilotPlannerProviderConfig["logLevel"] {
  const value = normalizeEnvValue(env.VILLAGESIM_PLANNER_COPILOT_LOG_LEVEL);
  if (!value) {
    return "error";
  }

  if (value === "all" || value === "debug" || value === "error" || value === "info" || value === "none" || value === "warning") {
    return value;
  }

  return "error";
}

function readPlannerProviderName(env: NodeJS.ProcessEnv): PlannerProviderName {
  const provider = normalizeEnvValue(env.VILLAGESIM_PLANNER_SERVICE_PROVIDER)?.toLowerCase();
  return provider === "copilot" ? "copilot" : "mock";
}

function resolveDefaultCliPath(): string {
  return existsSync(DEFAULT_LOCAL_COPILOT_PATH) ? DEFAULT_LOCAL_COPILOT_PATH : "copilot";
}

export function readCopilotPlannerProviderConfig(env: NodeJS.ProcessEnv = process.env): CopilotPlannerProviderConfig {
  return {
    cliPath: normalizeEnvValue(env.VILLAGESIM_PLANNER_COPILOT_CLI_PATH) ?? resolveDefaultCliPath(),
    cliUrl: normalizeEnvValue(env.VILLAGESIM_PLANNER_COPILOT_CLI_URL),
    configDir: normalizeEnvValue(env.VILLAGESIM_PLANNER_COPILOT_CONFIG_DIR),
    logLevel: readLogLevel(env),
    model: normalizeEnvValue(env.VILLAGESIM_PLANNER_COPILOT_MODEL) ?? DEFAULT_COPILOT_MODEL,
    reasoningEffort: readReasoningEffort(env),
    timeoutMs: readPositiveInt("VILLAGESIM_PLANNER_COPILOT_TIMEOUT_MS", DEFAULT_COPILOT_TIMEOUT_MS, env),
    workingDirectory: normalizeEnvValue(env.VILLAGESIM_PLANNER_COPILOT_WORKING_DIRECTORY) ?? DEFAULT_REPOSITORY_ROOT,
  };
}

export function createPlannerProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: {
    copilotClientFactory?: CopilotClientFactory;
  } = {},
): PlannerProvider {
  const providerName = readPlannerProviderName(env);

  if (providerName === "copilot") {
    return new CopilotPlannerProvider(readCopilotPlannerProviderConfig(env), dependencies.copilotClientFactory);
  }

  return new MockPlannerProvider();
}
