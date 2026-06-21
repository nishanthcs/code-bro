import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { ThemeProvider } from "../components/ThemeProvider";
import {
  createSession,
  deleteSession,
  listSessions,
  patchSession,
} from "../lib/api";
import type {
  MutationResponse,
  SessionListResponse,
  SessionResource,
  SessionSummary,
} from "../types";
import { SessionLibrary } from "./SessionLibrary";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    createSession: vi.fn(),
    deleteSession: vi.fn(),
    listSessions: vi.fn(),
    patchSession: vi.fn(),
  };
});

const mockedCreateSession = vi.mocked(createSession);
const mockedDeleteSession = vi.mocked(deleteSession);
const mockedListSessions = vi.mocked(listSessions);
const mockedPatchSession = vi.mocked(patchSession);

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  constructor(
    private readonly callback: IntersectionObserverCallback,
  ) {
    MockIntersectionObserver.instances.push(this);
  }

  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];

  trigger(isIntersecting = true) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function summary(id: string, name: string): SessionSummary {
  return {
    id,
    name,
    code_preview: `print("${name}")`,
    revision: 1,
    created_at: "2026-06-20T00:00:00Z",
    updated_at: "2026-06-20T00:00:00Z",
  };
}

function resource(id: string, name: string): SessionResource {
  return {
    id,
    name,
    code: `print("${name}")`,
    revision: 1,
    created_at: "2026-06-20T00:00:00Z",
    updated_at: "2026-06-20T00:00:00Z",
  };
}

function mutation(id: string, name: string): MutationResponse {
  return {
    session: resource(id, name),
    mutation: {
      mutation_id: "receipt",
      applied_revision: 1,
      duplicate: false,
      superseded: false,
    },
  };
}

