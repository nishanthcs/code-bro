import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionReferenceField } from "./SessionReferenceField";

it("validates, opens, and clears a reference URL safely", async () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <SessionReferenceField value={null} onChange={onChange} />,
  );
  const input = screen.getByRole("textbox", { name: "Reference URL" });

  await userEvent.type(input, "javascript:alert(1)");
  await userEvent.tab();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Only http and https URLs are allowed",
  );
  expect(onChange).not.toHaveBeenCalled();

  rerender(
    <SessionReferenceField
      value="https://example.com/docs"
      onChange={onChange}
    />,
  );
  const link = screen.getByRole("link", {
    name: "Open reference: https://example.com/docs",
  });
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");

  await userEvent.click(screen.getByRole("button", {
    name: "Clear reference URL",
  }));
  expect(onChange).toHaveBeenLastCalledWith(null);
});
