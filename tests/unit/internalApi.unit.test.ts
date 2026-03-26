import { describe, expect, it } from "vitest";

import { createInternalApiHeaders, isInternalApiRequestAuthorized, readInternalApiToken } from "../../lib/internalApi";

describe("internal API helpers", () => {
  it("reads and trims the configured bearer token", () => {
    expect(readInternalApiToken({ VILLAGESIM_INTERNAL_API_TOKEN: "  internal-token  " })).toBe("internal-token");
    expect(readInternalApiToken({ VILLAGESIM_INTERNAL_API_TOKEN: "   " })).toBeNull();
  });

  it("builds authorization headers only when a token is available", () => {
    expect(createInternalApiHeaders("internal-token")).toEqual({
      Authorization: "Bearer internal-token",
    });
    expect(createInternalApiHeaders("")).toEqual({});
  });

  it("authorizes requests only when the bearer token matches", () => {
    const env = { VILLAGESIM_INTERNAL_API_TOKEN: "internal-token" };

    expect(
      isInternalApiRequestAuthorized(
        new Request("http://localhost/internal", {
          headers: { Authorization: "Bearer internal-token" },
        }),
        env,
      ),
    ).toBe(true);

    expect(
      isInternalApiRequestAuthorized(
        new Request("http://localhost/internal", {
          headers: { Authorization: "Bearer wrong-token" },
        }),
        env,
      ),
    ).toBe(false);
  });
});
