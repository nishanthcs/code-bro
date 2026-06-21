import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "./ThemeProvider";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  it("switches between light and dark mode", async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    );

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });
});
