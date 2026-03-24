# ADR 001: Hybrid NPC Decision-Making

## Title
Hybrid NPC decision-making: immediate weighted actions plus planner-required long-term behavior

## Status
Accepted

## Context
`idea.md` describes a starter where NPCs handle cheap, frequent behavior locally and only ask a planner for mid- or long-term goals when needed. The current implementation matches that shape.

`lib/npc_decision.ts` scores a small set of action candidates (`work`, `eat`, `rest`, `social`, `trade`, `wait`) using needs, role weights, proximity, and a little seeded noise. Some candidates are marked `prefersPlan`, and when their score crosses the configured `planThreshold`, the result becomes `plan_required` instead of an immediate action.

`lib/sim_engine.ts` then applies immediate actions directly or requests a multi-step plan through `lib/model_proxy.ts`, which currently defaults to a deterministic mock planner and falls back to it if a remote planner is unavailable.

## Decision
Use a two-layer decision system:

- Resolve short, obvious behavior with local weighted action selection.
- Reserve planner calls for behavior that benefits from sequencing and intent, especially work, trade, and social loops.
- Execute planner output as explicit plan steps, then return the NPC to weighted decision-making when the plan is complete.

## Consequences
- Most ticks stay cheap, deterministic, and easy to debug.
- Long-running behavior can still look intentional because it is expressed as a short plan instead of a single action.
- The planner surface stays narrow because only some intents escalate to planning.
- NPCs are less reactive while an active plan is running, because the current engine continues the plan step-by-step rather than replanning every tick.
