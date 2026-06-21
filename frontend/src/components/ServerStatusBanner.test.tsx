import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { checkHealth } from "../lib/api";
import { ServerStatusBanner } from "./ServerStatusBanner";

vi.mock("../lib/api", () => ({
  checkHealth: vi.fn(),
}));

const mockedCheckHealth = vi.mocked(checkHealth);

describe("ServerStatusBanner", () => {
  beforeEach(() => {
    mockedCheckHealth.mockReset();
  });

  it("proactively reports an unavailable server and retries", async () => {
    mockedCheckHealth
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ status: "ok" });

    render(<ServerStatusBanner />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "CodeBro server is unavailable",
    );

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        screen.queryByText("CodeBro server is unavailable"),
      ).not.toBeInTheDocument(),
    );
    expect(mockedCheckHealth).toHaveBeenCalledTimes(2);
  });
});
