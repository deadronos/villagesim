import { afterEach, describe, expect, it, vi } from "vitest";

import { exchangeCodeForToken, getGitHubOAuthUrl, getGitHubUser } from "../../lib/githubAuth";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("githubAuth helpers", () => {
  it("builds the GitHub authorize URL", () => {
    const url = new URL(getGitHubOAuthUrl("client-id", "http://localhost:3000/api/auth/callback", "state-123"));

    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe("/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/callback");
    expect(url.searchParams.get("scope")).toBe("read:user");
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("returns the token payload when the exchange succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "oauth-token", scope: "read:user", token_type: "bearer" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeCodeForToken("client-id", "client-secret", "code-123", "http://localhost/callback")).resolves.toEqual({
      access_token: "oauth-token",
      scope: "read:user",
      token_type: "bearer",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://github.com/login/oauth/access_token",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws on exchange HTTP and API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("nope", { status: 401 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: "bad_verification_code", error_description: "Bad code" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
    );

    await expect(exchangeCodeForToken("client-id", "client-secret", "bad", "http://localhost/callback")).rejects.toThrow(
      "GitHub token exchange failed with HTTP 401",
    );
    await expect(exchangeCodeForToken("client-id", "client-secret", "bad", "http://localhost/callback")).rejects.toThrow(
      "GitHub token exchange error: Bad code",
    );
  });

  it("fetches the GitHub user profile and rejects failed requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ login: "deadronos", name: "Deadronos" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(new Response("nope", { status: 500 })),
    );

    await expect(getGitHubUser("oauth-token")).resolves.toEqual({
      login: "deadronos",
      name: "Deadronos",
    });
    await expect(getGitHubUser("oauth-token")).rejects.toThrow("GitHub user profile fetch failed with HTTP 500");
  });
});
