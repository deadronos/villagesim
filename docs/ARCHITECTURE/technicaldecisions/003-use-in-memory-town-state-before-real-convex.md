# ADR 003: In-Memory Mock Town State Before Real Convex Integration

## Title
Use in-memory mock town state as the temporary authoritative store before real Convex integration

## Status
Accepted

## Context
`README.md` describes the project as a local-first starter that should work before real Convex, OAuth, or model infrastructure exists. `lib/mockData.ts` implements a process-local `Map<string, TownState>` named `localTownStore` and exposes helpers such as `ensureLocalMockTownState`, `getLocalMockTownState`, `setLocalMockTownState`, and `resetLocalMockTown`.

The API route, town page, worker helpers, and Convex-style stubs all read or write town state through that mock store. The Convex files explicitly call themselves local-first stubs and placeholder integrations for later wiring.

## Decision
Treat the in-memory mock store in `lib/mockData.ts` as the current authoritative town state for the starter.

Seed towns deterministically from an ID and seed value, allow resetting them locally, and defer persistent multi-user storage to a later Convex-backed implementation.

## Consequences
- The starter is fully runnable without provisioning Convex or any other external data service.
- Local development can reset and reseed towns quickly, which makes iteration easier for UI and simulation work.
- State is only authoritative within the current Node.js process, so it is lost on restart and is not suitable for distributed or multi-instance deployment.
- Future Convex integration should preserve the same town shape and helper boundaries so that the storage layer can change without rewriting the simulation rules.
