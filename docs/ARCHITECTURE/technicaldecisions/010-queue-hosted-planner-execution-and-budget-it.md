# ADR 010: Queue hosted planner execution and budget it

## Title

Queue hosted planner execution and budget it

## Status

Accepted

## Context

The shared simulation engine already supports inline planner calls through `lib/model_proxy.ts`, which is appropriate for local-first development because the starter should stay responsive without extra infrastructure.

Hosted mode has different constraints. Planner calls may involve remote inference latency, rate limits, or transient provider failures. Running those calls inline inside authoritative hosted ticks would make the tick path vulnerable to slow or failed inference and would make planner usage hard to bound and inspect.

## Decision

Keep inline planner execution for local/mock mode, but switch hosted authoritative ticks to a queued/background planner model.

Hosted ticks should:

- assign a short-lived queued placeholder plan immediately,
- persist queued planner work with the authoritative town state,
- enforce a per-town, per-tick planner budget before queueing more work,
- drain queued planner work asynchronously after the tick response is sent, allowing both post-response hooks and a dedicated internal dispatcher/cron as hosted hardening evolves,
- record planner telemetry for queueing, completion, latency, failure, and fallback behavior.

Prompt assets and reproducible evaluation fixtures should live in-repo so planner iteration is reviewable alongside code changes.

## Consequences

- Hosted ticks no longer block on uncontrolled planner latency.
- Planner usage is explicitly budgeted per town/tick.
- Remote planner failures still degrade to deterministic mock plans through the existing validated planner contract.
- Planner queue draining can harden over time without changing the underlying queued/budgeted simulation contract.
- Town state now carries lightweight planner queue and telemetry metadata in hosted mode.
- Prompt changes can be tracked with matching prompt/eval assets instead of only in code.
