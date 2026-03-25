# Architecture Decisions

This folder captures the decisions that shape the current VillageSim starter.

The ADRs are split into two categories:

- `gamedecisions/` for choices about simulation behavior, scope, and player-facing game structure
- `technicaldecisions/` for choices about runtime architecture, storage boundaries, framework setup, and integration patterns

Each ADR uses a numbered filename such as `001-description.md` so new decisions can be appended over time without renaming earlier records.

## Game decisions

- `gamedecisions/001-hybrid-npc-decision-making.md`
- `gamedecisions/002-local-first-seeded-demo-town.md`
- `gamedecisions/003-small-pixel-village-mvp.md`
- `gamedecisions/004-structured-npc-state.md`

## Technical decisions

- `technicaldecisions/001-nextjs-pages-router-local-first-starter.md`
- `technicaldecisions/002-share-the-simulation-engine-across-runtime-entrypoints.md`
- `technicaldecisions/003-use-in-memory-town-state-before-real-convex.md`
- `technicaldecisions/004-keep-town-state-json-safe-for-ssr-and-api-boundaries.md`
- `technicaldecisions/005-use-a-mock-planner-with-zod-validated-structured-payloads.md`
- `technicaldecisions/006-use-the-app-router-as-the-hosted-foundation.md`
- `technicaldecisions/007-github-oauth-and-session-strategy.md`
- `technicaldecisions/008-use-copilot-sdk-as-the-first-hosted-planner-runtime.md`
- `technicaldecisions/009-use-convex-as-the-hosted-authoritative-town-store.md`
- `technicaldecisions/010-queue-hosted-planner-execution-and-budget-it.md`
