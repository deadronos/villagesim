# ADR 007: GitHub OAuth and Session Strategy

## Title

Use GitHub OAuth with signed HttpOnly cookie sessions for hosted user identity

## Status

Accepted

## Context

Phase 2 of the hosted plan (`plans/plan-hosted.md`) requires stable user identity tied to authenticated GitHub profiles. The previous starter had a placeholder disabled "Connect GitHub" button and `SESSION_SECRET` in `.env.example` but no implementation.

Requirements from the issue:

- A signed-in user can open their hosted town without a separate planner connect step.
- Town ownership is tied to authenticated app identity (GitHub login).
- Sessions survive page navigation without re-authentication.
- The approach must be layerable — no vendor lock-in before the Convex backend is wired in.

## Decision

### OAuth flow

Use the standard GitHub OAuth web application flow:

1. `GET /api/auth/start` — generate a random CSRF state, store it in a short-lived `__vs_oauth_state` HttpOnly cookie, redirect to `https://github.com/login/oauth/authorize` with `scope=read:user`.
2. `GET /api/auth/callback` — validate CSRF state, exchange `code` for an access token via `https://github.com/login/oauth/access_token`, fetch the user profile from `https://api.github.com/user`, seed (or reopen) the town from the profile via `createTownFromProfile`, set a session cookie, and redirect to `/town/{login}-town`.

The OAuth callback may also retain server-side access to the GitHub user token for future hosted planner calls, but the browser-facing session contract stays minimal.

### Session encoding

Use a self-contained signed cookie (`__vs_session`) with no server-side session store:

- **Payload**: JSON with `{ user: { login, name?, avatarUrl? }, townId, expiresAt }`.
- **Signature**: HMAC-SHA256 over the base64url-encoded payload using `SESSION_SECRET`.
- **Format**: `{base64url-payload}.{base64url-signature}` — verified with `timingSafeEqual` on every request.
- **Cookie flags**: `HttpOnly`, `SameSite=Lax`, `Secure` in production, 7-day `Max-Age`.
- Falls back to a clearly-labelled insecure dev secret when `SESSION_SECRET` is unset or left as the example placeholder.

### Planner authorization boundary

The hosted planner path should prefer reusing the authenticated user's GitHub OAuth token server-side for Copilot SDK calls.

No GitHub access token, Copilot entitlement token, or other planner authorization material may be stored in `__vs_session` or any other client-visible session field.

If future implementation discovery shows that OAuth-token reuse is insufficient for Copilot SDK, a separate server-side planner authorization path can be added without changing the signed-cookie session model described above.

### Town seeding

When the OAuth callback succeeds, call `createTownFromProfile(profile)` from `lib/mockData.ts`. This uses the GitHub `login` as the deterministic town ID (`{login}-town`) and seeds the mock town with the user's display name and avatar URL. The town state is stored in the in-memory `localTownStore`. Future Convex integration replaces the in-memory store with a Convex mutation while keeping the same interface.

### Convex-facing auth bridge strategy

When Convex is integrated, the session payload (`login`, `townId`) serves as the identity token:

- **Reads**: Pass `login` and `townId` as arguments to Convex queries; the query validates that the requested `townId` starts with or matches the owner's login before returning data.
- **Writes**: All Convex mutations that modify town state accept a `callerLogin` field. The mutation reads the stored `owner.login` from the Convex `towns` table and rejects the write if `callerLogin !== owner.login`.
- **Admin operations** (worker tick advancement): Use the `CONVEX_ADMIN_KEY` from the environment; these calls bypass per-user ownership checks and run server-side only.
- The `TownState.metadata.tokenSummary` field carries a non-secret summary string for debugging ownership chain issues without exposing the session secret.

### UI surface

- The `Login` component now accepts a `sessionUser` prop (type `SessionUser | null`) passed down from the `TownPage` server component via `TownPageClient`.
- When unauthenticated: shows a live `<a href="/api/auth/start">Connect GitHub</a>` styled as a button.
- When authenticated: shows `@login` identity and a `<form action="/api/auth/logout" method="POST">` sign-out button.
- The server component (`app/town/[id]/page.tsx`) reads the session using `cookies()` from `next/headers` and `decodeSession()` from `lib/session.ts`.

### New helper modules

- `lib/session.ts` — `encodeSession`, `decodeSession`, `generateOAuthState`, `parseCookies`, cookie name constants, and session type exports.
- `lib/githubAuth.ts` — `getGitHubOAuthUrl`, `exchangeCodeForToken`, `getGitHubUser` with typed interfaces.

### New API routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/auth/start` | GET | Generate CSRF state, redirect to GitHub |
| `/api/auth/callback` | GET | Validate state, exchange code, seed town, set cookie |
| `/api/auth/session` | GET | Return current session JSON (public, cached per request) |
| `/api/auth/logout` | POST | Clear `__vs_session` cookie, redirect to `/` |

## Consequences

- Users can sign in with GitHub and immediately open their own hosted town without a separate planner connect flow.
- Town ownership is stable and deterministic: `{github-login}-town` maps 1:1 to the authenticated user.
- Sessions are stateless (no DB table) and self-describing, making horizontal scaling straightforward before a session store is needed.
- The session payload is minimal — it never contains the GitHub access token or future planner authorization data, keeping the cookie footprint small and reducing exposure if the `SESSION_SECRET` rotates.
- When `GITHUB_CLIENT_ID` is not configured (local-first mode), `/api/auth/start` returns HTTP 503 so the demo flow continues to work without OAuth.
- Future Convex integration only needs to replace the `localTownStore` call in the callback with a Convex mutation; the session cookie, HMAC logic, and UI surface remain unchanged.