function page(
  items: SessionSummary[],
  nextCursor: string | null = null,
): SessionListResponse {
  return { items, next_cursor: nextCursor };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderLibrary() {
  const router = createMemoryRouter(
    [
      { path: "/", element: <SessionLibrary /> },
      { path: "/sessions/:sessionId", element: <div>Playground</div> },
    ],
    { initialEntries: ["/"] },
  );
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
  return router;
}

describe("SessionLibrary data operations", () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    mockedCreateSession.mockReset();
    mockedDeleteSession.mockReset();
    mockedListSessions.mockReset();
    mockedPatchSession.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ignores stale search results after a newer query starts", async () => {
    const first = deferred<SessionListResponse>();
    const second = deferred<SessionListResponse>();
    mockedListSessions
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    renderLibrary();

    await waitFor(() => expect(mockedListSessions).toHaveBeenCalledTimes(1));
    const firstSignal = mockedListSessions.mock.calls[0]?.[2];
    fireEvent.change(screen.getByRole("textbox", { name: "Search sessions" }), {
      target: { value: "current" },
    });
    await waitFor(() => expect(firstSignal?.aborted).toBe(true));
    await waitFor(() => expect(mockedListSessions).toHaveBeenCalledTimes(2));

    act(() => {
      second.resolve(page([summary("current", "Current")]));
      first.resolve(page([summary("stale", "Stale")]));
    });

    expect(await screen.findByText("Current")).toBeInTheDocument();
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
  });

  it("deduplicates page items and refuses duplicate cursor requests", async () => {
    const nextPage = deferred<SessionListResponse>();
    mockedListSessions
      .mockResolvedValueOnce(page([summary("a", "Alpha")], "cursor-1"))
      .mockReturnValueOnce(nextPage.promise);
    renderLibrary();

    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    await waitFor(() =>
      expect(MockIntersectionObserver.instances.length).toBeGreaterThan(0),
    );
    const observer = MockIntersectionObserver.instances.at(-1)!;
    act(() => {
      observer.trigger();
      observer.trigger();
    });
    await waitFor(() => expect(mockedListSessions).toHaveBeenCalledTimes(2));

    act(() => {
      nextPage.resolve(
        page(
          [summary("a", "Alpha"), summary("b", "Beta")],
          "cursor-1",
        ),
      );
    });
    expect(await screen.findByText("Beta")).toBeInTheDocument();
    expect(screen.getAllByText("Alpha")).toHaveLength(1);

    act(() => observer.trigger());
    expect(mockedListSessions).toHaveBeenCalledTimes(2);
  });

  it("reuses the caller-owned create mutation ID after an uncertain failure", async () => {
    mockedListSessions.mockResolvedValue(page([]));
    mockedCreateSession
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(mutation("new-session", "Untitled Session"));
    renderLibrary();

    const createButton = await screen.findByRole("button", {
      name: "New session",
    });
    await userEvent.click(createButton);
    expect(await screen.findByText("connection lost")).toBeInTheDocument();
    await userEvent.click(createButton);

    expect(await screen.findByText("Playground")).toBeInTheDocument();
    expect(mockedCreateSession).toHaveBeenCalledTimes(2);
    expect(mockedCreateSession.mock.calls[0]?.[0]).toBe(
      mockedCreateSession.mock.calls[1]?.[0],
    );
  });

  it("reuses the caller-owned delete mutation ID after an uncertain failure", async () => {
    mockedListSessions.mockResolvedValue(page([summary("a", "Alpha")]));
    mockedDeleteSession
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(undefined);
    renderLibrary();

    await userEvent.click(
      await screen.findByRole("button", { name: "Actions for Alpha" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirmDelete = screen.getByRole("button", {
      name: "Delete session",
    });
    await userEvent.click(confirmDelete);
    expect(await screen.findByText("connection lost")).toBeInTheDocument();
    await userEvent.click(confirmDelete);

    await waitFor(() =>
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument(),
    );
    expect(mockedDeleteSession).toHaveBeenCalledTimes(2);
    expect(mockedDeleteSession.mock.calls[0]?.[2]).toBe(
      mockedDeleteSession.mock.calls[1]?.[2],
    );
  });

  it("reuses the caller-owned rename mutation ID after an uncertain failure", async () => {
    mockedListSessions.mockResolvedValue(page([summary("a", "Alpha")]));
    mockedPatchSession
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(mutation("a", "Renamed"));
    renderLibrary();

    await userEvent.click(
      await screen.findByRole("button", { name: "Actions for Alpha" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "New session name" });
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed");
    const saveButton = screen.getByRole("button", { name: "Save name" });
    await userEvent.click(saveButton);
    expect(await screen.findByText("connection lost")).toBeInTheDocument();
    await userEvent.click(saveButton);

    await waitFor(() => expect(mockedPatchSession).toHaveBeenCalledTimes(2));
    expect(mockedPatchSession.mock.calls[0]?.[1].mutation_id).toBe(
      mockedPatchSession.mock.calls[1]?.[1].mutation_id,
    );
  });

  it("traps rename-dialog focus and restores it to the session actions button", async () => {
    mockedListSessions.mockResolvedValue(page([summary("a", "Alpha")]));
    renderLibrary();
    const user = userEvent.setup();
    const actions = await screen.findByRole("button", {
      name: "Actions for Alpha",
    });

    await user.click(actions);
    await user.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "New session name" });
    expect(input).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Save name" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(actions).toHaveFocus();
  });

  it("traps delete-dialog focus and restores it to the session actions button", async () => {
    mockedListSessions.mockResolvedValue(page([summary("a", "Alpha")]));
    renderLibrary();
    const user = userEvent.setup();
    const actions = await screen.findByRole("button", {
      name: "Actions for Alpha",
    });

    await user.click(actions);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveFocus();

    await user.tab({ shift: true });
    expect(
      screen.getByRole("button", { name: "Delete session" }),
    ).toHaveFocus();

    await user.click(cancel);
    expect(actions).toHaveFocus();
  });
});
