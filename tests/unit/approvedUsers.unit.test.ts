import { describe, expect, it } from "vitest";

import { getApprovedGitHubLogins, isGitHubLoginApproved } from "../../lib/approvedUsers";

describe("approved GitHub users", () => {
  it("normalizes the configured login allowlist", () => {
    expect(getApprovedGitHubLogins(" deadronos, OCTOcat \n,  demo-user ")).toEqual([
      "deadronos",
      "octocat",
      "demo-user",
    ]);
  });

  it("matches logins case-insensitively", () => {
    expect(isGitHubLoginApproved("Deadronos", "deadronos,octocat")).toBe(true);
    expect(isGitHubLoginApproved("someone-else", "deadronos,octocat")).toBe(false);
  });

  it("treats an empty allowlist as no approved users", () => {
    expect(isGitHubLoginApproved("deadronos", undefined)).toBe(false);
    expect(getApprovedGitHubLogins(" , ")).toEqual([]);
  });
});
