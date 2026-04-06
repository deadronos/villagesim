import { afterEach, describe, expect, it } from "vitest";

import { loadPlannerServiceEnv } from "../../services/planner/src/env";

describe("planner service env loading", () => {
  afterEach(() => {
    delete process.env.VILLAGESIM_PLANNER_SERVICE_TOKEN;
    delete process.env.VILLAGESIM_PLANNER_SERVICE_SIGNING_SECRET;
    delete process.env.VILLAGESIM_PLANNER_SERVICE_PORT;
  });

  it("loads planner-service variables from repo env files without overwriting explicit env values", async () => {
    const tempFile = new URL("./planner-service-env-fixture.env", import.meta.url);
    const fs = await import("node:fs");

    fs.writeFileSync(
      tempFile,
      [
        "VILLAGESIM_PLANNER_SERVICE_TOKEN=from-file-token",
        "VILLAGESIM_PLANNER_SERVICE_SIGNING_SECRET=from-file-secret",
        "VILLAGESIM_PLANNER_SERVICE_PORT=4011",
      ].join("\n"),
    );

    process.env.VILLAGESIM_PLANNER_SERVICE_TOKEN = "from-shell-token";

    try {
      loadPlannerServiceEnv([tempFile.pathname]);

      expect(process.env.VILLAGESIM_PLANNER_SERVICE_TOKEN).toBe("from-shell-token");
      expect(process.env.VILLAGESIM_PLANNER_SERVICE_SIGNING_SECRET).toBe("from-file-secret");
      expect(process.env.VILLAGESIM_PLANNER_SERVICE_PORT).toBe("4011");
    } finally {
      fs.rmSync(tempFile, { force: true });
    }
  });
});