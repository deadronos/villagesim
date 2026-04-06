# VillageSim Setup Guide

This guide documents the current, implemented setup paths for VillageSim.

- Use local mock mode for the fastest first run.
- Use local planner-service mode when you want signed server-to-server planner requests on your machine.
- Use the private-alpha setup when the Next.js app is deployed on Vercel, town state is backed by Convex, and the planner service is exposed through Tailscale Funnel.

## Where to put environment variables

VillageSim currently has two runtime surfaces, and they do not load environment variables the same way:

- `app/` and the Next.js server load `.env.local` automatically.
- `services/planner/` does not load `.env.local` automatically. For local runs, export the variables into your shell before starting the service, or set them in your container or host environment.

Start from the shared template:

```bash
cp .env.example .env.local
```

## 1. Local mock mode

Use this for the first successful run.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the env template:

   ```bash
   cp .env.example .env.local
   ```

3. Keep these values as-is in `.env.local`:

   ```env
   VILLAGESIM_STATE_MODE=mock
   VILLAGESIM_PLANNER_MOCK=true
   NEXT_PUBLIC_BASE_URL=http://localhost:3000
   NEXT_PUBLIC_DEFAULT_TOWN_ID=demo-town
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

5. Verify the local-first path:

   - Open `http://localhost:3000/`
   - Open `http://localhost:3000/town/demo-town`
   - Optionally run `npm run tick:mock -- --town demo-town --count 2`

In this mode:

- no GitHub OAuth configuration is required unless you want to test sign-in,
- no Convex deployment is required,
- no planner service is required,
- the app uses deterministic mock planner behavior.

## 2. Local planner-service mode

Use this when you want to exercise the real signed planner-service boundary locally.

### Install both dependency sets

The planner service has its own `package.json`.

```bash
npm install
npm --prefix services/planner install
```

### Configure the app in `.env.local`

Update `.env.local` with app-side values like these:

```env
NEXT_PUBLIC_BASE_URL=http://localhost:3000
VILLAGESIM_STATE_MODE=mock
VILLAGESIM_PLANNER_MOCK=false
VILLAGESIM_PLANNER_SERVICE_URL=http://localhost:4000/plan
VILLAGESIM_PLANNER_SERVICE_TOKEN=replace-with-shared-token
VILLAGESIM_PLANNER_SERVICE_SIGNING_SECRET=replace-with-shared-signing-secret
VILLAGESIM_PLANNER_SERVICE_TIMEOUT_MS=60000
```

Optional app-side tuning:

- `VILLAGESIM_PLANNER_BUDGET_PER_TICK`
- `VILLAGESIM_PLANNER_DRAIN_PER_DISPATCH`

### Configure the planner service environment

The planner service auto-loads repo-root `.env` and `.env.local` when started from this workspace. Shell exports still win if you want to override values manually.

The simplest local pattern is still:

```bash
set -a
source .env.local
set +a
npm run planner:service:dev
```

If you prefer, you can also export only the planner-service variables manually before starting the service.

Minimum service-side variables:

```env
VILLAGESIM_PLANNER_SERVICE_TOKEN=replace-with-shared-token
VILLAGESIM_PLANNER_SERVICE_SIGNING_SECRET=replace-with-shared-signing-secret
VILLAGESIM_PLANNER_SERVICE_PORT=4000
VILLAGESIM_PLANNER_SERVICE_PROVIDER=mock
```

Useful optional service-side variables:

- `VILLAGESIM_PLANNER_SERVICE_HOST` defaults to `0.0.0.0`
- `VILLAGESIM_PLANNER_SERVICE_MAX_BODY_BYTES` defaults to `16384`
- `VILLAGESIM_PLANNER_SERVICE_RATE_LIMIT_MAX` defaults to `30`
- `VILLAGESIM_PLANNER_SERVICE_RATE_LIMIT_WINDOW_MS` defaults to `60000`
- `VILLAGESIM_PLANNER_SERVICE_REPLAY_WINDOW_MS` defaults to `300000`

If you switch the service provider to Copilot, also set:

- `VILLAGESIM_PLANNER_SERVICE_PROVIDER=copilot`
- `VILLAGESIM_PLANNER_COPILOT_MODEL`
- `VILLAGESIM_PLANNER_COPILOT_TIMEOUT_MS`
- optionally `VILLAGESIM_PLANNER_COPILOT_CLI_PATH`
- optionally `VILLAGESIM_PLANNER_COPILOT_CLI_URL`
- optionally `VILLAGESIM_PLANNER_COPILOT_CONFIG_DIR`
- optionally `VILLAGESIM_PLANNER_COPILOT_WORKING_DIRECTORY`
- optionally `VILLAGESIM_PLANNER_COPILOT_REASONING_EFFORT`
- optionally `VILLAGESIM_PLANNER_COPILOT_LOG_LEVEL`

### Run and verify

In one terminal:

```bash
set -a
source .env.local
set +a
npm run planner:service:dev
```

In a second terminal:

```bash
npm run dev
```

