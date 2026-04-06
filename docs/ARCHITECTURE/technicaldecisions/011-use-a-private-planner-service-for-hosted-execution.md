# ADR 011: Use a private planner service for hosted execution

## Title

Use a private planner service for hosted execution

## Status

Accepted

## Context

The existing codebase already has a strong separation between:

- player identity and town ownership in Next.js via GitHub OAuth and signed cookie sessions,
- authoritative hosted town state in Convex,
- planner transport in `lib/model_proxy.ts`, and
- hosted planner queueing/budgeting in `lib/plannerExecution.ts`.

That gives VillageSim a cleaner hosted evolution path than directly embedding a provider-specific runtime into the Next.js app.

The first hosted rollout also has intentionally modest operational goals:

- manually approved users only,
- likely a single operator at first,
- local development should stay easy,
- hosted planner calls may need to reach a runtime that is only available on a developer-operated machine.

Those constraints make a small server-to-server planner gateway more practical than browser-direct planner access or a full auth-platform migration.

## Decision

Use a private planner service as the first hosted planner boundary.

### Service boundary

The VillageSim Next.js app should call a planner service from server-side code only.

- Browsers do **not** call the planner service directly.
- The main planner endpoint does **not** depend on browser CORS for security.
- `lib/model_proxy.ts` remains the app-side planner seam and should treat the planner service as a strict JSON planner gateway.

### Deployment shape

The first hosted planner service should be small and Docker-friendly.

- It may run locally during development on `localhost`.
- For early hosted/private-alpha use, it may run on a developer-operated machine and be exposed through Tailscale Funnel.
- The ingress URL may change later without changing the app/service contract.

Tailscale Funnel is an acceptable first ingress path for private alpha use, but it is not the primary trust boundary.

### Authentication and request integrity

The planner service should require server-to-server authentication and request signing.

- Require a shared bearer token.
- Require a request timestamp and request ID.
- Require an HMAC signature over the request payload and freshness metadata.
- Standardize the app-side env/config vocabulary around `VILLAGESIM_PLANNER_SERVICE_URL`, `VILLAGESIM_PLANNER_SERVICE_TOKEN`, `VILLAGESIM_PLANNER_SERVICE_SIGNING_SECRET`, `VILLAGESIM_PLANNER_SERVICE_TIMEOUT_MS`, and `VILLAGESIM_PLANNER_MOCK`.
- Reject stale or replayed requests.
- Rate limit and cap body size aggressively.

### Planner runtime isolation

Copilot-backed planner execution should live behind the planner service rather than inside the internet-facing Next.js app.

- The private service may use Copilot SDK, Copilot CLI server mode, or another local provider adapter.
- The service returns only validated planner JSON and never exposes tool traces or provider-specific internals to callers.
- A shared contract module should define the planner payload plus the request metadata envelope so the app and planner service stay in lockstep.
- The app preserves the existing deterministic mock fallback path when the service is unavailable or returns invalid output.

### Approval model for the first hosted rollout

Keep the current Next.js GitHub OAuth/session strategy from ADR 007.

For the initial hosted rollout, manual approval should be enforced as an env-configured GitHub login allowlist at the application auth boundary before establishing a hosted session.

## Consequences

- The Next.js app stays provider-agnostic and keeps its current GitHub OAuth/session model.
- Planner security relies on explicit server-to-server credentials and signatures rather than browser origin checks.
- Local development can use either the mock planner path or a local planner service without changing player auth.
- The same service contract can later move from a developer machine/Tailscale Funnel to a more durable host without redesigning the app integration.
- Hosted operations now include planner-service availability, secrets management, request logging, and replay/rate-limit controls as first-class concerns.
