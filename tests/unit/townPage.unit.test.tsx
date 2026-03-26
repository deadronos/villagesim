// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockTown, createTownFromProfile } from "../../lib/mockData";

const {
  canAccessTown,
  cookies,
  decodeSession,
  ensureAuthoritativeTown,
  ensureLocalMockTownState,
  findLocalMockTownState,
  isHostedConvexModeEnabled,
  isTownAccessError,
  redirect,
} = vi.hoisted(() => ({
  canAccessTown: vi.fn(),
  cookies: vi.fn(),
  decodeSession: vi.fn(),
  ensureAuthoritativeTown: vi.fn(),
  ensureLocalMockTownState: vi.fn(),
  findLocalMockTownState: vi.fn(),
  isHostedConvexModeEnabled: vi.fn(),
  isTownAccessError: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies,
}));

vi.mock("next/navigation", () => ({
  redirect,
}));

vi.mock("../../lib/authoritativeTownStore", () => ({
  ensureAuthoritativeTown,
  isHostedConvexModeEnabled,
}));

vi.mock("../../lib/mockData", async () => {
  const actual = await vi.importActual<typeof import("../../lib/mockData")>("../../lib/mockData");
  return {
    ...actual,
    ensureLocalMockTownState,
    findLocalMockTownState,
  };
});

vi.mock("../../lib/session", async () => {
  const actual = await vi.importActual<typeof import("../../lib/session")>("../../lib/session");
  return {
    ...actual,
    decodeSession,
  };
});

vi.mock("../../lib/townAccess", () => ({
  canAccessTown,
  isTownAccessError,
}));

vi.mock("../../app/town/[id]/TownPageClient", () => ({
  default: ({ initialTownId }: { initialTownId: string }) => <div>Town page client {initialTownId}</div>,
}));

import TownPage, { generateMetadata } from "../../app/town/[id]/page";

describe("TownPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookies.mockResolvedValue({
      get: vi.fn(() => undefined),
    });
    decodeSession.mockReturnValue(null);
    isHostedConvexModeEnabled.mockReturnValue(false);
    canAccessTown.mockReturnValue(true);
    isTownAccessError.mockReturnValue(false);
  });

  it("generates metadata from the normalized town id", async () => {
    await expect(
      generateMetadata({
        params: Promise.resolve({ id: "Lantern Hollow!!" }),
      }),
    ).resolves.toEqual({
      description: "Explore a tiny seeded village with shared mock NPC state and a local-first starter flow.",
      title: "Lantern Hollow | VillageSim",
    });
  });

  it("renders the local town client when access is allowed", async () => {
    const town = createMockTown({ id: "demo-town" });
    findLocalMockTownState.mockReturnValue(null);
    ensureLocalMockTownState.mockReturnValue(town);

    render(
      await TownPage({
        params: Promise.resolve({ id: "demo-town" }),
      }),
    );

    expect(screen.getByText("Town page client demo-town")).toBeInTheDocument();
    expect(ensureLocalMockTownState).toHaveBeenCalledWith({ id: "demo-town" });
  });

  it("redirects to the session town for inaccessible profile towns in local mode", async () => {
    const town = createTownFromProfile({ login: "deadronos", name: "Deadronos" });
    findLocalMockTownState.mockReturnValue(town);
    cookies.mockResolvedValue({
      get: vi.fn(() => ({ value: "session-cookie" })),
    });
    decodeSession.mockReturnValue({
      expiresAt: Date.now() + 60_000,
      townId: "someone-else-town",
      user: { login: "someone-else" },
    });
    canAccessTown.mockReturnValue(false);

    await expect(
      TownPage({
        params: Promise.resolve({ id: town.id }),
      }),
    ).rejects.toThrow("REDIRECT:/town/someone-else-town");
  });

  it("redirects on hosted access errors and renders hosted towns otherwise", async () => {
    const hostedTown = createMockTown({ id: "deadronos-town" });
    isHostedConvexModeEnabled.mockReturnValue(true);
    cookies.mockResolvedValue({
      get: vi.fn(() => ({ value: "session-cookie" })),
    });
    decodeSession.mockReturnValue({
      expiresAt: Date.now() + 60_000,
      townId: "deadronos-town",
      user: { login: "deadronos" },
    });

    ensureAuthoritativeTown.mockResolvedValueOnce(hostedTown);

    render(
      await TownPage({
        params: Promise.resolve({ id: "deadronos-town" }),
      }),
    );
    expect(screen.getByText("Town page client deadronos-town")).toBeInTheDocument();

    ensureAuthoritativeTown.mockRejectedValueOnce(new Error("belongs to @deadronos"));
    isTownAccessError.mockReturnValueOnce(true);

    await expect(
      TownPage({
        params: Promise.resolve({ id: "deadronos-town" }),
      }),
    ).rejects.toThrow("REDIRECT:/town/deadronos-town");
  });
});
