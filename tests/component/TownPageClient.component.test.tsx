// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockTown } from "../../lib/mockData";
import type { TownState } from "../../lib/types";

const { push, mapTownData, townRender } = vi.hoisted(() => ({
  mapTownData: vi.fn((town: TownState) => ({
    id: town.id,
    map: [["grass"]],
    name: `${town.id} mapped ${town.tick}`,
    npcs: [],
  })),
  push: vi.fn(),
  townRender: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
  }),
}));

vi.mock("../../app/town/[id]/townPresentation", () => ({
  mapTownData,
}));

vi.mock("../../components/Town", () => ({
  default: (props: {
    error?: string | null;
    isLoading?: boolean;
    onOpenTown?: (townId: string) => void | Promise<void>;
    town?: { name?: string };
    townId: string;
  }) => {
    townRender(props);

    return (
      <div>
        <div data-testid="town-name">{props.town?.name ?? "no-town"}</div>
        <div data-testid="town-id">{props.townId}</div>
        <div data-testid="loading">{String(Boolean(props.isLoading))}</div>
        <div data-testid="error">{props.error ?? ""}</div>
        <button onClick={() => props.onOpenTown?.("other-town")} type="button">
          Open other town
        </button>
        <button onClick={() => props.onOpenTown?.(props.townId)} type="button">
          Reset current town
        </button>
      </div>
    );
  },
}));

import TownPageClient from "../../app/town/[id]/TownPageClient";

describe("TownPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("pushes a route when opening a different town id", async () => {
    const user = userEvent.setup();

    render(<TownPageClient initialTown={createMockTown({ id: "demo-town" })} initialTownId="demo-town" />);

    await user.click(screen.getByRole("button", { name: /open other town/i }));

    expect(push).toHaveBeenCalledWith("/town/other-town");
  });

  it("resets the current town through the tick route", async () => {
    const nextTown = createMockTown({ id: "demo-town", seed: "reset-seed" });
    nextTown.tick = 1;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, town: nextTown }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(<TownPageClient initialTown={createMockTown({ id: "demo-town" })} initialTownId="demo-town" />);

    fireEvent.click(screen.getByRole("button", { name: /reset current town/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/tick?townId=demo-town&count=1&reset=true");
    });
    expect(screen.getByTestId("town-name")).toHaveTextContent("demo-town mapped 1");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  it("shows polling errors when the tick request fails", async () => {
    const initialTown = createMockTown({ id: "demo-town" });
    let intervalCallback: (() => void) | undefined;

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "Polling failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "setInterval").mockImplementation(((callback: TimerHandler) => {
      intervalCallback = callback as () => void;
      return 1 as unknown as ReturnType<typeof setInterval>;
    }) as typeof window.setInterval);
    vi.spyOn(window, "clearInterval").mockImplementation(() => {});

    render(<TownPageClient initialTown={initialTown} initialTownId="demo-town" />);

    await act(async () => {
      intervalCallback?.();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/tick?townId=demo-town&count=1");
    });
    expect(screen.getByTestId("error")).toHaveTextContent("Polling failed");
  });
});
