# ADR 002: Local-First Seeded Demo Town

## Title

Local-first seeded demo town as the default onboarding and gameplay path

## Status

Accepted

## Context

The README positions VillageSim as a local-first starter with a runnable Next.js UI, mock authoritative town state, a mock planner, and a local `/api/tick` endpoint. It explicitly tells first-time users to keep `VILLAGESIM_PLANNER_MOCK=true` and visit `/town/demo-town`.

`lib/mockData.ts` defines `DEFAULT_MOCK_TOWN_ID = "demo-town"` and builds seeded in-memory town state with deterministic randomization from a seed. The App Router town route under `app/town/[id]/` reads from `ensureLocalMockTownState`, polls the local tick API, and describes the route as a shared local-first backend mock. The same route also notes that GitHub OAuth is still a placeholder.

This repo still contains Convex-style and OAuth-oriented scaffolding, but the working path today is the seeded local town.

## Decision

Make the default experience a seeded local town that runs entirely from mock state and the local simulation loop:

- start locally,
- open `/town/demo-town`,
- advance the town through local ticks,
- keep planner calls mocked unless a real hosted provider path such as Copilot SDK is intentionally wired in.

## Consequences

- The project is runnable and reviewable without external services.
- Onboarding is fast because the first useful experience is already present in the repo.
- Town behavior is reproducible from a seed, which helps debugging and demo stability.
- State is intentionally temporary and local-first for now, so persistence, realtime sync, and auth-seeded towns remain later integration work.
