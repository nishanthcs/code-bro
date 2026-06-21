import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ResizeHandle } from "./ResizeHandle";

const pointerHandlers = {
  onPointerDown: vi.fn(),
  onPointerMove: vi.fn(),
  onPointerUp: vi.fn(),
  onPointerCancel: vi.fn(),
};

describe("ResizeHandle", () => {
  it("exposes separator values and supports horizontal keyboard resizing", async () => {
    const onCommit = vi.fn();

    function Harness() {
      const [value, setValue] = useState(40);
      return (
        <ResizeHandle
          direction="horizontal"
          label="Resize panels"
          value={value}
          min={20}
          max={60}
          step={10}
          onValueChange={setValue}
          onValueCommit={onCommit}
          {...pointerHandlers}
        />
      );
    }

    render(<Harness />);
    const separator = screen.getByRole("separator", { name: "Resize panels" });

    expect(separator).toHaveAttribute("tabindex", "0");
    expect(separator).toHaveAttribute("aria-orientation", "vertical");
    expect(separator).toHaveAttribute("aria-valuemin", "20");
    expect(separator).toHaveAttribute("aria-valuemax", "60");
    expect(separator).toHaveAttribute("aria-valuenow", "40");

    separator.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(separator).toHaveAttribute("aria-valuenow", "50");
    expect(onCommit).toHaveBeenLastCalledWith(50);

    await userEvent.keyboard("{Home}");
    expect(separator).toHaveAttribute("aria-valuenow", "20");
    expect(onCommit).toHaveBeenLastCalledWith(20);

    await userEvent.keyboard("{End}");
    expect(separator).toHaveAttribute("aria-valuenow", "60");
    expect(onCommit).toHaveBeenLastCalledWith(60);
  });

  it("uses up and down arrows for a horizontal separator", async () => {
    const onCommit = vi.fn();

    function Harness() {
      const [value, setValue] = useState(30);
      return (
        <ResizeHandle
          direction="vertical"
          label="Resize input"
          value={value}
          min={20}
          max={65}
          step={5}
          onValueChange={setValue}
          onValueCommit={onCommit}
          {...pointerHandlers}
        />
      );
    }

    render(<Harness />);
    const separator = screen.getByRole("separator", { name: "Resize input" });

    expect(separator).toHaveAttribute("aria-orientation", "horizontal");
    separator.focus();
    await userEvent.keyboard("{ArrowDown}{ArrowUp}");

    expect(separator).toHaveAttribute("aria-valuenow", "30");
    expect(onCommit.mock.calls).toEqual([[35], [30]]);
  });
});