Checks:

```bash
curl http://localhost:4000/healthz
```

Expected result:

```json
{"status":"ok","service":"villagesim-planner"}
```

Then load `http://localhost:3000/town/demo-town` and exercise a tick.

## 3. Private alpha: Vercel + Convex + Tailscale Funnel

Use this for the current hosted operating model described in the architecture docs.

### App deployment surface

Set these in Vercel for the Next.js app:

```env
NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app
NEXT_PUBLIC_DEFAULT_TOWN_ID=demo-town

GITHUB_CLIENT_ID=github-oauth-client-id
GITHUB_CLIENT_SECRET=github-oauth-client-secret
APPROVED_GITHUB_LOGINS=comma,separated,github,logins

SESSION_SECRET=strong-random-secret

VILLAGESIM_STATE_MODE=convex
CONVEX_URL=https://your-convex-deployment.convex.cloud
CONVEX_ADMIN_KEY=your-convex-admin-key

VILLAGESIM_PLANNER_MOCK=false
VILLAGESIM_PLANNER_SERVICE_URL=https://your-funnel-domain.example/plan
VILLAGESIM_PLANNER_SERVICE_TOKEN=shared-token-with-service
VILLAGESIM_PLANNER_SERVICE_SIGNING_SECRET=shared-signing-secret
VILLAGESIM_PLANNER_SERVICE_TIMEOUT_MS=60000

VILLAGESIM_PLANNER_BUDGET_PER_TICK=2
VILLAGESIM_PLANNER_DRAIN_PER_DISPATCH=4
```

Notes:

- `APPROVED_GITHUB_LOGINS` is the approval gate for hosted sign-in.
- `SESSION_SECRET` should be a strong random value in hosted environments.
- `CONVEX_URL` and `CONVEX_ADMIN_KEY` are required when `VILLAGESIM_STATE_MODE=convex`.
- The planner URL must be the externally reachable HTTPS Funnel URL, not `localhost`.

### Planner service host

Run the planner service on the machine that will sit behind Tailscale Funnel.

Set these on that machine:

```env
VILLAGESIM_PLANNER_SERVICE_TOKEN=shared-token-with-app
VILLAGESIM_PLANNER_SERVICE_SIGNING_SECRET=shared-signing-secret
VILLAGESIM_PLANNER_SERVICE_PORT=4000
VILLAGESIM_PLANNER_SERVICE_HOST=0.0.0.0
VILLAGESIM_PLANNER_SERVICE_PROVIDER=mock
```

If using the Copilot-backed runtime there, switch to:

```env
VILLAGESIM_PLANNER_SERVICE_PROVIDER=copilot
VILLAGESIM_PLANNER_COPILOT_MODEL=gpt-5-mini
VILLAGESIM_PLANNER_COPILOT_TIMEOUT_MS=60000
```

Then add any CLI path, config dir, or working-directory overrides that your machine needs.

### Tailscale Funnel

Expose the planner service host's port `4000` through an HTTPS Funnel and point `VILLAGESIM_PLANNER_SERVICE_URL` at the resulting public `/plan` endpoint.

Before updating Vercel, verify from outside the planner host:

```bash
curl https://your-funnel-domain.example/healthz
```

The health endpoint is intentionally unauthenticated so you can validate reachability without app secrets.

## GitHub OAuth setup

If you want hosted sign-in locally or on Vercel:

1. Create a GitHub OAuth app.
2. Set the homepage URL to your app base URL.
3. Set the callback URL to:

   - local: `http://localhost:3000/api/auth/callback`
   - hosted: `https://your-app.vercel.app/api/auth/callback`

