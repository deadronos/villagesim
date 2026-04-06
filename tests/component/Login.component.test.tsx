// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Login from "../../components/Login";

describe("Login", () => {
  it("normalizes a typed town id before calling onEnterTown", async () => {
    const user = userEvent.setup();
    const onEnterTown = vi.fn();

    render(<Login currentTownId="starter-hollow" onEnterTown={onEnterTown} />);

    const townIdInput = screen.getByLabelText(/try another town seed/i);
    await user.clear(townIdInput);
    await user.type(townIdInput, "  My Cool Town!!  ");
    await user.click(screen.getByRole("button", { name: /load seed/i }));

    expect(onEnterTown).toHaveBeenCalledWith("my-cool-town");
  });

  it("shows the signed-in hosted town affordance when session data is present", () => {
    render(
      <Login
        currentTownId="demo-town"
        sessionTownId="deadronos-town"
        sessionUser={{ login: "deadronos", name: "Deadronos" }}
      />,
    );

    expect(screen.getByText(/signed in as @deadronos/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open your hosted town/i })).toHaveAttribute("href", "/town/deadronos-town");
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });
});