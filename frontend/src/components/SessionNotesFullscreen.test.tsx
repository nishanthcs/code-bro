import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { SessionNotesFullscreen } from "./SessionNotesFullscreen";
import type { SessionNotesMode } from "../types";

function TestHarness({
  open = true,
  notesMarkdown = "# Hello",
  onNotesMarkdownChange,
  fontSize = 14,
  onIncreaseFontSize,
  onDecreaseFontSize,
  mode = "edit" as SessionNotesMode,
  onModeChange,
  onClose,
}: {
  open?: boolean;
  notesMarkdown?: string;
  onNotesMarkdownChange?: (markdown: string) => void;
  fontSize?: 12 | 14 | 16 | 18 | 20 | 22;
  onIncreaseFontSize?: () => void;
  onDecreaseFontSize?: () => void;
  mode?: SessionNotesMode;
  onModeChange?: (mode: SessionNotesMode) => void;
  onClose?: () => void;
} = {}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button ref={buttonRef} type="button">
        Trigger
      </button>
      <SessionNotesFullscreen
        open={open}
        notesMarkdown={notesMarkdown}
        onNotesMarkdownChange={onNotesMarkdownChange ?? (() => {})}
        fontSize={fontSize}
        onIncreaseFontSize={onIncreaseFontSize ?? (() => {})}
        onDecreaseFontSize={onDecreaseFontSize ?? (() => {})}
        mode={mode}
        onModeChange={onModeChange ?? (() => {})}
        onClose={onClose ?? (() => {})}
        returnFocusRef={buttonRef}
      />
    </>
  );
}

it("renders nothing when closed", () => {
  const { container } = render(<TestHarness open={false} />);

  expect(container.querySelector(".notes-fullscreen-backdrop")).not.toBeInTheDocument();
});

it("renders dialog when open", () => {
  render(<TestHarness />);

  const dialog = screen.getByRole("dialog");
  expect(dialog).toBeInTheDocument();
  expect(dialog).toHaveAttribute("aria-modal", "true");
});

it("renders editor toolbar", () => {
  render(<TestHarness />);

  expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Italic" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Heading" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "List" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Code" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Link" })).toBeInTheDocument();
});

it("renders textarea when in edit mode", () => {
  render(<TestHarness mode="edit" />);

  expect(screen.getByRole("textbox", { name: "Session notes" })).toBeInTheDocument();
});

it("renders safe Markdown preview when in preview mode", () => {
  render(
    <TestHarness
      mode="preview"
      notesMarkdown={[
        "# Heading",
        '<script aria-label="unsafe">alert(1)</script>',
        "![tracker](https://tracker.example/pixel.png)",
        "[Docs](https://example.com/docs)",
      ].join("\n")}
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

it("shows placeholder for empty notes in preview mode", () => {
  render(<TestHarness mode="preview" notesMarkdown="" />);

  expect(screen.getByText("No notes yet")).toBeInTheDocument();
});

it("switches between edit and preview tabs", async () => {
  const onModeChange = vi.fn();
  const { rerender } = render(
    <TestHarness mode="preview" onModeChange={onModeChange} />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(onModeChange).toHaveBeenCalledWith("edit");

  rerender(
    <TestHarness mode="edit" onModeChange={onModeChange} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Preview" }));
  expect(onModeChange).toHaveBeenCalledWith("preview");
});

it("calls onClose when close button clicked", async () => {
  const onClose = vi.fn();
  render(<TestHarness onClose={onClose} />);

  await userEvent.click(screen.getByRole("button", { name: "Close full screen notes" }));
  expect(onClose).toHaveBeenCalledOnce();
});

it("calls onClose on Escape key", async () => {
  const onClose = vi.fn();
  render(<TestHarness onClose={onClose} />);

  await userEvent.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
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

it("calls font size handlers", async () => {
  const onIncrease = vi.fn();
  const onDecrease = vi.fn();
  render(
    <TestHarness
      fontSize={14}
      onIncreaseFontSize={onIncrease}
      onDecreaseFontSize={onDecrease}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Increase notes font size" }));
  expect(onIncrease).toHaveBeenCalledOnce();

  await userEvent.click(screen.getByRole("button", { name: "Decrease notes font size" }));
  expect(onDecrease).toHaveBeenCalledOnce();
});

it("disables decrease at min font size", () => {
  render(<TestHarness fontSize={12} />);

  expect(
    screen.getByRole("button", { name: "Decrease notes font size" }),
  ).toBeDisabled();
});

it("disables increase at max font size", () => {
  render(<TestHarness fontSize={22} />);

  expect(
    screen.getByRole("button", { name: "Increase notes font size" }),
  ).toBeDisabled();
});