4. Put the resulting `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the app environment.
5. Add your GitHub login to `APPROVED_GITHUB_LOGINS` before testing.

## Environment variable reference

### App-side variables

- `NEXT_PUBLIC_BASE_URL`: app origin used by auth routes and redirects.
- `NEXT_PUBLIC_DEFAULT_TOWN_ID`: starter default town id, usually `demo-town`.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: required for hosted GitHub OAuth.
- `APPROVED_GITHUB_LOGINS`: comma-separated allowlist for private-alpha hosted sign-in.
- `SESSION_SECRET`: signs the `__vs_session` cookie. A weak fallback exists for local development only.
- `VILLAGESIM_STATE_MODE`: `mock` or `convex`.
- `CONVEX_URL`: required in Convex hosted mode.
- `CONVEX_ADMIN_KEY`: required in Convex hosted mode for authoritative reads and writes.
- `VILLAGESIM_PLANNER_MOCK`: leave `true` for local mock mode; set `false` to enable planner-service calls.
- `VILLAGESIM_PLANNER_SERVICE_URL`: app-side planner endpoint URL.
- `VILLAGESIM_PLANNER_SERVICE_TOKEN`: shared bearer token for planner requests.
- `VILLAGESIM_PLANNER_SERVICE_SIGNING_SECRET`: shared HMAC secret for planner request signatures.
- `VILLAGESIM_PLANNER_SERVICE_TIMEOUT_MS`: request timeout before mock fallback. 60000ms is a good starting point for the Copilot-backed local planner service.
- `VILLAGESIM_PLANNER_BUDGET_PER_TICK`: hosted queue budget per tick.
- `VILLAGESIM_PLANNER_DRAIN_PER_DISPATCH`: number of queued planner items to drain per dispatch run.

### Planner-service variables

- `VILLAGESIM_PLANNER_SERVICE_HOST`: bind host, default `0.0.0.0`.
- `VILLAGESIM_PLANNER_SERVICE_PORT`: bind port, default `4000`.
- `VILLAGESIM_PLANNER_SERVICE_MAX_BODY_BYTES`: maximum accepted request body.
- `VILLAGESIM_PLANNER_SERVICE_RATE_LIMIT_MAX`: max requests per rate-limit window.
- `VILLAGESIM_PLANNER_SERVICE_RATE_LIMIT_WINDOW_MS`: rate-limit window length.
- `VILLAGESIM_PLANNER_SERVICE_REPLAY_WINDOW_MS`: freshness window for signed request timestamps.
- `VILLAGESIM_PLANNER_SERVICE_PROVIDER`: `mock` or `copilot`.
- `VILLAGESIM_PLANNER_COPILOT_MODEL`: Copilot runtime model name.
- `VILLAGESIM_PLANNER_COPILOT_TIMEOUT_MS`: Copilot runtime timeout. 60000ms is a sensible local default.
- `VILLAGESIM_PLANNER_COPILOT_CLI_PATH`: optional CLI binary override.
- `VILLAGESIM_PLANNER_COPILOT_CLI_URL`: optional remote CLI server URL.
- `VILLAGESIM_PLANNER_COPILOT_CONFIG_DIR`: optional Copilot config directory override.
- `VILLAGESIM_PLANNER_COPILOT_WORKING_DIRECTORY`: working directory used for Copilot sessions.
- `VILLAGESIM_PLANNER_COPILOT_REASONING_EFFORT`: optional `low|medium|high|xhigh`.
- `VILLAGESIM_PLANNER_COPILOT_LOG_LEVEL`: optional Copilot SDK log level.

## Rollout validation checklist

- [ ] `npm run dev` starts successfully in local mock mode.
- [ ] `http://localhost:3000/town/demo-town` loads and `npm run tick:mock -- --town demo-town --count 1` succeeds.
- [ ] The planner service returns `200` from `/healthz`.
- [ ] With `VILLAGESIM_PLANNER_MOCK=false`, the app can reach the planner service and continue ticking.
- [ ] With the planner service stopped, planner requests fall back to deterministic mock behavior instead of breaking ticks.
- [ ] GitHub OAuth succeeds for a login listed in `APPROVED_GITHUB_LOGINS`.
- [ ] GitHub OAuth redirects back to `/?auth_error=not_approved` for a login not on the allowlist.
- [ ] In hosted mode, Convex-backed town reads and writes succeed with `VILLAGESIM_STATE_MODE=convex`.
- [ ] In hosted mode, planner queue work is created during a tick and drains after the response.
- [ ] The hosted app points at the Funnel HTTPS `/plan` endpoint, not a local-only address.

## Failure modes and fallback behavior

| Condition | What happens |
| --- | --- |
| `GITHUB_CLIENT_ID` or `GITHUB_CLIENT_SECRET` missing | `/api/auth/start` cannot begin OAuth; hosted sign-in stays unavailable. |
| GitHub user not listed in `APPROVED_GITHUB_LOGINS` | OAuth callback redirects to `/?auth_error=not_approved` before town creation or session issuance. |
| `SESSION_SECRET` missing in local development | The app logs a warning and falls back to an insecure dev secret. Do not rely on this in hosted environments. |
| `VILLAGESIM_STATE_MODE=convex` without `CONVEX_URL` or `CONVEX_ADMIN_KEY` | Hosted town access fails with a clear configuration error. |
| Planner service unreachable, times out, or returns a non-success transport error | The app falls back to the deterministic mock planner with `remote_failure`. |
| Planner service returns transient `408/502/503/504` | The app retries once, then falls back to the mock planner if it still fails. |
| Planner service receives a bad bearer token or signature | The service rejects the request and the app falls back safely instead of failing the tick. |
| Planner service receives a stale timestamp or replayed request | The service rejects it with freshness or replay protection errors. |
| Hosted planner queue dispatch fails after the tick response | The app retries direct dispatch after internal dispatch-trigger failure and logs the error if dispatch still fails. |

## Current source-of-truth files

- `README.md` for the quickstart and repo overview
- `.env.example` for the current env surface
- `docs/ARCHITECTURE/technicaldecisions/007-github-oauth-and-session-strategy.md`
- `docs/ARCHITECTURE/technicaldecisions/010-queue-hosted-planner-execution-and-budget-it.md`
- `docs/ARCHITECTURE/technicaldecisions/011-use-a-private-planner-service-for-hosted-execution.md`
