# Hosted plan: GitHub-auth VillageSim with a private planner service, Convex, and Next.js App Router

## Summary

This plan moves VillageSim from the current local-first starter to a hosted architecture with:

- GitHub OAuth for player identity
- signed-cookie sessions remaining in Next.js for hosted identity
- env-based GitHub login approval for the first hosted rollout
- Next.js App Router for the hosted path
- bleeding-edge Convex as authoritative state
- a private planner service as the first hosted planner boundary
- Copilot-backed execution living behind that service
- hybrid planner execution: inline for local/dev, queued for hosted

The first hosted planner service should be easy to run locally in Docker, callable from local development over `localhost`, and callable from Vercel server-side code in private alpha via a Tailscale Funnel URL.

The current ADRs and codebase already give us strong seams for this:

- `lib/npc_decision.ts` keeps cheap local decision-making narrow and predictable
- `lib/model_proxy.ts` is the natural planner-provider adapter seam
- `lib/sim_engine.ts` is the shared simulation core and should remain the center of gravity
- the existing planner contract is already zod-validated and JSON-safe

## Key architectural decisions

### 1. Keep the current auth model and add manual approval

GitHub sign-in should establish app identity and session ownership.

For now, VillageSim should keep the existing GitHub OAuth + signed-cookie session implementation rather than migrating auth platforms.

The first hosted rollout should remain intentionally private by approving only a small allowlist of GitHub logins via env/configuration.

Planner authorization material must remain server-side and must not be serialized into `__vs_session` or other client-visible payloads.

### 2. Migrate to App Router as part of the hosted effort

Phase 1 migrates the route surfaces to App Router while keeping the hosted/authenticated work incremental:

- `pages/index.tsx` -> `app/page.tsx`
- `pages/town/[id].tsx` -> `app/town/[id]/page.tsx`
- `pages/api/tick.ts` -> `app/api/tick/route.ts`

The domain logic in `lib/` should not be rewritten during this migration.

### 3. Preserve the hybrid decision model

We should keep the existing design from the architecture docs:

- most NPC behavior remains local, deterministic, and cheap
- only `plan_required` decisions escalate to a model-backed planner
- planner results remain compact structured JSON validated with zod
- planner failures must always degrade safely to deterministic fallback behavior

### 4. Put a private planner service between the app and Copilot-backed execution

The Next.js app should call a planner service from server-side code only.

- local development may call the planner service over `localhost`
- hosted Vercel code may call the planner service over a Tailscale Funnel URL during private alpha
- browsers should not call the planner service directly
- the planner service should require a bearer token plus HMAC request signing
- the planner service should return strict planner JSON only

Copilot SDK and/or Copilot CLI server mode can live behind this service boundary without coupling the app to one runtime transport.

### 5. Move persistence/orchestration to Convex without rewriting simulation rules

The engine should still live in shared helpers under `lib/`.

Convex should become the authoritative storage and orchestration boundary for:

- town state
- NPC state
- plans
- events
- ownership/access control

## Target architecture

### Frontend

- Next.js App Router
- React 19+
- current village UI and route flow migrated from `pages/` to `app/`
- town experience remains focused on seeded simulation plus live updates

### Auth

- GitHub OAuth for sign-in
- session-based app identity in Next.js via the current signed-cookie flow
- env-based GitHub login allowlist for the first hosted rollout
- Convex auth bridge for reactive authenticated data access
- optional lightweight planner status UI if the hosted path needs user-visible diagnostics

### Planner

- `lib/model_proxy.ts` becomes a provider-backed adapter
- providers:
  - `mock`
  - `privateService`
- the first hosted planner boundary is a small private planner service
- the planner service can run locally in Docker and expose a private-alpha ingress through Tailscale Funnel
- Copilot-backed execution is isolated behind the planner service
- rate limiting, request signing, replay protection, and timeout handling are part of the hosted rollout design
- planner output remains bound to the current structured `NpcPlan` schema

### State and execution

- Convex becomes authoritative for hosted mode
- local mock store remains available for local-first fallback/dev loops
- local/dev planner execution can stay inline for low-volume testing
- hosted planner execution should use a queued/background path with budgets and rate limits

## Phases

## Phase 1 — Architecture and route migration foundation

### Phase 1 goal

Create the hosted foundation without changing the core simulation model.

### Phase 1 scope

- add a new ADR documenting the hosted direction
- migrate route surfaces from `pages/` to `app/`
- preserve existing behavior and JSON-safe state boundaries
- keep `lib/sim_engine.ts`, `lib/npc_decision.ts`, `lib/model_proxy.ts`, and `lib/types.ts` as the shared domain core

### Phase 1 deliverables

- App Router parity for home, town, and tick route surfaces
- clear hosted ADR(s)
- no regression in local starter behavior

### Phase 1 exit criteria

- the app runs on App Router
- current town rendering/tick flow still works
- no domain logic duplication was introduced during migration

## Phase 2 — GitHub auth and hosted user identity

### Phase 2 goal

Keep GitHub sign-in stable and harden hosted identity/session ownership for a private rollout.

