# ADR 004: Structured NPC State

## Title
Represent NPCs with needs, inventory, memory, roles, actions, and plans

## Status
Accepted

## Context
`lib/types.ts` defines `NpcState` as a compact state document containing role, home/work references, position, need values, inventory, short memory, last decision tick, current action, and current plan.

That structure is used directly by the simulation:

- `lib/mockData.ts` seeds villagers with role-specific starting summaries and inventories.
- `lib/npc_decision.ts` uses needs, role multipliers, inventory, and nearby context to score choices.
- `lib/sim_engine.ts` updates needs and inventory as actions complete and keeps a shallow recent-memory summary for each NPC.
- `lib/mockData.ts` also derives a local environment slice each tick, including nearby people, locations, distances, and time of day.

This is a deliberately game-shaped data model rather than a generic AI agent transcript.

## Decision
Represent each villager as structured simulation state with these core facets:

- needs: hunger, energy, social, focus,
- inventory: food, grain, wood, coins,
- memory: recent events plus a short summary,
- role and place anchors: home, workplace, position,
- execution state: current action and optional multi-step plan.

## Consequences
- NPC behavior can emerge from simple state changes instead of hand-authored scripts for every situation.
- The same data works for UI summaries, event logging, decision scoring, and planner prompts.
- The model stays easy to serialize and clone for local simulation.
- Memory is intentionally shallow, so long-term relationships, rich history, and deep cognitive modeling are out of scope for the current starter.
