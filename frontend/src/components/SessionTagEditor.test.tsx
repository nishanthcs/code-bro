import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionTagEditor } from "./SessionTagEditor";

function TagEditorHarness() {
  const [tags, setTags] = useState<string[]>([]);
  return <SessionTagEditor tags={tags} onChange={setTags} />;
}

describe("SessionTagEditor", () => {
  it("adds normalized tags, ignores duplicates, and removes chips", async () => {
    const user = userEvent.setup();
    render(<TagEditorHarness />);
    const input = screen.getByRole("textbox", { name: "Add session tag" });

    await user.type(input, "  Python  {Enter}");
    expect(screen.getByText("Python")).toBeInTheDocument();

    await user.type(input, "python{Enter}");
    expect(screen.getAllByText("Python")).toHaveLength(1);

    await user.type(input, "ＤＰ{Enter}");
    expect(screen.getByText("DP")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove tag Python" }));
    expect(screen.queryByText("Python")).not.toBeInTheDocument();
  });

  it("commits pending text on Tab and removes the last tag with Backspace", async () => {
    const user = userEvent.setup();
    render(<TagEditorHarness />);
    const input = screen.getByRole("textbox", { name: "Add session tag" });

    await user.type(input, "Graphs");
    await user.tab();
    expect(screen.getByText("Graphs")).toBeInTheDocument();

    await user.click(input);
    await user.keyboard("{Backspace}");
    expect(screen.queryByText("Graphs")).not.toBeInTheDocument();
  });
});