### Phase 2 scope

- keep the current GitHub OAuth sign-in flow and signed-cookie session model
- add env-based manual approval for allowed GitHub logins
- seed or reopen a town from the authenticated approved GitHub profile
- define the Convex-facing auth bridge strategy for authenticated reads/writes

### Phase 2 deliverables

- sign-in and sign-out flow
- authenticated session model
- manual approval gate for early hosted users
- profile-seeded town ownership flow

### Phase 2 exit criteria

- an approved signed-in user can open their hosted town
- town ownership is associated with authenticated app identity
- no separate planner connect step is required for player login

## Phase 3 — Private planner service and hosted planner transport

### Phase 3 goal

Introduce a private planner-service boundary for real hosted NPC planning.

### Phase 3 scope

- add a small planner service that can run locally in Docker
- keep planner authorization material out of the signed session cookie
- call the planner service only from server-side Next.js code
- sign requests with shared-secret authentication and HMAC integrity metadata
- refactor `lib/model_proxy.ts` to support providers
- implement a `privateService` provider with deterministic structured JSON output
- keep Copilot-backed execution behind the planner service boundary
- preserve zod validation and deterministic fallback behavior
- document timeout, replay, rate-limit, and Tailscale Funnel handling for the hosted planner path

### Phase 3 deliverables

- private planner-service API contract
- `privateService` planner provider
- planner diagnostics and fallback reasons
- optional local planner-service runtime using Copilot SDK or Copilot CLI server mode

### Phase 3 exit criteria

- hosted planner calls flow server-to-server through the private planner service
- missing service auth, stale signatures, provider failure, or planner unavailability all fail safely
- planner output still satisfies the shared schema

## Phase 4 — Convex authoritative state and hosted execution

### Phase 4 goal

Replace the in-memory mock store as the hosted authority while preserving the shared simulation engine.

### Phase 4 scope

- move hosted town/NPC/plan/event persistence into Convex
- keep the simulation engine reusable from Next.js, workers, and Convex adapters
- introduce access control for user-owned hosted towns
- maintain local mock mode for local development where useful

### Phase 4 deliverables

- hosted towns backed by Convex
- user-scoped reads/writes
- event and plan persistence in Convex

### Phase 4 exit criteria

- hosted mode no longer depends on the in-memory store as authority
- authenticated town access is user-scoped
- shared engine rules remain centralized in `lib/`

## Phase 5 — Hybrid planner execution, budgets, and rollout hardening

### Phase 5 goal

Make planner execution production-safe on hosted infrastructure.

### Phase 5 scope

- keep inline planner calls for local/dev mode
- use queued/background planner execution for hosted mode
- add planner request budgets per town/tick
- add observability for planner source, latency, failures, and fallback behavior
- add prompt assets and evaluation files for planner iteration

### Phase 5 deliverables

- hosted background planner path
- budget/rate-limit strategy
- planner telemetry
- prompt/eval assets in-repo

### Phase 5 exit criteria

- hosted ticks do not block on uncontrolled inference latency
- planner usage is bounded and observable
- prompt changes can be evaluated reproducibly

## File focus

### Existing files to adapt

- `lib/model_proxy.ts`
- `lib/prompt_templates.ts`
- `lib/npc_decision.ts`
- `lib/sim_engine.ts`
- `lib/types.ts`
- `lib/mockData.ts`
- `app/api/auth/callback/route.ts`
- `components/Login.tsx`
- `components/Town.tsx`
- `convex/functions/createTownForUser.ts`
- `workers/worker_helpers.ts`
- `workers/tick.ts`
- `.env.example`

### Likely new files

- `app/layout.tsx`
- `app/page.tsx`
- `app/town/[id]/page.tsx`
- `app/api/tick/route.ts`
- hosted auth route handlers
- planner signing/request helpers
- optional approval helper
- `services/planner/` runtime files
- `prompts/npc-planner.prompt.yml`
- `prompts/npc-planner-evals.prompt.yml`
- new ADR(s) under `docs/ARCHITECTURE/technicaldecisions/`

## Validation checklist

- App Router parity for current routes
- GitHub sign-in works end to end
- unapproved GitHub logins are blocked from hosted access
- hosted town ownership is tied to authenticated user identity
- planner authorization material remains server-side and never appears in the session cookie
- planner-service responses still pass zod validation
- hosted planner requests are server-to-server only and signed
- planner failures degrade safely to mock or deterministic fallback behavior
- Convex becomes authoritative in hosted mode
- hosted planner execution is budgeted and observable
- `npm run lint` and `npm run build` still pass after each phase

## Issue structure

The GitHub issue structure for this plan should be:

- umbrella issue: Hosted VillageSim plan
- phase issue 1: Architecture and App Router foundation
- phase issue 2: GitHub auth and hosted identity
- phase issue 3: Copilot SDK planner integration and hosted planner auth
- phase issue 4: Convex authoritative state and hosted execution
- phase issue 5: Planner execution hardening, budgets, and evaluations

Each phase issue should be linked under the umbrella as a sub-issue.
