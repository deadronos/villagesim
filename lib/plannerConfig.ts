const DEFAULT_PLANNER_SERVICE_TIMEOUT_MS = 3000;

export const plannerServiceEnv = {
  mockEnabled: "VILLAGESIM_PLANNER_MOCK",
  signingSecret: "VILLAGESIM_PLANNER_SERVICE_SIGNING_SECRET",
  timeoutMs: "VILLAGESIM_PLANNER_SERVICE_TIMEOUT_MS",
  token: "VILLAGESIM_PLANNER_SERVICE_TOKEN",
  url: "VILLAGESIM_PLANNER_SERVICE_URL",
} as const;

function normalizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readBooleanEnv(primary: string | undefined, legacy: string | undefined, fallback: boolean): boolean {
  const raw = primary ?? legacy;
  if (!raw) {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function readPositiveIntEnv(primary: string | undefined, legacy: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(primary ?? legacy ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export interface PlannerServiceConfig {
  mockEnabled: boolean;
  signingSecret: string | null;
  timeoutMs: number;
  token: string | null;
  url: string | null;
}

export function readPlannerServiceConfig(env: NodeJS.ProcessEnv = process.env): PlannerServiceConfig {
  return {
    mockEnabled: readBooleanEnv(env.VILLAGESIM_PLANNER_MOCK, env.MODEL_MOCK, true),
    signingSecret: normalizeEnvValue(env.VILLAGESIM_PLANNER_SERVICE_SIGNING_SECRET),
    timeoutMs: readPositiveIntEnv(env.VILLAGESIM_PLANNER_SERVICE_TIMEOUT_MS, env.VILLAGESIM_PLANNER_TIMEOUT_MS, DEFAULT_PLANNER_SERVICE_TIMEOUT_MS),
    token: normalizeEnvValue(env.VILLAGESIM_PLANNER_SERVICE_TOKEN) ?? normalizeEnvValue(env.MODEL_API_KEY),
    url: normalizeEnvValue(env.VILLAGESIM_PLANNER_SERVICE_URL) ?? normalizeEnvValue(env.MODEL_API_URL),
  };
}

export function isPlannerServiceEnabled(config: PlannerServiceConfig = readPlannerServiceConfig()): boolean {
  return !config.mockEnabled && Boolean(config.url && config.token);
}
