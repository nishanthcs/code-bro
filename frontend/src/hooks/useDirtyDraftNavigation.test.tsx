import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryRouter,
  RouterProvider,
  useNavigate,
} from "react-router-dom";
import { Brand } from "../components/Brand";
import { useDirtyDraftNavigation } from "./useDirtyDraftNavigation";

function DirtyPage({
  saveNow,
  abandon,
}: {
  saveNow: () => Promise<boolean>;
  abandon: () => void;
}) {
  const navigate = useNavigate();
  useDirtyDraftNavigation({ isDirty: true, saveNow, abandon });
  return (
    <div>
      <Brand />
      <button type="button" onClick={() => navigate("/")}>
        Sessions
      </button>
    </div>
  );
}

function renderRouter(
  saveNow: () => Promise<boolean>,
  abandon: () => void,
) {
  const router = createMemoryRouter(
    [
      { path: "/", element: <div>Session library</div> },
      {
        path: "/sessions/:sessionId",
        element: <DirtyPage saveNow={saveNow} abandon={abandon} />,
      },
    ],
    {
      initialEntries: ["/", "/sessions/session-1"],
      initialIndex: 1,
    },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("useDirtyDraftNavigation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("protects internal navigation until the dirty draft saves", async () => {
    const saveNow = vi.fn().mockResolvedValue(true);
    renderRouter(saveNow, vi.fn());

    await userEvent.click(screen.getByRole("button", { name: "Sessions" }));

    expect(await screen.findByText("Session library")).toBeInTheDocument();
    expect(saveNow).toHaveBeenCalledTimes(1);
  });

  it("protects Brand navigation and explicitly abandons only after confirmation", async () => {
    const saveNow = vi.fn().mockResolvedValue(false);
    const abandon = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    renderRouter(saveNow, abandon);

    await userEvent.click(
      screen.getByRole("link", { name: "CodeBro session library" }),
    );
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Session library")).not.toBeInTheDocument();
    expect(abandon).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    await userEvent.click(
      screen.getByRole("link", { name: "CodeBro session library" }),
    );

    expect(await screen.findByText("Session library")).toBeInTheDocument();
    expect(abandon).toHaveBeenCalledTimes(1);
  });

  it("protects browser-style back navigation", async () => {
    const saveNow = vi.fn().mockResolvedValue(true);
    const router = renderRouter(saveNow, vi.fn());

    await router.navigate(-1);

    expect(await screen.findByText("Session library")).toBeInTheDocument();
    expect(saveNow).toHaveBeenCalledTimes(1);
  });
});
