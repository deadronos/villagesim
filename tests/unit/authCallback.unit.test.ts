import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForToken = vi.fn();
const getGitHubUser = vi.fn();
const createOrReopenTownForProfile = vi.fn();
const encodeSession = vi.fn(() => "encoded-session");

vi.mock("../../lib/githubAuth", () => ({
  exchangeCodeForToken,
  getGitHubUser,
}));

vi.mock("../../lib/authoritativeTownStore", () => ({
  createOrReopenTownForProfile,
}));

vi.mock("../../lib/session", async () => {
  const actual = await vi.importActual<typeof import("../../lib/session")>("../../lib/session");
  return {
    ...actual,
    encodeSession,
  };
});

const originalEnv = {
  APPROVED_GITHUB_LOGINS: process.env.APPROVED_GITHUB_LOGINS,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
};

async function loadRouteModule() {
  vi.resetModules();
  return import("../../app/api/auth/callback/route");
}

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    process.env.GITHUB_CLIENT_ID = "test-client-id";
    process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
    process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
    process.env.APPROVED_GITHUB_LOGINS = "deadronos";
  });

  afterEach(() => {
    if (originalEnv.GITHUB_CLIENT_ID === undefined) {
      delete process.env.GITHUB_CLIENT_ID;
    } else {
      process.env.GITHUB_CLIENT_ID = originalEnv.GITHUB_CLIENT_ID;
    }

    if (originalEnv.GITHUB_CLIENT_SECRET === undefined) {
      delete process.env.GITHUB_CLIENT_SECRET;
    } else {
      process.env.GITHUB_CLIENT_SECRET = originalEnv.GITHUB_CLIENT_SECRET;
    }

    if (originalEnv.NEXT_PUBLIC_BASE_URL === undefined) {
      delete process.env.NEXT_PUBLIC_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_BASE_URL = originalEnv.NEXT_PUBLIC_BASE_URL;
    }

    if (originalEnv.APPROVED_GITHUB_LOGINS === undefined) {
      delete process.env.APPROVED_GITHUB_LOGINS;
    } else {
      process.env.APPROVED_GITHUB_LOGINS = originalEnv.APPROVED_GITHUB_LOGINS;
    }
  });

  it("denies unapproved users before town creation and session issuance", async () => {
    exchangeCodeForToken.mockResolvedValue({ access_token: "oauth-token" });
    getGitHubUser.mockResolvedValue({ login: "someone-else", name: "Someone Else", avatar_url: null });

    const { GET } = await loadRouteModule();
    const response = await GET(
      new Request("http://localhost:3000/api/auth/callback?code=test-code&state=expected-state", {
        headers: {
          cookie: "__vs_oauth_state=expected-state; __vs_session=stale-session",
        },
      }),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/?auth_error=not_approved");
    expect(createOrReopenTownForProfile).not.toHaveBeenCalled();
    expect(encodeSession).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("__vs_oauth_state=");
    expect(response.headers.get("set-cookie")).toContain("__vs_session=");
  });

  it("continues the OAuth flow for approved users", async () => {
    exchangeCodeForToken.mockResolvedValue({ access_token: "oauth-token" });
    getGitHubUser.mockResolvedValue({ login: "deadronos", name: "Deadronos", avatar_url: "https://avatars.test/u/1" });
    createOrReopenTownForProfile.mockResolvedValue({ id: "deadronos-town" });

    const { GET } = await loadRouteModule();
    const response = await GET(
      new Request("http://localhost:3000/api/auth/callback?code=test-code&state=expected-state", {
        headers: {
          cookie: "__vs_oauth_state=expected-state",
        },
      }),
    );

    expect(createOrReopenTownForProfile).toHaveBeenCalledWith({
      callerLogin: "deadronos",
      profile: {
        login: "deadronos",
        name: "Deadronos",
        avatar_url: "https://avatars.test/u/1",
      },
    });
    expect(encodeSession).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe("http://localhost:3000/town/deadronos-town");
  });

  it("redirects when OAuth is unconfigured or the state check fails", async () => {
    delete process.env.GITHUB_CLIENT_ID;

    let route = await loadRouteModule();
    let response = await route.GET(new Request("http://localhost:3000/api/auth/callback"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/?auth_error=unconfigured");

    process.env.GITHUB_CLIENT_ID = "test-client-id";
    route = await loadRouteModule();
    response = await route.GET(
      new Request("http://localhost:3000/api/auth/callback?code=test-code&state=wrong-state", {
        headers: {
          cookie: "__vs_oauth_state=expected-state",
        },
      }),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/?auth_error=state_mismatch");
  });

  it("redirects when GitHub does not return an access token", async () => {
    exchangeCodeForToken.mockResolvedValue({});

    const { GET } = await loadRouteModule();
    const response = await GET(
      new Request("http://localhost:3000/api/auth/callback?code=test-code&state=expected-state", {
        headers: {
          cookie: "__vs_oauth_state=expected-state",
        },
      }),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/?auth_error=token_exchange");
  });

  it("redirects to callback_failed when the OAuth flow throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    exchangeCodeForToken.mockRejectedValue(new Error("boom"));

    const { GET } = await loadRouteModule();
    const response = await GET(
      new Request("https://villagesim.test/api/auth/callback?code=test-code&state=expected-state", {
        headers: {
          cookie: "__vs_oauth_state=expected-state",
        },
      }),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/?auth_error=callback_failed");
    expect(consoleError).toHaveBeenCalled();
  });
});
