import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SessionResource } from "../types";
import { ConflictDialog } from "./ConflictDialog";

const server: SessionResource = {
  id: "session-1",
  name: "Server copy",
  code: "print('server')",
  revision: 2,
  created_at: "2026-06-20T00:00:00Z",
  updated_at: "2026-06-20T00:00:00Z",
};

function ConflictHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open conflict
      </button>
      {open && (
        <ConflictDialog
          server={server}
          onLoadServer={() => setOpen(false)}
          onKeepLocal={() => setOpen(false)}
        />
      )}
    </>
  );
}

describe("ConflictDialog focus management", () => {
  it("traps focus and restores it to the previously focused control", async () => {
    const user = userEvent.setup();
    render(<ConflictHarness />);
    const trigger = screen.getByRole("button", { name: "Open conflict" });

    await user.click(trigger);
    const loadServer = screen.getByRole("button", {
      name: "Load saved version",
    });
    const keepLocal = screen.getByRole("button", {
      name: "Keep my version",
    });
    expect(loadServer).toHaveFocus();

    await user.tab({ shift: true });
    expect(keepLocal).toHaveFocus();
    await user.tab();
    expect(loadServer).toHaveFocus();

    await user.click(loadServer);
    expect(trigger).toHaveFocus();
  });
});
