# ADR 002: Shared Simulation Engine Across Runtime Entrypoints

## Title
Share the simulation engine across API, worker, and Convex-style entrypoints

## Status
Accepted

## Context
The simulation logic is centralized in `lib/sim_engine.ts`, which exposes helpers such as `runLocalMockTick`, `runSimulationTick`, `collectNpcsNeedingDecision`, `applyNpcActionToTown`, and `assignPlanToTown`.

Multiple runtime surfaces already delegate to that shared logic:
- `app/api/tick/route.ts` advances town state by calling `runLocalMockTick`.
- `workers/worker_helpers.ts` exposes worker-friendly helpers that reuse `runLocalMockTick`, `collectNpcsNeedingDecision`, `applyNpcActionToTown`, and `assignPlanToTown`.
- The Convex-style stubs in `convex/functions/*.ts` and `convex/queries/*.ts` call the same mock data and simulation helpers instead of defining separate behavior.

## Decision
Keep simulation rules in `lib/` as reusable domain helpers and make each runtime entrypoint a thin adapter around those shared functions.

Do not duplicate tick, planning, action, or decision logic inside API handlers, worker scripts, or Convex-style wrapper functions.

## Consequences
- The tick API, local worker script, and future Convex integration all execute the same behavior for plans, actions, and events.
- Bug fixes or rule changes in the engine automatically propagate to every runtime surface that reuses the shared helpers.
- Adapters stay small and easier to replace when the project moves from mock-local execution to a real backend.
- The shared engine becomes the main architectural seam, so future integrations should continue calling into `lib/sim_engine.ts` rather than reimplementing simulation behavior.
