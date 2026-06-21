import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorSettings } from "./EditorSettings";
import { ThemeProvider } from "./ThemeProvider";

describe("EditorSettings", () => {
  it("increases editor font size and changes editor theme", async () => {
    render(
      <ThemeProvider>
        <EditorSettings />
      </ThemeProvider>,
    );

    expect(screen.getByText("13px")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Increase editor font size" }),
    );
    expect(screen.getByText("14px")).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue("--editor-font-size")).toBe(
      "14px",
    );

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Editor color theme" }),
      "midnight",
    );
    expect(
      screen.getByRole("combobox", { name: "Editor color theme" }),
    ).toHaveValue("midnight");
  });
});
