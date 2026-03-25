import { NextResponse } from "next/server";

import { exchangeCodeForToken, getGitHubUser } from "../../../../lib/githubAuth";
import { seedOrReopenTownFromProfile } from "../../../../lib/mockData";
import {
  encodeSession,
  OAUTH_STATE_COOKIE_NAME,
  parseCookies,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  type SessionPayload,
} from "../../../../lib/session";

function getCallbackUri(request: Request): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? new URL(request.url).origin;
  return `${base}/api/auth/callback`;
}

function isSecure(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

export async function GET(request: Request): Promise<Response> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? new URL(request.url).origin;

  if (!clientId || !clientSecret || clientId === "github_oauth_client_id") {
    return NextResponse.redirect(`${baseUrl}/?auth_error=unconfigured`);
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  const expectedState = cookies[OAUTH_STATE_COOKIE_NAME];

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${baseUrl}/?auth_error=state_mismatch`);
  }

  try {
    const tokenData = await exchangeCodeForToken(clientId, clientSecret, code, getCallbackUri(request));
    if (!tokenData.access_token) {
      return NextResponse.redirect(`${baseUrl}/?auth_error=token_exchange`);
    }

    const profile = await getGitHubUser(tokenData.access_token);

    const town = seedOrReopenTownFromProfile({
      login: profile.login,
      name: profile.name,
      avatar_url: profile.avatar_url,
    });

    const payload: SessionPayload = {
      user: {
        login: profile.login,
        name: profile.name ?? undefined,
        avatarUrl: profile.avatar_url ?? undefined,
      },
      townId: town.id,
      expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    };

    const response = NextResponse.redirect(`${baseUrl}/town/${encodeURIComponent(town.id)}`);
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: encodeSession(payload),
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure(request),
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
    });
    response.cookies.set({
      name: OAUTH_STATE_COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return response;
  } catch (err) {
    console.error("[auth/callback] OAuth callback failed:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${baseUrl}/?auth_error=callback_failed`);
  }
}
