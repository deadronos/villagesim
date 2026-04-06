import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVICE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(SERVICE_ROOT, "../..");

function parseEnvValue(rawValue: string): string {
  const trimmed = rawValue.trim();

  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\")
      .replace(/\\"/g, '"');
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseEnvFile(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    parsed[key] = parseEnvValue(rawValue ?? "");
  }

  return parsed;
}

function candidateEnvFiles(): string[] {
  return [resolve(REPO_ROOT, ".env"), resolve(REPO_ROOT, ".env.local"), resolve(SERVICE_ROOT, ".env"), resolve(SERVICE_ROOT, ".env.local")];
}

export function loadPlannerServiceEnv(envFiles: string[] = candidateEnvFiles()): void {
  for (const envFile of envFiles) {
    if (!existsSync(envFile)) {
      continue;
    }

    const parsed = parseEnvFile(readFileSync(envFile, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}