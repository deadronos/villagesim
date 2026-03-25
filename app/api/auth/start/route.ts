import { NextResponse } from "next/server";

import { getGitHubOAuthUrl } from "../../../../lib/githubAuth";
import {
  generateOAuthState,
  OAUTH_STATE_COOKIE_NAME,
  OAUTH_STATE_MAX_AGE_SECONDS,
} from "../../../../lib/session";

function getCallbackUri(request: Request): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? new URL(request.url).origin;
  return `${base}/api/auth/callback`;
}

export async function GET(request: Request): Promise<Response> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId || clientId === "github_oauth_client_id") {
    return NextResponse.json({ error: "GitHub OAuth is not configured." }, { status: 503 });
  }

  const state = generateOAuthState();
  const redirectUri = getCallbackUri(request);
  const oauthUrl = getGitHubOAuthUrl(clientId, redirectUri, state);

  const response = NextResponse.redirect(oauthUrl);
  response.cookies.set({
    name: OAUTH_STATE_COOKIE_NAME,
    value: state,
    httpOnly: true,
    sameSite: "lax",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}
