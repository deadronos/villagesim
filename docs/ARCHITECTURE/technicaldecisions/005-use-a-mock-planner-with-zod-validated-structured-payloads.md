# ADR 005: Mock Planner With Zod-Validated Structured Payloads

## Title

Use a mock planner with zod-validated structured payloads

## Status

Accepted

## Context

The simulation can request plans for NPCs through `lib/model_proxy.ts`. Shared schemas now live in `lib/plannerContract.ts` so the app and planner service can validate the same request and response shapes. `requestNpcPlan` still builds a structured prompt with `buildPlannerPrompt`, attempts a remote planner-service call only when the service settings are configured and `VILLAGESIM_PLANNER_MOCK !== "true"`, and otherwise falls back to a deterministic mock payload.

Incoming planner output is normalized through the shared planner contract parser, which can unwrap both service-envelope responses and a few legacy provider-shaped payloads before validating the final plan with zod. Validated payloads are then converted into typed `NpcPlan` objects with generated step IDs and starter-compatible statuses.

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
