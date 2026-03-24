# VillageSim

VillageSim is a local-first starter for a 2D village simulation MVP. It includes a runnable Next.js UI, a mock authoritative town state, NPC decision logic, a mock planner, a tick API, and a lightweight worker entrypoint so you can iterate before wiring real Convex, OAuth, or model infrastructure.

## What is in this starter?

- Next.js pages-router app scaffold with TypeScript enabled.
- `/town/[id]` demo route that renders a seeded pixel village and NPC roster.
- Shared mock town state and simulation helpers in `lib/`.
- A local-first `/api/tick` endpoint for advancing the simulation.
- Worker entrypoints in `workers/` plus Convex-style query/mutation stubs in `convex/`.
- Baseline scripts for development, production build, runtime start, linting, and mock ticking.

## Local startup

1. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```
2. Leave `MODEL_MOCK=true` for the first run. That keeps the planner side mock-friendly while the rest of the app is still being wired.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the app:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000).
6. Visit [http://localhost:3000/town/demo-town](http://localhost:3000/town/demo-town).
7. Optionally advance the local simulation manually:
   ```bash
   npm run tick:mock -- --town demo-town --count 2
   ```

## Scripts

- `npm run dev` — start the local development server.
- `npm run build` — create a production build.
- `npm run start` — run the production build locally.
- `npm run lint` — run the ESLint CLI checks for the Next.js app.
- `npm run tick:mock -- --town demo-town --count 1` — run the local worker tick against the seeded town.

## Environment notes

The provided `.env.example` includes placeholders for:

- GitHub OAuth client credentials
- Convex deployment values for authoritative state and worker access
- Planner/model settings with `MODEL_MOCK=true` enabled by default
- Session secret for local development

## Local-first architecture

- `lib/mockData.ts` owns seeded town/NPC state and simple in-memory persistence.
- `lib/npc_decision.ts` handles fast weighted decisions with injectable RNG.
- `lib/model_proxy.ts` provides a zod-validated mock planner and a placeholder remote model path.
- `lib/sim_engine.ts` applies actions, assigns plans, and advances ticks.
- `pages/api/tick.ts` advances the local town and returns structured JSON for the UI.
- `workers/tick.ts` and `workers/worker_helpers.ts` exercise the same simulation logic outside the request path.

## Next steps

- Replace the mock in-memory town store with real Convex reads and mutations.
- Add GitHub OAuth routes that seed a town from the authenticated profile.
- Swap `MODEL_MOCK=true` for a real planner endpoint once you are ready to test model-based plans.
