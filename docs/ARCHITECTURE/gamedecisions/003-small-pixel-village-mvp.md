# ADR 003: Small Pixel-Village MVP

## Title
Small pixel-village MVP with a handful of villagers and readable state summaries

## Status
Accepted

## Context
`idea.md` sets the starter goal as a small 2D pixel-art village simulation and frames the weekend MVP around a simple tiled map and only a few NPC sprites. The README keeps that same scope: a demo route that renders a seeded village and NPC roster before larger infrastructure is wired in.

The current code intentionally stays small:

- `lib/mockData.ts` seeds five named villagers with fixed roles.
- `components/TownCanvas.tsx` draws a simple canvas map with tile colors and tiny NPC sprites.
- `components/Town.tsx` emphasizes summaries: activity cards, aggregate bars, an activity feed, and a roster with short per-NPC text.
- `app/town/[id]/townPresentation.ts` generates human-readable labels such as weather, time-of-day, current action, mood, and short summaries.

## Decision
Keep the playable/demo scope deliberately small and legible:

- a tiny rendered village,
- a handful of villagers,
- summary-first UI over simulation depth,
- readable text descriptions alongside the map so state changes are obvious.

## Consequences
- The simulation is easy to inspect, explain, and iterate on during early development.
- Emergent behavior can be judged from a simple UI without needing animation-heavy systems first.
- The current architecture optimizes for clarity over scale, so it does not yet target large populations, detailed pathfinding, or rich visual simulation.
