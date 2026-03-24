# ADR 006: Use the App Router as the Hosted Foundation

## Title
Use the Next.js App Router for hosted route surfaces while keeping the shared simulation core in `lib/`

## Status
Accepted

## Context
`plans/plan-hosted.md` sets Phase 1 as the hosted foundation milestone: add ADR coverage for the hosted direction, migrate `/`, `/town/[id]`, and `/api/tick` from `pages/` to `app/`, and keep `lib/sim_engine.ts`, `lib/npc_decision.ts`, `lib/model_proxy.ts`, and `lib/types.ts` as the shared domain core.

The current app already has strong seams for this migration:

- `lib/mockData.ts` seeds JSON-safe local town state that can be read in a server component.
- `lib/sim_engine.ts` advances ticks for the API route and worker entrypoints.
- `components/Town.tsx` and `components/TownCanvas.tsx` render the current town experience without depending on Pages Router APIs.
- `plans/plan-hosted.md` already identifies `app/page.tsx`, `app/town/[id]/page.tsx`, and `app/api/tick/route.ts` as the Phase 1 route targets.

## Decision
Use the Next.js App Router as the current route foundation for the starter:

- `app/layout.tsx` owns global document structure and global CSS.
- `app/page.tsx` replaces the starter home page surface.
- `app/town/[id]/page.tsx` seeds the initial town state on the server and hands it to a client component for polling and interaction.
- `app/api/tick/route.ts` replaces the Pages API handler with a thin route adapter around `runLocalMockTick`.

Keep the routing migration limited to the route surfaces and presentation helpers. Do not duplicate or rewrite simulation, planner, or state-model logic that already lives in `lib/`.

## Consequences
- The codebase now matches the hosted plan's Phase 1 routing direction and can layer App Router auth/session work on top of the existing town flow.
- Route-level server rendering and client interactivity are separated cleanly without changing the underlying simulation rules.
- JSON-safe town state remains suitable for server-component props, API responses, worker output, and future hosted backends.
- Future route additions for auth, planner settings, and hosted orchestration should follow App Router conventions while continuing to call the shared domain helpers in `lib/`.
