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
});
