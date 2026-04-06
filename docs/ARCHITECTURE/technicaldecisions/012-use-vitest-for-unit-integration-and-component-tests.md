# ADR 012: Use Vitest for unit, integration, and component tests

## Title

Use Vitest for unit, integration, and component tests

## Status

Accepted

## Context

VillageSim already has several seams that benefit from fast automated tests:

- shared simulation logic in `lib/`
- signed-session helpers for hosted identity
- client components in `components/`
- local-first execution paths that should stay stable while hosted infrastructure evolves

The repository did not yet have a unified test runner or a documented strategy for how to test pure logic, multi-module flows, and React components.

For the current phase, the team wants:

- Vitest as the primary runner
- unit, integration, and component coverage
- jsdom + React Testing Library for component tests
- no end-to-end browser testing yet

## Decision

Adopt Vitest as the repository test runner.

### Test layers

- **Unit tests** live under `tests/unit/` and focus on small module behavior.
- **Integration tests** live under `tests/integration/` and exercise cross-module flows without a browser.
- **Component tests** live under `tests/component/` and use jsdom + React Testing Library.

### Tooling

- Use `vitest` for the test runner and assertions.
- Use `@testing-library/react`, `@testing-library/user-event`, and `@testing-library/jest-dom` for component tests.
- Use `@vitest-environment jsdom` per file for DOM-oriented component tests while keeping the default environment lean for non-DOM tests.
- Enable coverage reporting through Vitest's V8 coverage provider.

### Scope boundary

Do not add end-to-end testing infrastructure yet.

The current focus is fast local feedback for shared logic, session helpers, and React UI behavior. E2E coverage can be added later once the hosted planner service and private-alpha deployment path stabilize.

## Consequences

- The repository gains a single fast test runner that fits the existing TypeScript and React stack.
- Shared simulation code can be tested without introducing a browser-driven E2E layer too early.
- Component tests can cover client UI behavior with realistic DOM interactions while remaining lightweight.
- Future contributors have a documented convention for where new tests should live and how they should be categorized.
- Coverage reporting is available now, but meaningful thresholds can be introduced later after the suite grows.
