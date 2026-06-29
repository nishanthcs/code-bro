import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { SessionNotesEditor } from "./SessionNotesEditor";

function ControlledEditor({
  initialMode = "edit",
}: { initialMode?: "edit" | "preview" } = {}) {
  const [mode, setMode] = useState<"edit" | "preview">(initialMode);
  return (
    <SessionNotesEditor
      value="# Heading"
      onChange={() => undefined}
      mode={mode}
      onModeChange={setMode}
      notesFontSize={14}
    />
  );
}

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
      mode="preview"
      onModeChange={() => undefined}
      notesFontSize={14}
    />,
  );

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
  render(<SessionNotesEditor value="word" onChange={onChange} mode="edit" onModeChange={() => undefined} notesFontSize={14} />);
  const textarea = screen.getByRole("textbox", {
    name: "Session notes",
  }) as HTMLTextAreaElement;
  textarea.setSelectionRange(0, 4);

  await userEvent.click(screen.getByRole("button", { name: "Bold" }));

  expect(onChange).toHaveBeenCalledWith("**word**");
});

it("renders preview immediately when mode is preview", () => {
  render(
    <SessionNotesEditor
      value="# Hello"
      onChange={() => undefined}
      mode="preview"
      onModeChange={() => undefined}
      notesFontSize={14}
    />,
  );

  expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
});

it("calls onModeChange when Edit tab is clicked", async () => {
  const onModeChange = vi.fn();
  render(
    <SessionNotesEditor
      value="test"
      onChange={() => undefined}
      mode="preview"
      onModeChange={onModeChange}
      notesFontSize={14}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(onModeChange).toHaveBeenCalledWith("edit");
});

it("calls onModeChange when Preview tab is clicked", async () => {
  const onModeChange = vi.fn();
  render(
    <SessionNotesEditor
      value="test"
      onChange={() => undefined}
      mode="edit"
      onModeChange={onModeChange}
      notesFontSize={14}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Preview" }));
  expect(onModeChange).toHaveBeenCalledWith("preview");
});

it("disables toolbar buttons in preview mode", () => {
  render(
    <SessionNotesEditor
      value="test"
      onChange={() => undefined}
      mode="preview"
      onModeChange={() => undefined}
      notesFontSize={14}
    />,
  );

  expect(screen.getByRole("button", { name: "Bold" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Italic" })).toBeDisabled();
});

it("switches between edit and preview via controlled mode", async () => {
  render(<ControlledEditor initialMode="preview" />);

  expect(screen.getByRole("heading", { name: "Heading" })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Edit" }));

  expect(screen.getByRole("textbox", { name: "Session notes" })).toBeInTheDocument();
});
