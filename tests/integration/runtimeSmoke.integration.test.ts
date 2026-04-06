import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createPlannerServiceRequest } from "../../lib/plannerContract";
import { computePlannerSignature } from "../../services/planner/src/security";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const HOST = "127.0.0.1";

type StartedProcess = {
  baseUrl: string;
  child: ChildProcessWithoutNullStreams;
  logs: string[];
  stop: () => Promise<void>;
};

function waitForTick(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function reservePort(): Promise<number> {
  const server = createNetServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, () => resolve());
  });

  const address = server.address();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  if (!address || typeof address === "string") {
    throw new Error("Failed to reserve a free test port");
  }

  return address.port;
}

function formatLogs(logs: string[]): string {
  return logs
    .join("")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .join("\n");
}

function startProcess(command: string, args: string[], env: NodeJS.ProcessEnv): StartedProcess {
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => {
    logs.push(chunk.toString("utf8"));
  });
  child.stderr.on("data", (chunk: Buffer) => {
    logs.push(chunk.toString("utf8"));
  });

  return {
    baseUrl: `http://${HOST}`,
    child,
    logs,
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }

      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        child.once("close", () => resolve());
      });
    },
  };
}

async function waitForHttpResponse(
  url: string,
  child: ChildProcessWithoutNullStreams,
  logs: string[],
  predicate: (response: Response) => boolean = (response) => response.ok,
  timeoutMs = 120_000,
): Promise<Response> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Process exited before ${url} became ready (${child.exitCode ?? "unknown"}):\n${formatLogs(logs)}`);
    }

    try {
      const response = await fetch(url);
      if (predicate(response)) {
        return response;
      }
    } catch {
      // Retry until the server is ready or the process exits.
    }

    await waitForTick(250);
  }

  throw new Error(`Timed out waiting for ${url} to become ready:\n${formatLogs(logs)}`);
}

async function startNextDevServer(port: number): Promise<StartedProcess> {
  const server = startProcess(
    "npm",
    ["run", "dev", "--", "--hostname", HOST, "--port", String(port)],
    {
      NODE_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
      VILLAGESIM_PLANNER_MOCK: "true",
      VILLAGESIM_STATE_MODE: "mock",
    },
  );

  server.baseUrl = `http://${HOST}:${port}`;
  await waitForHttpResponse(`${server.baseUrl}/`, server.child, server.logs);
  return server;
}

async function startPlannerService(port: number): Promise<StartedProcess> {
  const service = startProcess(
    "npm",
    ["--prefix", "services/planner", "run", "start"],
    {
      NODE_ENV: "test",
      NEXT_TELEMETRY_DISABLED: "1",
      VILLAGESIM_PLANNER_SERVICE_HOST: HOST,
      VILLAGESIM_PLANNER_SERVICE_PORT: String(port),
      VILLAGESIM_PLANNER_SERVICE_PROVIDER: "mock",
      VILLAGESIM_PLANNER_SERVICE_SIGNING_SECRET: "planner-service-secret",
      VILLAGESIM_PLANNER_SERVICE_TOKEN: "planner-service-token",
    },
  );

  service.baseUrl = `http://${HOST}:${port}`;
  await waitForHttpResponse(`${service.baseUrl}/healthz`, service.child, service.logs);
  return service;
}

describe("runtime smoke checks", () => {
  it("boots the Next dev server and serves the app shell plus tick API", async () => {
    const port = await reservePort();
    const server = await startNextDevServer(port);

    try {
      const homeResponse = await fetch(`${server.baseUrl}/`);
      const homeText = await homeResponse.text();

      expect(homeResponse.status).toBe(200);
      expect(homeText).toContain("VillageSim starter");

      const townResponse = await fetch(`${server.baseUrl}/town/demo-town`);
      const townText = await townResponse.text();

      expect(townResponse.status).toBe(200);
      expect(townText).toContain("VillageSim demo");

      const tickResponse = await fetch(`${server.baseUrl}/api/tick?townId=smoke-town&count=1`);
      const tickPayload = (await tickResponse.json()) as { mode: string; ok: boolean; tickCount: number; town: { tick: number } };

      expect(tickResponse.status).toBe(200);
      expect(tickPayload).toMatchObject({
        mode: "mock-local",
        ok: true,
        tickCount: 1,
        town: { tick: 1 },
      });
    } finally {
      await server.stop();
    }
  });

  it("boots the planner service entrypoint and accepts signed plan requests", async () => {
    const port = await reservePort();
    const service = await startPlannerService(port);

    try {
      const requestId = "planner-smoke-request";
      const requestedAt = new Date().toISOString();
      const body = JSON.stringify(
        createPlannerServiceRequest({
          callerLogin: "deadronos",
          intent: "social",
          npcId: "npc-mira",
          prompt: "Plan a safe social interaction for npc-mira.",
          requestId,
          requestedAt,
          simulationTimeMs: 123_456,
          tick: 8,
          townId: "demo-town",
        }),
      );

      const response = await fetch(`${service.baseUrl}/plan`, {
        method: "POST",
        headers: {
          Authorization: "Bearer planner-service-token",
          "Content-Type": "application/json",
          "X-VillageSim-Request-Id": requestId,
          "X-VillageSim-Requested-At": requestedAt,
          "X-VillageSim-Signature": computePlannerSignature(body, requestId, requestedAt, "planner-service-secret"),
        },
        body,
      });

      const payload = (await response.json()) as {
        plan: { plan: Array<{ type: string }>; rationale: string };
        requestId: string;
      };

      expect(response.status).toBe(200);
      expect(payload.requestId).toBe(requestId);
      expect(payload.plan.plan[0]?.type).toBe("speak");
      expect(payload.plan.rationale).toContain("social");
    } finally {
      await service.stop();
    }
  });
});