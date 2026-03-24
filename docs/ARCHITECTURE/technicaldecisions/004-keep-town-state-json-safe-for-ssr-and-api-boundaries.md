# ADR 004: JSON-Safe Town State for SSR and API Boundaries

## Title
Keep town state JSON-safe for SSR and API boundaries

## Status
Accepted

## Context
The town state crosses multiple serialization boundaries:
- `pages/town/[id].tsx` returns `TownState` from `getServerSideProps`.
- `pages/api/tick.ts` returns `TownState`, summaries, and event slices as JSON.
- `workers/tick.ts` prints JSON output for local worker runs.

The mock data layer reinforces this by cloning state through JSON serialization in `cloneJsonValue` and `cloneTownState`. The type model in `lib/types.ts` uses plain objects, arrays, strings, numbers, booleans, and nullable fields. Time values such as `town.now` and `event.at` are stored as epoch numbers instead of `Date` objects, and the mock store keeps towns in a `Map` internally but returns cloned plain objects externally.

## Decision
Keep `TownState`, planner payloads, and related API-visible objects JSON-serializable by design.

Use plain data structures for state exchanged across SSR, API, worker, and future backend boundaries, and normalize internal state through JSON-safe cloning before returning it.

## Consequences
- Server-rendered pages and API responses can safely serialize the same town shape without custom serializers.
- The project avoids subtle Next.js serialization failures caused by non-serializable values such as `Date`, class instances, or functions inside returned state.
- Internal helpers can use richer runtime constructs like `Map` for storage, but data exposed outside that storage layer must be reduced to plain JSON-compatible structures.
- Changes to shared state types should continue to respect these serialization constraints, especially for anything returned from `getServerSideProps` or `/api/tick`.
