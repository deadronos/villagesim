import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "../../../../lib/session";

export async function POST(request: Request): Promise<Response> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? new URL(request.url).origin;
  const response = NextResponse.redirect(`${base}/`);
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
