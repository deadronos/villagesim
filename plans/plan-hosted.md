# Hosted plan: GitHub-auth VillageSim with GitHub Models, Convex, and Next.js App Router

## Summary

This plan moves VillageSim from the current local-first starter to a hosted architecture with:

- GitHub OAuth for player identity
- optional user-provided GitHub PAT for planner access
- encrypted server-side PAT storage
- Next.js App Router for the hosted path
- bleeding-edge Convex as authoritative state
- GitHub Models as the first real NPC planner provider
- hybrid planner execution: inline for local/dev, queued for hosted

The current ADRs and codebase already give us strong seams for this:

- `lib/npc_decision.ts` keeps cheap local decision-making narrow and predictable
- `lib/model_proxy.ts` is the natural planner-provider adapter seam
- `lib/sim_engine.ts` is the shared simulation core and should remain the center of gravity
- the existing planner contract is already zod-validated and JSON-safe

## Key architectural decisions

### 1. Keep identity and planner authorization separate

GitHub sign-in should establish app identity and session ownership.

GitHub Models access should be authorized separately via a supported credential path, initially a user-provided PAT with `models` access, persisted only in encrypted server-side storage.

A PAT must not become the app's primary login mechanism.

### 2. Migrate to App Router as part of the hosted effort

The current app uses the Pages Router, but for the hosted/authenticated build we will migrate to App Router and move route surfaces incrementally:

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

### 4. Move persistence/orchestration to Convex without rewriting simulation rules

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
- session-based app identity in Next.js
- Convex auth bridge for reactive authenticated data access
- optional planner token management UI for PAT connect/revoke/test

### Planner

- `lib/model_proxy.ts` becomes a provider-backed adapter
- providers:
  - `mock`
  - `githubModels`
- GitHub Models is used server-side only
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

Add GitHub sign-in and stable user identity/session ownership.

### Phase 2 scope

- implement GitHub OAuth sign-in flow
- establish session handling in Next.js
- seed or reopen a town from the authenticated GitHub profile
- define the Convex-facing auth bridge strategy for authenticated reads/writes

### Phase 2 deliverables

- sign-in and sign-out flow
- authenticated session model
- profile-seeded town ownership flow

### Phase 2 exit criteria

- a signed-in user can open their hosted town
- town ownership is associated with authenticated app identity
- PATs are not required for login

## Phase 3 — PAT vault and GitHub Models planner provider

### Phase 3 goal

Allow users to opt into real NPC planning via GitHub Models.

### Phase 3 scope

- add optional PAT connect flow
- validate PATs for model access before storing
- encrypt PATs server-side
- refactor `lib/model_proxy.ts` to support providers
- implement GitHub Models provider with deterministic structured JSON output
- preserve zod validation and deterministic fallback behavior

### Phase 3 deliverables

- planner settings/connect UI
- encrypted PAT storage path
- `githubModels` planner provider
- planner diagnostics and fallback reasons

### Phase 3 exit criteria

- a connected user PAT can authorize NPC planner calls
- invalid/missing/rate-limited planner access fails safely
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
- planner settings/token-management route(s)
- `prompts/npc-planner.prompt.yml`
- `prompts/npc-planner-evals.prompt.yml`
- new ADR(s) under `docs/ARCHITECTURE/technicaldecisions/`

## Validation checklist

- App Router parity for current routes
- GitHub sign-in works end to end
- hosted town ownership is tied to authenticated user identity
- PATs are encrypted server-side and never exposed after submission
- GitHub Models planner responses still pass zod validation
- planner failures degrade safely to mock or deterministic fallback behavior
- Convex becomes authoritative in hosted mode
- hosted planner execution is budgeted and observable
- `npm run lint` and `npm run build` still pass after each phase

## Issue structure

The GitHub issue structure for this plan should be:

- umbrella issue: Hosted VillageSim plan
- phase issue 1: Architecture and App Router foundation
- phase issue 2: GitHub auth and hosted identity
- phase issue 3: PAT vault and GitHub Models planner provider
- phase issue 4: Convex authoritative state and hosted execution
- phase issue 5: Planner execution hardening, budgets, and evaluations

Each phase issue should be linked under the umbrella as a sub-issue.
