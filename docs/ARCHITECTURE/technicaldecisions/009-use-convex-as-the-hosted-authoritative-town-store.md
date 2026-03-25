# ADR 009: Convex as the Hosted Authoritative Town Store

## Title

Use Convex as the authoritative hosted town store while preserving local mock mode

## Status

Accepted

## Context

ADR 003 intentionally used `lib/mockData.ts` as a temporary authoritative store so the starter could run before hosted infrastructure existed. Phase 4 now requires hosted towns, NPC state, plans, and events to persist in Convex while the shared simulation rules remain centralized in `lib/`.

The Next.js town page, auth callback, and tick route still need a local development path, and the Convex-side functions should stay thin adapters over the shared town shape and simulation helpers.

## Decision

Introduce a small authoritative-store adapter in `lib/authoritativeTownStore.ts` that selects between:

- local mock persistence through `lib/mockData.ts` when `VILLAGESIM_STATE_MODE=mock`
- hosted Convex persistence through internal Convex queries and mutations when `VILLAGESIM_STATE_MODE=convex`

Store the full JSON-safe `TownState` in Convex so that hosted towns, NPC state, plans, and events move out of the in-memory process store without rewriting the shared simulation engine. Keep access control user-scoped by passing the session login into Convex reads and writes and validating ownership inside the Convex adapters.

## Consequences

- Hosted execution no longer depends on the in-memory `localTownStore` as its authority.
- Local development keeps the fast seeded mock path without requiring a Convex deployment.
- Simulation rules stay centralized in `lib/sim_engine.ts`; Convex and Next.js remain thin storage/runtime adapters.
- Hosted reads and writes require configured `CONVEX_URL` and `CONVEX_ADMIN_KEY` values when `VILLAGESIM_STATE_MODE=convex`.
