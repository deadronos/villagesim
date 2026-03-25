# ADR 008: Use Copilot SDK as the first hosted planner runtime

## Title

Use Copilot SDK as the first hosted planner runtime

## Status

Accepted

## Context

The hosted roadmap in `plans/plan-hosted.md` originally assumed GitHub Models plus a separate PAT-based planner authorization flow as the first real NPC planner provider.

The current codebase already has a cleaner seam than that assumption requires:

- `lib/model_proxy.ts` is the planner-provider boundary.
- `lib/prompt_templates.ts` already produces compact structured prompts.
- `lib/model_proxy.ts` already validates planner output through zod before the simulation engine consumes it.
- `lib/sim_engine.ts` only depends on the planner contract, not on transport details.

The project has also already established GitHub OAuth and signed cookie sessions for hosted user identity in ADR 007. Reusing authenticated GitHub user access server-side for planner calls is a better fit for the intended hosted flow than introducing a separate GitHub Models PAT vault as the default architecture.

The user prefers to pivot the hosted planner path toward Copilot SDK, especially for included Copilot models such as `GPT-5 mini`, while still acknowledging that Copilot SDK is in Technical Preview and that included-model usage may be rate-limited.

## Decision

Use Copilot SDK as the first hosted planner runtime.

The hosted planner path should:

- keep `mock` as the default local-first planner and mandatory fallback,
- add `copilotSdk` as the first real hosted planner provider,
- prefer reusing the authenticated user's GitHub OAuth token server-side for Copilot SDK planner calls,
- keep planner authorization material out of `__vs_session` and other client-visible payloads,
- preserve the existing zod-validated structured planner contract and deterministic fallback behavior.

The initial hosted planner target should be an included Copilot model such as `GPT-5 mini`, but rollout planning must still account for rate limits, entitlement boundaries, and the SDK's preview status.

## Consequences

- The hosted roadmap now aligns with the preferred Copilot-centric usage path rather than a PAT-based GitHub Models integration.
- Planner integration remains behind a provider seam, so future providers can still be added without rewriting the simulation engine.
- GitHub OAuth remains the player identity system, while planner authorization stays a server-side concern.
- The signed session cookie stays minimal and does not become a transport for planner credentials.
- Hosted planner hardening work must explicitly account for Copilot SDK rate limiting, entitlement failures, and preview-stage behavior.
