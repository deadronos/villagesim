import { describe, expect, it } from "vitest";

import { POST } from "../../app/api/auth/logout/route";

describe("POST /api/auth/logout", () => {
  it("clears the session cookie and redirects home", async () => {
    const response = await POST(new Request("http://localhost:3000/api/auth/logout", { method: "POST" }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
    expect(response.headers.get("set-cookie")).toContain("__vs_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
