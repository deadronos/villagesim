// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage, { metadata } from "../../app/page";

describe("HomePage", () => {
  it("renders the default starter shell", async () => {
    render(await HomePage({}));

    expect(metadata.title).toBe("VillageSim Starter");
    expect(screen.getByText("VillageSim starter")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open demo town target/i })).toHaveAttribute("href", "/town/demo-town");
    expect(screen.getByText(/Copy .env.example to .env.local/i)).toBeInTheDocument();
  });

  it("shows the matching auth error banner when present in the search params", async () => {
    render(
      await HomePage({
        searchParams: Promise.resolve({
          auth_error: "not_approved",
        }),
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("Hosted access is still approval-only");
    expect(screen.getByText(/private-alpha allowlist/i)).toBeInTheDocument();
  });

  it("ignores unknown auth errors", async () => {
    render(
      await HomePage({
        searchParams: {
          auth_error: "something_else",
        },
      }),
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
