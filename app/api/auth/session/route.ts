import { NextResponse } from "next/server";

import { decodeSession, parseCookies, SESSION_COOKIE_NAME } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  const value = cookies[SESSION_COOKIE_NAME];
  const session = value ? decodeSession(value) : null;

  if (!session) {
    return NextResponse.json({ authenticated: false, user: null, townId: null });
  }

  return NextResponse.json({
    authenticated: true,
    user: session.user,
    townId: session.townId,
  });
}
