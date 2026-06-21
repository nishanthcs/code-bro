import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionNotesEditor } from "./SessionNotesEditor";

it("renders safe Markdown without raw HTML or remote images", async () => {
  render(
    <SessionNotesEditor
      value={[
        "# Heading",
        '<script aria-label="unsafe">alert(1)</script>',
        "![tracker](https://tracker.example/pixel.png)",
        "[Docs](https://example.com/docs)",
      ].join("\n")}
      onChange={() => undefined}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Preview" }));

  expect(screen.getByRole("heading", { name: "Heading" })).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("unsafe")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute(
    "target",
    "_blank",
  );
});

it("applies toolbar formatting to the current selection", async () => {
  const onChange = vi.fn();
  render(<SessionNotesEditor value="word" onChange={onChange} />);
  const textarea = screen.getByRole("textbox", {
    name: "Session notes",
  }) as HTMLTextAreaElement;
  textarea.setSelectionRange(0, 4);

  await userEvent.click(screen.getByRole("button", { name: "Bold" }));

  expect(onChange).toHaveBeenCalledWith("**word**");
});
