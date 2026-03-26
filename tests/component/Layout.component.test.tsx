// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RootLayout, { metadata } from "../../app/layout";

describe("RootLayout", () => {
  it("renders children inside the app shell", () => {
    render(
      <RootLayout>
        <main>VillageSim child content</main>
      </RootLayout>,
    );

    expect(metadata.title).toBe("VillageSim Starter");
    expect(screen.getByText("VillageSim child content")).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "en");
  });
});
