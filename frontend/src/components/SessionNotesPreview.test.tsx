import { render, screen } from "@testing-library/react";
import { SessionNotesPreview } from "./SessionNotesPreview";

it("renders safe Markdown without raw HTML or remote images", () => {
  render(
    <SessionNotesPreview
      value={[
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

it("renders tables with GFM", () => {
  const { container } = render(
    <SessionNotesPreview
      value={`| A | B |
|---|---|
| 1 | 2 |`}
    />,
  );

  expect(container.querySelector("table")).toBeInTheDocument();
  expect(container.querySelector("td")).toHaveTextContent("1");
});

it("shows placeholder when empty string", () => {
  render(<SessionNotesPreview value="" />);

  expect(screen.getByText("No notes yet")).toBeInTheDocument();
});

it("applies font size as CSS variable", () => {
  const { container } = render(
    <SessionNotesPreview value="Hello" fontSize={18} />,
  );

  const preview = container.querySelector(".notes-preview");
  expect(preview).toHaveStyle("--notes-font-size: 18px");
});

it("applies className to container", () => {
  const { container } = render(
    <SessionNotesPreview value="Hello" className="custom-class" />,
  );

  expect(container.querySelector(".custom-class")).toBeInTheDocument();
});
