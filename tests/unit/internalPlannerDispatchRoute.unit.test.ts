import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dispatchHostedPlannerQueue = vi.fn();
const isHostedConvexModeEnabled = vi.fn();

vi.mock("../../lib/authoritativeTownStore", () => ({
  dispatchHostedPlannerQueue,
  isHostedConvexModeEnabled,
}));

const originalToken = process.env.VILLAGESIM_INTERNAL_API_TOKEN;

async function loadRouteModule() {
  vi.resetModules();
  return import("../../app/api/internal/planner-dispatch/route");
}

describe("POST /api/internal/planner-dispatch", () => {
  beforeEach(() => {
    process.env.VILLAGESIM_INTERNAL_API_TOKEN = "internal-token";
    isHostedConvexModeEnabled.mockReturnValue(true);
    dispatchHostedPlannerQueue.mockResolvedValue({
      claimed: 1,
      completed: 1,
      dispatching: 0,
      failed: 0,
      processed: 1,
      queued: 0,
      remaining: 0,
      skipped: 0,
    });
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.VILLAGESIM_INTERNAL_API_TOKEN;
    } else {
      process.env.VILLAGESIM_INTERNAL_API_TOKEN = originalToken;
    }
  });

  it("rejects requests without the internal bearer token", async () => {
    const { POST } = await loadRouteModule();
    const response = await POST(
      new Request("http://localhost:3000/api/internal/planner-dispatch", {
        body: JSON.stringify({ townId: "demo-town" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(dispatchHostedPlannerQueue).not.toHaveBeenCalled();
  });

  it("dispatches hosted planner work with bypassed town access checks", async () => {
    const { POST } = await loadRouteModule();
    const response = await POST(
      new Request("http://localhost:3000/api/internal/planner-dispatch", {
        body: JSON.stringify({ source: "cron", townId: "demo-town" }),
        headers: {
          Authorization: "Bearer internal-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );

    const payload = (await response.json()) as { ok: boolean; source: string; townId: string };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      source: "cron",
      townId: "demo-town",
    });
    expect(dispatchHostedPlannerQueue).toHaveBeenCalledWith({
      bypassAccessCheck: true,
      source: "cron",
      townId: "demo-town",
    });
  });

  it("short-circuits in mock-local mode", async () => {
    isHostedConvexModeEnabled.mockReturnValue(false);

    const { POST } = await loadRouteModule();
    const response = await POST(
      new Request("http://localhost:3000/api/internal/planner-dispatch", {
        body: JSON.stringify({ townId: "demo-town" }),
        headers: {
          Authorization: "Bearer internal-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      mode: "mock-local",
      ok: true,
      processed: 0,
      remaining: 0,
    });
    expect(dispatchHostedPlannerQueue).not.toHaveBeenCalled();
  });

  it("validates required town ids and defaults invalid sources", async () => {
    const { POST } = await loadRouteModule();

    const missingTown = await POST(
      new Request("http://localhost:3000/api/internal/planner-dispatch", {
        body: JSON.stringify({ source: "cron" }),
        headers: {
          Authorization: "Bearer internal-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(missingTown.status).toBe(400);
    await expect(missingTown.json()).resolves.toMatchObject({
      error: "Planner dispatch requires a townId.",
      ok: false,
    });

    const invalidSource = await POST(
      new Request("http://localhost:3000/api/internal/planner-dispatch", {
        body: JSON.stringify({ source: "bogus", townId: "demo-town" }),
        headers: {
          Authorization: "Bearer internal-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );

    await expect(invalidSource.json()).resolves.toMatchObject({
      mode: "convex-hosted",
      ok: true,
      source: "internal-route",
      townId: "demo-town",
    });
    expect(dispatchHostedPlannerQueue).toHaveBeenLastCalledWith({
      bypassAccessCheck: true,
      source: "internal-route",
      townId: "demo-town",
    });
  });

  it("surfaces dispatcher failures as 500 responses", async () => {
    dispatchHostedPlannerQueue.mockRejectedValueOnce(new Error("dispatch exploded"));

    const { POST } = await loadRouteModule();
    const response = await POST(
      new Request("http://localhost:3000/api/internal/planner-dispatch", {
        body: JSON.stringify({ townId: "demo-town" }),
        headers: {
          Authorization: "Bearer internal-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "dispatch exploded",
      ok: false,
      townId: "demo-town",
    });
  });
});
