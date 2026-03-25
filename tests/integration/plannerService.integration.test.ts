import { createServer } from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPlannerServiceRequest } from "../../lib/plannerContract";
import { createPlannerServiceHandler, type PlannerServiceConfig } from "../../services/planner/src/server";
import { computePlannerSignature } from "../../services/planner/src/security";

const FIXED_NOW_ISO = "2026-03-25T12:00:00.000Z";
const FIXED_NOW_MS = Date.parse(FIXED_NOW_ISO);

function createConfig(): PlannerServiceConfig {
  return {
    bearerToken: "planner-service-token",
    host: "127.0.0.1",
    maxBodyBytes: 16 * 1024,
    port: 0,
    rateLimitMax: 10,
    rateLimitWindowMs: 60_000,
    replayWindowMs: 5 * 60_000,
    signingSecret: "planner-service-secret",
  };
}

function createSignedRequest(requestId: string, requestedAt: string = FIXED_NOW_ISO): { body: string; headers: Record<string, string> } {
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

  return {
    body,
    headers: {
      Authorization: "Bearer planner-service-token",
      "Content-Type": "application/json",
      "X-VillageSim-Request-Id": requestId,
      "X-VillageSim-Requested-At": requestedAt,
      "X-VillageSim-Signature": computePlannerSignature(body, requestId, requestedAt, "planner-service-secret"),
    },
  };
}

async function startTestServer(config: PlannerServiceConfig = createConfig()): Promise<{ baseUrl: string; close: () => Promise<void>; logger: ReturnType<typeof vi.fn> }> {
  const logger = vi.fn();
  const server = createServer(
    createPlannerServiceHandler(config, {
      logger,
      now: () => FIXED_NOW_MS,
    }),
  );

  await new Promise<void>((resolve) => {
    server.listen(0, config.host, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test planner server");
  }

  return {
    baseUrl: `http://${config.host}:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
    logger,
  };
}

let activeServer: { close: () => Promise<void> } | null = null;

beforeEach(() => {
  activeServer = null;
});

afterEach(async () => {
  if (activeServer) {
    await activeServer.close();
  }
});

describe("planner service", () => {
  it("returns health status without authentication", async () => {
    activeServer = await startTestServer();

    const response = await fetch(`${activeServer.baseUrl}/healthz`);
    const payload = (await response.json()) as { service: string; status: string };

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      service: "villagesim-planner",
      status: "ok",
    });
  });

  it("accepts a valid signed planner request and returns strict JSON", async () => {
    const server = await startTestServer();
    activeServer = server;

    const request = createSignedRequest("planner-request-1");
    const response = await fetch(`${server.baseUrl}/plan`, {
      method: "POST",
      headers: request.headers,
      body: request.body,
    });

    const payload = (await response.json()) as {
      plan: { rationale: string; plan: Array<{ type: string }> };
      requestId: string;
    };

    expect(response.status).toBe(200);
    expect(payload.requestId).toBe("planner-request-1");
    expect(payload.plan.plan[0]?.type).toBe("speak");
    expect(server.logger).toHaveBeenCalledWith(
      expect.objectContaining({
        failureReason: null,
        requestId: "planner-request-1",
        statusCode: 200,
      }),
    );
  });

  it("rejects invalid bearer tokens", async () => {
    const server = await startTestServer();
    activeServer = server;

    const request = createSignedRequest("planner-request-2");
    request.headers.Authorization = "Bearer wrong-token";

    const response = await fetch(`${server.baseUrl}/plan`, {
      method: "POST",
      headers: request.headers,
      body: request.body,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_bearer_token" });
  });

  it("rejects invalid signatures", async () => {
    const server = await startTestServer();
    activeServer = server;

    const request = createSignedRequest("planner-request-3");
    request.headers["X-VillageSim-Signature"] = "0".repeat(64);

    const response = await fetch(`${server.baseUrl}/plan`, {
      method: "POST",
      headers: request.headers,
      body: request.body,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_signature" });
  });

  it("rejects stale timestamps outside the replay window", async () => {
    const server = await startTestServer();
    activeServer = server;

    const staleRequestedAt = "2026-03-25T11:40:00.000Z";
    const request = createSignedRequest("planner-request-4", staleRequestedAt);

    const response = await fetch(`${server.baseUrl}/plan`, {
      method: "POST",
      headers: request.headers,
      body: request.body,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "stale_request_timestamp" });
  });

  it("rejects request replays within the replay window", async () => {
    const server = await startTestServer();
    activeServer = server;

    const request = createSignedRequest("planner-request-5");

    const first = await fetch(`${server.baseUrl}/plan`, {
      method: "POST",
      headers: request.headers,
      body: request.body,
    });
    const second = await fetch(`${server.baseUrl}/plan`, {
      method: "POST",
      headers: request.headers,
      body: request.body,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({ error: "request_replay" });
  });

  it("applies simple rate limiting", async () => {
    const config = createConfig();
    config.rateLimitMax = 1;

    const server = await startTestServer(config);
    activeServer = server;

    const firstRequest = createSignedRequest("planner-request-6");
    const secondRequest = createSignedRequest("planner-request-7");

    const first = await fetch(`${server.baseUrl}/plan`, {
      method: "POST",
      headers: firstRequest.headers,
      body: firstRequest.body,
    });
    const second = await fetch(`${server.baseUrl}/plan`, {
      method: "POST",
      headers: secondRequest.headers,
      body: secondRequest.body,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBe("60");
    await expect(second.json()).resolves.toMatchObject({ error: "rate_limited", retryAfterSeconds: 60 });
  });
});
