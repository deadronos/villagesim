// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Town from "../../components/Town";

function createCanvasContextStub() {
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    fillStyle: "",
    font: "",
    imageSmoothingEnabled: true,
    lineWidth: 1,
    strokeStyle: "",
  } as unknown as CanvasRenderingContext2D;
}

describe("Town", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => createCanvasContextStub());
  });

  it("shows an empty state before a town is loaded", () => {
    render(<Town townId="starter-hollow" />);

    expect(screen.getByText("No town loaded yet")).toBeInTheDocument();
    expect(screen.getByText(/Use the demo starter above to generate a local village seed/i)).toBeInTheDocument();
  });

  it("renders map, summaries, roster entries, and notes for a loaded town", () => {
    render(
      <Town
        townId="lantern-hollow"
        town={{
          activityFeed: [
            { id: "feed-1", label: "Lanterns were lit in the plaza.", tone: "good" },
            { id: "feed-2", label: "The bakery opened early.", tone: "neutral" },
          ],
          description: "A compact town for component coverage.",
          id: "lantern-hollow",
          map: [
            ["grass", "path", "plaza"],
            ["home", "field", "water"],
          ],
          name: "Lantern Hollow",
          notes: ["Polling is active.", "Planner hooks are wired."],
          npcs: [
            {
              currentAction: "gathering wood",
              energy: 72,
              hunger: 34,
              id: "npc-mira",
              mood: "steady",
              name: "Mira",
              role: "farmer",
              social: 65,
              summary: "Mira is gathering wood and feels steady.",
            },
            {
              currentAction: "gathering wood",
              energy: 58,
              hunger: 48,
              id: "npc-juno",
              mood: "focused",
              name: "Juno",
              role: "merchant",
              social: 41,
              summary: "Juno is gathering wood and feels focused.",
            },
          ],
          seedLabel: "lantern-seed",
          timeOfDay: "Evening wind-down",
          weather: "Lantern glow",
        }}
      />,
    );

    expect(screen.getByText("Lantern Hollow")).toBeInTheDocument();
    expect(screen.getByText("Pixel village snapshot")).toBeInTheDocument();
    expect(screen.getByText("2 villagers")).toBeInTheDocument();
    expect(screen.getByText("Starter summaries")).toBeInTheDocument();
    expect(screen.getAllByText("gathering wood")).toHaveLength(3);
    expect(screen.getByText("Mira is gathering wood and feels steady.")).toBeInTheDocument();
    expect(screen.getByText("Lanterns were lit in the plaza.")).toBeInTheDocument();
    expect(screen.getByText("Polling is active.")).toBeInTheDocument();
    expect(screen.getByText("Planner hooks are wired.")).toBeInTheDocument();
  });
});
