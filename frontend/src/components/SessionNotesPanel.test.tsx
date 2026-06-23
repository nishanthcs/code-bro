import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { SessionNotesPanel } from "./SessionNotesPanel";

beforeEach(() => {
  localStorage.clear();
});

function TestHarness({
  initialCollapsed = true,
}: { initialCollapsed?: boolean } = {}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  return (
    <SessionNotesPanel
      notesMarkdown="Test notes"
      onNotesMarkdownChange={() => {}}
      collapsed={collapsed}
      onToggle={() => setCollapsed((c) => !c)}
    />
  );
}

describe("SessionNotesPanel", () => {
  it("renders collapse button with expected accessible name", () => {
    render(<TestHarness />);

    const toggle = screen.getByRole("button", {
      name: "Expand session notes panel",
    });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles expanded state when clicked", async () => {
    render(<TestHarness initialCollapsed />);

    const toggle = screen.getByRole("button", {
      name: "Expand session notes panel",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);

    expect(
      screen.getByRole("button", { name: "Collapse session notes panel" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("renders content when expanded", async () => {
    render(<TestHarness initialCollapsed />);

    expect(
      screen.queryByDisplayValue("Test notes"),
    ).not.toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Expand session notes panel" }),
    );

    expect(screen.getByDisplayValue("Test notes")).toBeVisible();
  });
});