import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalClientId = process.env.GITHUB_CLIENT_ID;
const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;

async function loadRouteModule() {
  vi.resetModules();
  return import("../../app/api/auth/start/route");
}

describe("GET /api/auth/start", () => {
  beforeEach(() => {
    process.env.GITHUB_CLIENT_ID = "test-client-id";
    process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
  });

  afterEach(() => {
    if (originalClientId === undefined) {
      delete process.env.GITHUB_CLIENT_ID;
    } else {
      process.env.GITHUB_CLIENT_ID = originalClientId;
    }

    if (originalBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_BASE_URL = originalBaseUrl;
    }
  });

  it("returns a configuration error when GitHub OAuth is unavailable", async () => {
    delete process.env.GITHUB_CLIENT_ID;

    const { GET } = await loadRouteModule();
    const response = await GET(new Request("http://localhost:3000/api/auth/start"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "GitHub OAuth is not configured." });
  });

  it("redirects to GitHub and stores the OAuth state in a cookie", async () => {
    const { GET } = await loadRouteModule();
    const response = await GET(new Request("http://localhost:3000/api/auth/start"));

    expect(response.status).toBe(307);

    const redirectUrl = new URL(response.headers.get("location")!);
    const cookieHeader = response.headers.get("set-cookie")!;
    const cookieValue = cookieHeader.match(/__vs_oauth_state=([^;]+)/)?.[1];

    expect(redirectUrl.origin).toBe("https://github.com");
    expect(redirectUrl.pathname).toBe("/login/oauth/authorize");
    expect(redirectUrl.searchParams.get("client_id")).toBe("test-client-id");
    expect(redirectUrl.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/callback");
    expect(redirectUrl.searchParams.get("state")).toBe(cookieValue);
    expect(cookieHeader).toContain("__vs_oauth_state=");
    expect(cookieHeader).toContain("HttpOnly");
  });
});
