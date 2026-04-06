import { describe, expect, it } from "vitest";

import { computePlannerSignature, createPlannerServiceHeaders } from "../../lib/plannerSigning";

describe("planner signing helpers", () => {
  it("computes deterministic planner signatures", () => {
    expect(computePlannerSignature('{"hello":"world"}', "request-1", "2026-03-25T12:00:00.000Z", "planner-secret")).toBe(
      "2f17b141bb574f9522190fb9c21ca9ee4df6729609fba3ae51d66d662338a60f",
    );
  });

  it("adds signature headers only when a signing secret is configured", () => {
    const signed = createPlannerServiceHeaders({
      body: '{"hello":"world"}',
      requestId: "request-1",
      requestedAt: "2026-03-25T12:00:00.000Z",
      signingSecret: "planner-secret",
      token: "planner-token",
    });

    expect(signed).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer planner-token",
      "X-VillageSim-Request-Id": "request-1",
      "X-VillageSim-Requested-At": "2026-03-25T12:00:00.000Z",
    });
    expect(signed["X-VillageSim-Signature"]).toMatch(/^[a-f0-9]{64}$/);

    expect(
      createPlannerServiceHeaders({
        body: "{}",
        requestId: "request-2",
        requestedAt: "2026-03-25T12:00:00.000Z",
        signingSecret: null,
        token: "planner-token",
      }),
    ).not.toHaveProperty("X-VillageSim-Signature");
  });
});
