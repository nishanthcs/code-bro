import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { SessionNotesPanel } from "./SessionNotesPanel";

function TestHarness({
  initialCollapsed = true,
}: { initialCollapsed?: boolean } = {}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  return (
    <SessionNotesPanel
      notesMarkdown="Test notes"
      onNotesMarkdownChange={() => {}}
      collapsed={collapsed}
      onToggle={() => setCollapsed((c) => !c)}
      fullscreen={false}
      onToggleFullscreen={() => {}}
      mode="edit"
      onModeChange={() => {}}
      notesFontSize={14}
      onIncreaseNotesFontSize={() => {}}
      onDecreaseNotesFontSize={() => {}}
      fullscreenButtonRef={buttonRef}
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

  it("renders fullscreen toggle button", () => {
    render(<TestHarness />);

    expect(
      screen.getByRole("button", { name: "Open notes full screen" }),
    ).toBeInTheDocument();
  });

  it("calls onToggleFullscreen when fullscreen button clicked", async () => {
    const onToggleFullscreen = vi.fn();
    const buttonRef = { current: null as HTMLButtonElement | null };
    render(
      <SessionNotesPanel
        notesMarkdown="Test"
        onNotesMarkdownChange={() => {}}
        collapsed={false}
        onToggle={() => {}}
        fullscreen={false}
        onToggleFullscreen={onToggleFullscreen}
        mode="edit"
        onModeChange={() => {}}
        notesFontSize={14}
        onIncreaseNotesFontSize={() => {}}
        onDecreaseNotesFontSize={() => {}}
        fullscreenButtonRef={buttonRef}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Open notes full screen" }),
    );
    expect(onToggleFullscreen).toHaveBeenCalledOnce();
  });

  it("renders font size controls", () => {
    render(<TestHarness />);

    expect(
      screen.getByRole("button", { name: "Decrease notes font size" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Increase notes font size" }),
    ).toBeInTheDocument();
  });

  it("calls increase and decrease font size handlers", async () => {
    const onIncrease = vi.fn();
    const onDecrease = vi.fn();
    const buttonRef = { current: null as HTMLButtonElement | null };
    render(
      <SessionNotesPanel
        notesMarkdown="Test"
        onNotesMarkdownChange={() => {}}
        collapsed={false}
        onToggle={() => {}}
        fullscreen={false}
        onToggleFullscreen={() => {}}
        mode="edit"
        onModeChange={() => {}}
        notesFontSize={14}
        onIncreaseNotesFontSize={onIncrease}
        onDecreaseNotesFontSize={onDecrease}
        fullscreenButtonRef={buttonRef}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Increase notes font size" }));
    expect(onIncrease).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "Decrease notes font size" }));
    expect(onDecrease).toHaveBeenCalledOnce();
  });

  it("disables decrease button at min font size", () => {
    const buttonRef = { current: null as HTMLButtonElement | null };
    render(
      <SessionNotesPanel
        notesMarkdown="Test"
        onNotesMarkdownChange={() => {}}
        collapsed={false}
        onToggle={() => {}}
        fullscreen={false}
        onToggleFullscreen={() => {}}
        mode="edit"
        onModeChange={() => {}}
        notesFontSize={12}
        onIncreaseNotesFontSize={() => {}}
        onDecreaseNotesFontSize={() => {}}
        fullscreenButtonRef={buttonRef}
      />,
    );

    expect(screen.getByRole("button", { name: "Decrease notes font size" })).toBeDisabled();
  });

  it("disables increase button at max font size", () => {
    const buttonRef = { current: null as HTMLButtonElement | null };
    render(
      <SessionNotesPanel
        notesMarkdown="Test"
        onNotesMarkdownChange={() => {}}
        collapsed={false}
        onToggle={() => {}}
        fullscreen={false}
        onToggleFullscreen={() => {}}
        mode="edit"
        onModeChange={() => {}}
        notesFontSize={22}
        onIncreaseNotesFontSize={() => {}}
        onDecreaseNotesFontSize={() => {}}
        fullscreenButtonRef={buttonRef}
      />,
    );

    expect(screen.getByRole("button", { name: "Increase notes font size" })).toBeDisabled();
  });
});
