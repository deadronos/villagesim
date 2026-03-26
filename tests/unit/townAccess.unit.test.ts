import { describe, expect, it } from "vitest";

import { assertCanReadTown, assertCanWriteTown, canAccessTown, isTownAccessError } from "../../lib/townAccess";

const profileTown = {
  id: "deadronos-town",
  metadata: { createdFrom: "profile" as const },
  owner: { login: "deadronos" },
};

describe("town access helpers", () => {
  it("allows public seeded towns for any caller", () => {
    expect(
      canAccessTown(
        {
          id: "demo-town",
          metadata: { createdFrom: "seed" as const },
          owner: { login: "demo-user" },
        },
        null,
      ),
    ).toBe(true);
  });

  it("requires the matching owner for profile towns", () => {
    expect(canAccessTown(profileTown, "deadronos")).toBe(true);
    expect(canAccessTown(profileTown, "someone-else")).toBe(false);
    expect(() => assertCanReadTown(profileTown, null)).toThrow("belongs to @deadronos");
    expect(() => assertCanWriteTown(profileTown, "someone-else")).toThrow("Sign in as that user to change it.");
  });

  it("recognizes both class instances and serialized access errors", () => {
    expect(isTownAccessError(new Error("Town deadronos-town belongs to @deadronos. Sign in as that user to read it."))).toBe(
      true,
    );
    expect(isTownAccessError({ code: "TOWN_ACCESS" })).toBe(true);
    expect(isTownAccessError(new Error("something else"))).toBe(false);
  });
});
