// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TownCanvas from "../../components/TownCanvas";

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

describe("TownCanvas", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => createCanvasContextStub());
  });

  it("renders a placeholder canvas when no town is loaded", () => {
    render(<TownCanvas />);

    const canvas = screen.getByLabelText("Village map placeholder");
    expect(canvas).toHaveAttribute("width", "384");
    expect(canvas).toHaveAttribute("height", "320");
  });

  it("sizes the canvas from the town map dimensions", () => {
    render(
      <TownCanvas
        tileSize={16}
        town={{
          id: "demo-town",
          map: [
            ["grass", "path", "water"],
            ["grass", "home", "field"],
          ],
          name: "Demo Town",
          npcs: [
            {
              id: "npc-mira",
              name: "Mira",
              position: { x: 1, y: 1 },
              role: "farmer",
            },
          ],
        }}
      />,
    );

    const canvas = screen.getByLabelText("Demo Town village map");
    expect(canvas).toHaveAttribute("width", "48");
    expect(canvas).toHaveAttribute("height", "32");
  });
});
