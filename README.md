# VillageSim

VillageSim is a local-first starter for a 2D village simulation MVP. It includes a runnable Next.js UI, Convex-backed hosted authority for towns when enabled, mock local development state by default, NPC decision logic, a mock planner, a tick API, and a lightweight worker entrypoint so you can iterate before wiring full hosted planner infrastructure.

## What is in this starter?

- Next.js App Router app scaffold with TypeScript enabled.
- `/town/[id]` demo route that renders a seeded pixel village and NPC roster.
- GitHub OAuth routes and signed cookie session helpers for hosted identity scaffolding.
- Shared mock town state and simulation helpers in `lib/`.
- A local-first `/api/tick` endpoint for advancing the simulation.
- Worker entrypoints in `workers/` plus Convex-style query/mutation stubs in `convex/`.
- Baseline scripts for development, production build, runtime start, linting, and mock ticking.

## Local startup

1. Copy the example environment file:

   ```bash
   cp .env.example .env.local
   ```

2. Leave `MODEL_MOCK=true` for the first run and keep `VILLAGESIM_STATE_MODE=mock` unless you have a Convex deployment configured. That keeps the planner side mock-friendly while the rest of the app is still being wired.
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
- `npm run test` — run the full Vitest suite.
- `npm run test:watch` — run Vitest in watch mode during local development.
- `npm run test:coverage` — run the suite with coverage output in `coverage/`.
- `npm run test:unit` — run unit tests under `tests/unit/`.
- `npm run test:integration` — run integration tests under `tests/integration/`.
- `npm run test:component` — run jsdom component tests under `tests/component/`.
- `npm run tick:mock -- --town demo-town --count 1` — run the local worker tick against the seeded town.

## Testing

VillageSim now uses Vitest for fast local testing across three layers:

- **Unit tests** in `tests/unit/` for focused pure-module behavior such as session encoding/parsing and planner helpers.
- **Integration tests** in `tests/integration/` for multi-module flows such as simulation ticks and local state persistence.
- **Component tests** in `tests/component/` using jsdom + React Testing Library for client components.

The current test strategy deliberately excludes end-to-end browser tests for now. The goal is to build reliable fast feedback around the shared simulation code, auth/session helpers, and React UI before adding a heavier E2E layer.

Component tests use the `@vitest-environment jsdom` docblock and share a common setup file that enables Testing Library cleanup and `jest-dom` matchers.

## Environment notes

The provided `.env.example` includes placeholders for:

- GitHub OAuth client credentials
- `APPROVED_GITHUB_LOGINS` for the private-alpha hosted access allowlist
- Convex deployment values for authoritative state and worker access
- `VILLAGESIM_STATE_MODE=mock|convex` to choose between local seeded storage and hosted Convex authority
- Planner/model settings with `MODEL_MOCK=true` enabled by default for the current starter path
- Session secret for local development

Hosted GitHub sign-in stays private-alpha by default. Add a comma-separated list of approved GitHub logins to `APPROVED_GITHUB_LOGINS` before testing OAuth locally. Unapproved users are redirected back to `/` with an explicit denial message, and the local `demo-town` flow continues to work without OAuth.

Today the starter still uses the generic `MODEL_*` placeholders for its mock-friendly remote planner seam. The planned hosted architecture now targets Copilot SDK as the first real planner provider rather than a direct GitHub Models PAT flow.

## Local-first architecture

- `lib/mockData.ts` owns seeded town/NPC state and simple in-memory persistence for local mock mode.
- `lib/authoritativeTownStore.ts` switches hosted reads/writes between local mock mode and Convex-backed authority.
- `lib/npc_decision.ts` handles fast weighted decisions with injectable RNG.
- `lib/model_proxy.ts` provides a zod-validated mock planner and the provider seam that the hosted plan will pivot toward Copilot SDK.
- `lib/sim_engine.ts` applies actions, assigns plans, and advances ticks.
- `app/api/tick/route.ts` advances either the local mock town or the hosted Convex town and returns structured JSON for the UI.
- `workers/tick.ts` and `workers/worker_helpers.ts` exercise the same simulation logic outside the request path.

## Next steps

- Replace the mock in-memory town store with real Convex reads and mutations.
- Move GitHub-auth town ownership from the in-memory mock bridge into Convex-backed persistence.
- Replace the placeholder remote planner wiring with a Copilot SDK-backed hosted planner path while keeping the mock fallback as the default local-first experience.
