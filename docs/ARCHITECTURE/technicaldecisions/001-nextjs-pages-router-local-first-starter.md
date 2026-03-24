# ADR 001: Next.js Pages-Router Local-First Starter

## Title
Use a Next.js pages-router local-first starter on Next 16 and React 19

## Status
Superseded by ADR 006

## Context
The current application is a small starter intended to stay runnable before real backend services are wired. `package.json` pins the stack to Next.js `^16.2.1`, React `^19.2.4`, React DOM `^19.2.4`, TypeScript, and ESLint. The app is implemented with the Pages Router (`pages/index.tsx`, `pages/town/[id].tsx`, `pages/api/tick.ts`) rather than the App Router, and `README.md` describes the project as a local-first starter.

The town screen uses `getServerSideProps` to seed initial state on the server, then keeps the page live by polling `/api/tick` from the browser. `next.config.js` enables `reactStrictMode` and configures Turbopack with the repository root.

## Decision
Build the starter on the Next.js Pages Router with TypeScript, using server-rendered pages plus classic API routes as the integration surface.

Keep the application local-first by making the starter fully usable with only local state, mock data, and no required external service dependencies.

## Consequences
- The project has a simple and familiar full-stack shape: page routes render UI and API routes handle simulation updates.
- SSR remains straightforward because `getServerSideProps` can return seeded town state directly to the town page.
- The codebase avoids introducing App Router conventions, server components, or a more distributed runtime model at this stage.
- Future migrations to other routing or data-loading patterns remain possible, but current work should fit the Pages Router structure already present in `pages/`.
