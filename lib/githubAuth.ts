export interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface GitHubUserProfile {
  login: string;
  name?: string | null;
  avatar_url?: string | null;
  email?: string | null;
}

export function getGitHubOAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "read:user",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<GitHubTokenResponse> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
  });
  if (!response.ok) {
    throw new Error(`GitHub token exchange failed with HTTP ${response.status}`);
  }
  const data = (await response.json()) as GitHubTokenResponse;
  if (data.error) {
    throw new Error(`GitHub token exchange error: ${data.error_description ?? data.error}`);
  }
  return data;
}

export async function getGitHubUser(accessToken: string): Promise<GitHubUserProfile> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub user profile fetch failed with HTTP ${response.status}`);
  }
  return response.json() as Promise<GitHubUserProfile>;
}
