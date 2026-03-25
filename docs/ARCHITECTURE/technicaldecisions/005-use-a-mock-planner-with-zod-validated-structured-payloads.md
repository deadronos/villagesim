# ADR 005: Mock Planner With Zod-Validated Structured Payloads

## Title

Use a mock planner with zod-validated structured payloads

## Status

Accepted

## Context

The simulation can request plans for NPCs through `lib/model_proxy.ts`. That module defines zod schemas for planner positions, discriminated plan steps, and the overall planner payload. `requestNpcPlan` always builds a structured prompt with `buildPlannerPrompt`, attempts a remote planner call only when the starter's placeholder remote settings are configured and `MODEL_MOCK !== "true"`, and otherwise falls back to a deterministic mock payload.

Incoming planner output is normalized by `safeParsePlannerJson`, which can unwrap several common response shapes before validating the final payload with zod. Validated payloads are then converted into typed `NpcPlan` objects with generated step IDs and starter-compatible statuses.

The hosted architecture now plans to use Copilot SDK as the first real planner provider, but that runtime change must stay behind the same structured planner contract.

## Decision

Represent planner output as compact structured JSON validated with zod, and keep a deterministic local mock planner as the default implementation for the starter.

Treat remote model access as optional infrastructure behind the same validated planner contract rather than as a separate code path with a different response shape.

The first hosted provider may change over time, but the planner boundary should stay schema-first and provider-agnostic.

## Consequences

- The starter can assign NPC plans without external model infrastructure, which keeps local development reliable.
- Both mock and remote planner flows must produce the same validated plan shape, reducing downstream branching in the simulation engine.
- Plan step types are explicit and constrained, which makes plan execution in `lib/sim_engine.ts` safer and easier to reason about.
- Adding new planner capabilities or providers requires updating the zod schema, prompt contract, and plan execution logic together so the planner and engine stay aligned.
