# ADR 008: Use Copilot SDK as the first hosted planner runtime

## Title

Use Copilot SDK as the first hosted planner runtime

## Status

Superseded by ADR 011

## Context

This ADR captured the first hosted planner direction after the project moved away from a GitHub Models PAT-based integration.

At the time, the codebase already had a clean planner seam:

- `lib/model_proxy.ts` is the planner-provider boundary.
- `lib/prompt_templates.ts` already produces compact structured prompts.
- `lib/model_proxy.ts` already validates planner output through zod before the simulation engine consumes it.
- `lib/sim_engine.ts` only depends on the planner contract, not on transport details.

The project had also established GitHub OAuth and signed cookie sessions for hosted user identity in ADR 007, which made direct server-side Copilot access feel like the simplest next step.

Subsequent planning clarified that VillageSim should keep the web app's auth model stable and introduce a private planner-service boundary for hosted execution instead of binding the Next.js app directly to a specific Copilot transport.

## Decision

This ADR no longer defines the active hosted planner transport.

ADR 011 supersedes the direct-integration portion of this decision by moving hosted planner access behind a private planner service that the Next.js app calls server-to-server.

What remains useful from this ADR is the provider preference:

- keep `mock` as the default local-first planner and mandatory fallback,
- prefer a Copilot-backed runtime for the first real hosted planner implementation,
- keep planner authorization material out of `__vs_session` and other client-visible payloads,
- preserve the existing zod-validated structured planner contract and deterministic fallback behavior.

## Consequences

- Copilot remains the preferred planner family for the first hosted runtime, but it now sits behind the private service boundary in ADR 011 rather than a direct Next.js integration.
- GitHub OAuth remains the player identity system, while planner authorization stays a server-side concern and does not flow through the browser session cookie.
- Planner integration still remains behind a provider seam, so future providers can be added without rewriting the simulation engine.
