import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const SESSION_COOKIE_NAME = "__vs_session";
export const OAUTH_STATE_COOKIE_NAME = "__vs_oauth_state";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const OAUTH_STATE_MAX_AGE_SECONDS = 300; // 5 minutes

export interface SessionUser {
  login: string;
  name?: string;
  avatarUrl?: string;
}

export interface SessionPayload {
  user: SessionUser;
  townId: string;
  expiresAt: number;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret !== "replace-with-a-local-dev-secret") {
    return secret;
  }
  if (process.env.NODE_ENV !== "test") {
    console.warn(
      "[session] SESSION_SECRET is not set or is using the example placeholder. " +
        "Set a strong random value in .env.local before deploying.",
    );
  }
  return "insecure-dev-fallback-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function encodeSession(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function decodeSession(value: string): SessionPayload | null {
  try {
    const dotIndex = value.lastIndexOf(".");
    if (dotIndex < 1) return null;

    const encoded = value.slice(0, dotIndex);
    const provided = value.slice(dotIndex + 1);
    const expected = sign(encoded);

    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expected);
    if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
      return null;
    }

    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed || typeof parsed.expiresAt !== "number" || Date.now() > parsed.expiresAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function generateOAuthState(): string {
  return randomBytes(16).toString("hex");
}

export function getSessionFromCookieHeader(cookieHeader: string): SessionPayload | null {
  const cookies = parseCookies(cookieHeader);
  const value = cookies[SESSION_COOKIE_NAME];
  if (!value) return null;
  return decodeSession(value);
}

export function parseCookies(cookieHeader: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    result[key] = val;
  }
  return result;
}
