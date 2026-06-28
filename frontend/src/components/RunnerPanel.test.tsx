import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RunnerPanel } from "./RunnerPanel";

const baseProps = {
  stdin: "",
  onStdinChange: vi.fn(),
  output: [],
  status: "ready" as const,
  durationMs: null,
  onClear: vi.fn(),
  stdinHeightPercent: 34,
  onStdinHeightChange: vi.fn(),
  onToggleStdin: vi.fn(),
  notesMarkdown: "",
  onNotesMarkdownChange: vi.fn(),
  notesHeightPercent: 35,
  onNotesHeightChange: vi.fn(),
  notesCollapsed: true,
  onToggleNotes: vi.fn(),
  debugStatus: "idle" as const,
  debugTarget: null,
  attachDebug: vi.fn(),
  detachDebug: vi.fn(),
  debugPausedInfo: null,
  debuggerCollapsed: true,
  onToggleDebuggerCollapse: vi.fn(),
  debuggerHeightPercent: 30,
  onDebuggerHeightChange: vi.fn(),
  onDebugContinue: vi.fn(),
  onDebugStepOver: vi.fn(),
  onDebugStepIn: vi.fn(),
  onDebugStepOut: vi.fn(),
  onDebugStop: vi.fn(),
};

describe("RunnerPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers a control to close the stdin panel", async () => {
    render(<RunnerPanel {...baseProps} stdinCollapsed={false} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Close program input panel" }),
    );

    expect(baseProps.onToggleStdin).toHaveBeenCalledOnce();
  });

  it("expands output and offers a restore control when stdin is closed", async () => {
    render(<RunnerPanel {...baseProps} stdinCollapsed />);

    expect(screen.queryByLabelText("Program input")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Program output")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show input" }));
    expect(baseProps.onToggleStdin).toHaveBeenCalled();
  });

  it("moves focus to the available control when stdin closes and restores", () => {
    const { rerender } = render(
      <RunnerPanel {...baseProps} stdinCollapsed={false} />,
    );
    screen.getByRole("button", { name: "Close program input panel" }).focus();

    rerender(<RunnerPanel {...baseProps} stdinCollapsed />);
    expect(screen.getByRole("button", { name: "Show input" })).toHaveFocus();

    rerender(<RunnerPanel {...baseProps} stdinCollapsed={false} />);
    expect(screen.getByLabelText("Program input")).toHaveFocus();
  });

  it("moves focus between the notes editor and its restore control", () => {
    const { rerender } = render(
      <RunnerPanel
        {...baseProps}
        stdinCollapsed={false}
        notesCollapsed={false}
      />,
    );
    screen.getByRole("textbox", { name: "Session notes" }).focus();

    rerender(
      <RunnerPanel
        {...baseProps}
        stdinCollapsed={false}
        notesCollapsed
      />,
    );
    expect(
      screen.getByRole("button", { name: "Expand session notes panel" }),
    ).toHaveFocus();

    rerender(
      <RunnerPanel
        {...baseProps}
        stdinCollapsed={false}
        notesCollapsed={false}
      />,
    );
    expect(
      screen.getByRole("textbox", { name: "Session notes" }),
    ).toHaveFocus();
  });

  it("uses bounded nested rows while notes are expanded", () => {
    const { container } = render(
      <RunnerPanel
        {...baseProps}
        stdinCollapsed={false}
        stdinHeightPercent={65}
        notesHeightPercent={60}
        notesCollapsed={false}
      />,
    );

    expect(container.querySelector(".runner-panel")).toHaveClass(
      "runner-panel--notes-expanded",
    );
    expect(container.querySelector(".runner-panel__lower")).toHaveStyle({
      "--notes-height": "60%",
    });
  });
});
