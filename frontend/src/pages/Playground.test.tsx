import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { ThemeProvider } from "../components/ThemeProvider";
import { ApiError, getSession, patchSession } from "../lib/api";
import type { SessionResource } from "../types";
import { Playground } from "./Playground";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    getSession: vi.fn(),
    patchSession: vi.fn(),
  };
});

vi.mock("../components/EditorSettings", () => ({
  EditorSettings: () => null,
}));

vi.mock("../components/ResizeHandle", () => ({
  ResizeHandle: () => null,
}));

vi.mock("../components/RunnerPanel", () => ({
  RunnerPanel: ({
    stdin,
    onStdinChange,
  }: {
    stdin: string;
    onStdinChange: (value: string) => void;
  }) => (
    <input
      aria-label="Stdin"
      value={stdin}
      onChange={(event) => onStdinChange(event.target.value)}
    />
  ),
}));

vi.mock("../hooks/useExecution", () => ({
  useExecution: () => ({
    workerReady: true,
    status: "ready",
    output: [],
    durationMs: null,
    debugPaused: null,
    iframeSrc: "about:blank",
    setFrameElement: () => undefined,
    initialize: () => undefined,
    run: () => undefined,
    startDebug: () => undefined,
    sendDebugCommand: () => undefined,
    stop: () => undefined,
    clearOutput: () => undefined,
  }),
}));

const mockedGetSession = vi.mocked(getSession);
const mockedPatchSession = vi.mocked(patchSession);

function session(id: string, name: string): SessionResource {
  return {
    id,
    name,
    code: `print("${name}")`,
    tags: [],
    revision: 1,
    created_at: "2026-06-20T00:00:00Z",
    updated_at: "2026-06-20T00:00:00Z",
    ref_url: null,
    notes_markdown: "",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderPlayground(
  initialEntry:
    | string
    | {
        pathname: string;
        state: { focusSessionName: boolean };
      } = "/sessions/one",
) {
  const router = createMemoryRouter(
    [
      { path: "/", element: <div>Session library</div> },
      { path: "/sessions/:sessionId", element: <Playground /> },
    ],
    { initialEntries: [initialEntry] },
  );
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
  return router;
}

describe("Playground session loading", () => {
  beforeEach(() => {
    mockedGetSession.mockReset();
    mockedPatchSession.mockReset();
  });

  it("aborts and ignores a stale session request after the URL changes", async () => {
    const first = deferred<SessionResource>();
    const second = deferred<SessionResource>();
    mockedGetSession
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const router = renderPlayground();

    await waitFor(() => expect(mockedGetSession).toHaveBeenCalledTimes(1));
    const firstSignal = mockedGetSession.mock.calls[0]?.[1];
    await act(async () => {
      await router.navigate("/sessions/two");
    });
    await waitFor(() => expect(mockedGetSession).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);

    act(() => {
      first.resolve(session("one", "Stale"));
      second.resolve(session("two", "Current"));
    });

    expect(await screen.findByDisplayValue("Current")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Stale")).not.toBeInTheDocument();
  });

  it("remounts session content so local UI state resets for the new URL", async () => {
    const second = deferred<SessionResource>();
    mockedGetSession
      .mockResolvedValueOnce(session("one", "First"))
      .mockReturnValueOnce(second.promise);
    const router = renderPlayground();

    expect(await screen.findByDisplayValue("First")).toBeInTheDocument();
    const stdin = screen.getByRole("textbox", { name: "Stdin" });
    await userEvent.type(stdin, "temporary input");
    expect(stdin).toHaveValue("temporary input");

    await act(async () => {
      await router.navigate("/sessions/two");
    });
    expect(await screen.findByText("Loading session")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("First")).not.toBeInTheDocument();

    act(() => second.resolve(session("two", "Second")));
    expect(await screen.findByDisplayValue("Second")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Stdin" })).toHaveValue("");
  });

  it("focuses and selects the name for a newly created session", async () => {
    mockedGetSession.mockResolvedValue(session("one", "Untitled Session"));
    renderPlayground({
      pathname: "/sessions/one",
      state: { focusSessionName: true },
    });

    const name = await screen.findByRole("textbox", {
      name: "Session name",
    });
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveAttribute("aria-keyshortcuts", "F2");
    expect(name).toHaveProperty("selectionStart", 0);
    expect(name).toHaveProperty(
      "selectionEnd",
      "Untitled Session".length,
    );
  });

  it("focuses session metadata with keyboard shortcuts", async () => {
    mockedGetSession.mockResolvedValue(session("one", "Original"));
    renderPlayground();

    const stdin = await screen.findByRole("textbox", { name: "Stdin" });
    stdin.focus();
    fireEvent.keyDown(window, { key: "F2" });
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Session name" }),
      ).toHaveFocus(),
    );

    fireEvent.keyDown(window, {
      key: "t",
      ctrlKey: true,
      shiftKey: true,
    });
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Add session tag" }),
      ).toHaveFocus(),
    );

    const metadataToggle = screen.getByRole("button", { name: /Metadata/ });
    fireEvent.keyDown(window, {
      key: "m",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(metadataToggle).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps a loaded conflict version saved after resetting the editor", async () => {
    const server = {
      ...session("one", "Server"),
      code: "print('server version')",
      revision: 2,
    };
    mockedGetSession.mockResolvedValue(session("one", "Original"));
    mockedPatchSession.mockRejectedValue(
      new ApiError(409, {
        error: {
          code: "revision_conflict",
          message: "The session changed.",
          details: { session: server },
        },
      }),
    );
    renderPlayground();

    const nameInput = await screen.findByRole("textbox", {
      name: "Session name",
    });
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Local");
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    expect(
      await screen.findByRole("dialog", {
        name: "This session changed elsewhere",
      }),
    ).toBeInTheDocument();
    const saveStatus = screen.getByRole("status");
    expect(saveStatus).toHaveTextContent("Conflict");
    expect(saveStatus).toHaveAttribute("aria-live", "polite");

    await userEvent.click(
      screen.getByRole("button", { name: "Load saved version" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "This session changed elsewhere",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(nameInput).toHaveValue("Server");
    expect(saveStatus).toHaveTextContent("Saved");
    expect(saveStatus).not.toHaveTextContent("Unsaved");
  });

  it("live-announces a failed save", async () => {
    mockedGetSession.mockResolvedValue(session("one", "Original"));
    mockedPatchSession.mockRejectedValue(new Error("connection lost"));
    renderPlayground();

    const nameInput = await screen.findByRole("textbox", {
      name: "Session name",
    });
    await userEvent.type(nameInput, " changed");
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    const saveStatus = await screen.findByRole("status");
    await waitFor(() => expect(saveStatus).toHaveTextContent("Save failed"));
    expect(saveStatus).toHaveAttribute("aria-live", "polite");
    expect(saveStatus).toHaveAttribute("aria-atomic", "true");
  });

  it("keeps failed and conflict indicators visible in the mobile rules", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );

    expect(styles).toContain(
      ".brand + .topbar-actions .save-indicator--saved,",
    );
    expect(styles).toContain(
      ".brand + .topbar-actions .save-indicator--scheduled,",
    );
    expect(styles).toContain(
      ".brand + .topbar-actions .save-indicator--saving {",
    );
    expect(styles).not.toContain(
      ".brand + .topbar-actions .save-indicator {\n    display: none;",
    );
  });
});
