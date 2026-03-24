# VillageSim — Runnable Starter Idea

A runnable starter for a 2D pixel-art village simulation that uses Vercel (Next.js) for the frontend, Convex for realtime state and authoritative mutations, and a lightweight worker (Vercel serverless or local Node worker) to run decision ticks and call a cheap model (mockable for local dev). NPCs run cheap deterministic "normal" actions locally and use a model-based planner for mid/long-term goals.

---

## Goals for the starter
- Render a small pixel village and a few NPC sprites (Phaser or Canvas).
- Use Convex live queries for authoritative state sync (town + NPCs).
- Implement a weighted decision function that drives frequent deterministic actions.
- Implement a tick worker that asks a planner (mock model by default) for multi-step plans when needed.
- Provide GitHub OAuth onboarding (seed town from GitHub profile) and a BYOK quick-demo option.
- Keep model calls batched, structured (JSON), and validated.

---

## Tech stack
- Frontend: Next.js (React) deployed on Vercel. Phaser or a simple Canvas renderer embedded in React for 2D pixel art.
- Realtime & authoritative backend: Convex (live queries + server functions).
- Worker & model proxy: Vercel Serverless functions or a small Node worker for scheduled ticks and model calls.
- Model: gpt-5-mini (or any cheap 0x-style model). Mocked in local dev by default.
- Storage: Convex DB for world state and event logs. Optionally Postgres for long-term logs.
- Dev tooling: pnpm / npm, Convex CLI, Vercel CLI.

---

## Repo layout (suggested)

- package.json
- .env.example
- next.config.js
- /pages
  - /api/auth/start.ts
  - /api/auth/callback.ts
  - /api/tick.ts            (optional endpoint to trigger a tick)
  - /town/[id].tsx
- /components
  - Town.tsx                (Convex live query + embeds Phaser canvas)
  - Login.tsx
- /lib
  - npc_decision.js         (weighted decision + plan trigger)
  - model_proxy.js          (wraps real model or mock)
  - prompt_templates.js
- /convex
  - /functions
    - applyNpcAction.ts
    - assignPlanToNpc.ts
    - createTownForUser.ts
  - /queries
    - getTown.ts
    - npcsNeedingDecision.ts
- /workers
  - tick.js                 (local worker / script that runs ticks)
- /public/assets
  - sprites/*.png
- README.md
- idea.md (this file)

---

## Required environment variables (.env.example)

```env
# GitHub OAuth (optional)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Convex
CONVEX_URL=https://your-convex-deployment-url
CONVEX_ADMIN_KEY=convex_admin_key_for_workers

# Model / Copilot
MODEL_API_URL=https://api.example.com/v1/generate
MODEL_API_KEY=sk-....
# When true, use a local mock planner (recommended for first-run)
MODEL_MOCK=true

# Session and security
SESSION_SECRET=some_random_secret
```

Notes:
- For local dev you can set MODEL_MOCK=true to avoid using a real model.
- If you persist GitHub tokens, encrypt them or store them only in a secure store (use KMS or Vercel environment secrets).

---

## Quick local dev steps (high level)

1. Clone the repo and open it.
2. Copy .env.example -> .env.local and fill values.
3. Install deps:
   - pnpm install (or npm install)
4. Start Convex local dev (if you use Convex dev):
   - convex dev
5. Start Next.js:
   - pnpm dev or npm run dev
6. Start tick worker (optional; you can instead invoke /api/tick):
   - node workers/tick.js
7. Open http://localhost:3000 and create/visit a town:
   - Use "Demo / Paste token" to create a session town or "Connect GitHub" for OAuth seeding.

---

## Key implementation sketches (drop into files)

-- NPC weighted decision (lib/npc_decision.js) --
```javascript
// name=lib/npc_decision.js
export const DEFAULT_WEIGHTS = { hunger: 1.2, energy: 1.0, social: 0.8, proximityDecay: 0.9, role: { farmer: { work: 1.5 } } };

function scoreCandidate(npc, env, candidate, weights) {
  let score = candidate.base || 1;
  score *= (weights.role[npc.role]?.[candidate.type] || 1);
  if (candidate.type === "eat") score *= 1 + (npc.status.hunger / 100) * weights.hunger;
  if (candidate.target) {
    const dx = candidate.target.x - npc.position.x;
    const dy = candidate.target.y - npc.position.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    score *= Math.pow(weights.proximityDecay, dist);
  }
  score *= 0.95 + Math.random() * 0.1;
  return score;
}

export function weightedDecision(npc, env, weights = DEFAULT_WEIGHTS) {
  const candidates = [
    { type: "work", base: 1.0, target: env.nearby?.field },
    { type: "eat", base: 0.8, target: env.nearby?.food },
    { type: "rest", base: 0.6 },
    { type: "social", base: 0.5, target: env.nearby?.people?.[0] },
    { type: "trade", base: 0.7, target: env.nearby?.market },
  ];
  const scored = candidates.map(c => ({ c, s: scoreCandidate(npc, env, c, weights) })).sort((a,b)=>b.s-a.s);
  const top = scored[0];
  const PLAN_THRESHOLD = 1.4;
  const LONGTERM_TYPES = new Set(["work","trade","social"]);
  if (top.s > PLAN_THRESHOLD && LONGTERM_TYPES.has(top.c.type)) {
    return { decision: "plan_required", plan_intent: top.c.type, plan_context: { npc, env } };
  }
  // immediate deterministic action mapping
  let action;
  switch (top.c.type) {
    case "work": action = { type: "move", target: top.c.target }; break;
    case "eat": action = { type: "eat", target: top.c.target }; break;
    case "rest": action = { type: "rest" }; break;
    case "social": action = { type: "speak", text: "Hi!", target_id: top.c.target?.id }; break;
    default: action = { type: "wait" };
  }
  return { decision: "immediate_action", action };
}
```

-- Convex mutation: applyNpcAction (convex/functions/applyNpcAction.ts) --
```ts
// name=convex/functions/applyNpcAction.ts
import { mutation } from "convex/values";

export default mutation(async ({ db }, { townId, npcId, action }) => {
  if (!action || !action.type) throw new Error("Invalid action");
  await db.patch(`towns/${townId}/npcs/${npcId}`, {
    $set: { current_action: action, last_decision_at: Date.now() }
  });
  await db.insert(`towns/${townId}/events`, { npcId, action, t: Date.now() });
  return { ok: true };
});
```

-- Next.js OAuth callback (pages/api/auth/callback.ts) --
```ts
// name=pages/api/auth/callback.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const code = req.query.code as string;
  if (!code) return res.status(400).send("Missing code");
  const resp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code
    })
  });
  const data = await resp.json();
  const access_token = data.access_token;
  const u = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${access_token}`, "User-Agent": "village-sim" }
  });
  const profile = await u.json();
  // TODO: call Convex function createTownForUser(profile, encryptedToken)
  // For the starter: set a session cookie or redirect to /town/{profile.login}
  res.redirect(`/town/${encodeURIComponent(profile.login)}`);
}
```

-- Worker tick (workers/tick.js) — simplified --
```javascript
// name=workers/tick.js
// Example: run with NODE_ENV=development node workers/tick.js
import { weightedDecision } from "../lib/npc_decision.js";
import { callModelForPlan, applyImmediateAction, assignPlanToNpc } from "./worker_helpers.js"; // implement these

async function runTick(townId) {
  const npcs = await fetchNpcsNeedingDecision(townId); // fetch from Convex via admin key
  const planners = [];
  for (const npc of npcs) {
    const env = await getLocalEnvSlice(npc, townId);
    const decision = weightedDecision(npc, env);
    if (decision.decision === "immediate_action") {
      await applyImmediateAction(townId, npc.id, decision.action);
    } else {
      planners.push({ npc, env, intent: decision.plan_intent });
    }
  }

  // Batch or parallel model calls for planners
  const plannerResults = await Promise.all(planners.map(p => callModelForPlan(p)));
  for (const r of plannerResults) {
    if (r.plan) {
      await assignPlanToNpc(townId, r.npc.id, r.plan);
    } else {
      // fallback safe action
      await applyImmediateAction(townId, r.npc.id, { type: "wait", duration: 2 });
    }
  }
}

// run once or schedule
runTick("demo-town").catch(console.error);
```

-- Planner prompt (lib/prompt_templates.js) --
```text
SYSTEM: You are a village planner. Given the NPC short memory, role, local environment, and an intent, return a compact JSON plan (no explanation).
IN: NPC: {npc_json}
IN: ENV: {env_json}
INTENT: "{intent}"
OUT: {"plan":[{...}]}
Allowed low-level actions: move(target:{x,y}), work(task), gather(item,count), speak(text,target_id), rest, trade(item,amount,target_id), wait(seconds).
```

---

## Convex design notes
- Documents:
  - towns/{townId} — town metadata and seed.
  - towns/{townId}/npcs/{npcId} — NPC documents (position, status, short_memory, current_action, plan).
  - towns/{townId}/events — event log stream for replay & summaries.
- Queries:
  - getTown(townId): returns full town snapshot for client.
  - npcsNeedingDecision(townId, threshold): returns list of NPCs to evaluate in this tick.
- Functions:
  - applyNpcAction(townId, npcId, action)
  - assignPlanToNpc(townId, npcId, plan)
  - createTownForUser(profile, tokenSummary)

Keep mutations atomic in Convex functions.

---

## Authentication & BYOK
- OAuth flow (recommended) implemented in Next.js API routes; exchange code server-side and then call Convex function to create a town seeded from the profile.
- BYOK flow: paste token in a client form. For the starter, treat BYOK tokens as session-only (do not persist); fetch user profile, seed a session town, and keep token only in browser memory if possible.

Security checklist
- Never expose long-lived tokens to client-side storage unless encrypted and user explicitly opted-in.
- Store persisted tokens encrypted (KMS or Vercel secrets).
- Redact sensitive data from model prompts unless users opt-in.
- Rate-limit tick endpoints and track model usage per town.

---

## MVP milestones (weekend -> 2 week plan)

Minimal weekend MVP (2 days)
1. Next.js page that renders a simple tiled map and 3 NPC sprites (no physics required).
2. Convex local dev with towns/npcs documents; React subscribes to town via Convex live query.
3. Local deterministic movement (client moves NPCs based on current_action).
4. Worker tick that runs weightedDecision and applies immediate actions (mock model off).
5. A single planner invocation mocked — when plan_required, populate a hardcoded plan in Convex.

Full starter (1–2 weeks)
1. Add Phaser for animation & collisions.
2. Implement model_proxy with mock + real model option.
3. GitHub OAuth onboarding and town seeding.
4. Planner prompt template and JSON validation (zod / ajv).
5. Memory summarizer and caching.
6. Per-town usage quotas and admin dashboard.

---

## Testing & debugging
- Log (server-side) prompts/responses and model usage, keep them off by default in production.
- Provide a "replay" feature: store sequences of ticks and allow replay to reproduce emergent behavior.
- Unit test weightedDecision by injecting deterministic RNG.
- Use Convex events table to replay a timeline.

---

## Deployment & scheduling
- Deploy Next.js to Vercel. Set environment variables in Vercel dashboard.
- Deploy Convex production cluster (or point to Convex cloud).
- For scheduled ticks, you can:
  - Use Vercel cron (Serverless Cron) to hit /api/tick periodically, or
  - Use a small Kubernetes or server worker to run scheduled tasks, or
  - Use GitHub Actions scheduled workflow that calls a tick endpoint.

---

## Cost & model usage controls
- Default to MODEL_MOCK=true for local development.
- Use cheap model (gpt-5-mini) for planners; limit tokens and set deterministic temperature.
- Batch planners when multiple NPCs share context.
- Add per-town daily quotas and soft warnings to the owner UI.

---

## Example .env.local (starter)
```env
NEXT_PUBLIC_BASE_URL=http://localhost:3000
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
CONVEX_URL=https://dev.convex.com/my-app
CONVEX_ADMIN_KEY=convex_admin_key_placeholder
MODEL_API_URL=https://api.mock
MODEL_API_KEY=mock
MODEL_MOCK=true
SESSION_SECRET=secret_for_local_dev
```

---

## Next steps you can take
- Option A: I can scaffold the starter repo (Next.js + Convex + basic Phaser/Canvas + mock worker) with all the files above and a working demo. This will be a mock-model local-first demo so you can iterate offline.
- Option B: I can scaffold the same starter but wire a real model proxy (gpt-5-mini) and GitHub OAuth onboarding.
- Option C: I can only scaffold the Convex functions and worker, leaving the UI hookup to you.

Tell me which option you prefer and I’ll scaffold the starter (create files and a runnable demo) next.