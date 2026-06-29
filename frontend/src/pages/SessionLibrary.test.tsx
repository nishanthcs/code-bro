import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { ThemeProvider } from "../components/ThemeProvider";
import {
  createSession,
  deleteSession,
  getAppSettings,
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
    getAppSettings: vi.fn(),
    listSessions: vi.fn(),
    patchSession: vi.fn(),
  };
});

const mockedCreateSession = vi.mocked(createSession);
const mockedDeleteSession = vi.mocked(deleteSession);
const mockedGetAppSettings = vi.mocked(getAppSettings);
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

function makeSummary(
  id: string,
  name: string,
  {
    createdAt = "2026-06-20T00:00:00Z",
    updatedAt = "2026-06-20T00:00:00Z",
    tags = [],
    refUrl = null,
  }: {
    createdAt?: string;
    updatedAt?: string;
    tags?: string[];
    refUrl?: string | null;
  } = {},
): SessionSummary {
  return {
    id,
    name,
    code_preview: `print("${name}")`,
    tags,
    revision: 1,
    created_at: createdAt,
    updated_at: updatedAt,
    ref_url: refUrl,
  };
}

function resource(id: string, name: string): SessionResource {
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

function mutation(id: string, name: string): MutationResponse {
  return {
    session: resource(id, name),
    mutation: {
      mutation_id: "receipt",
      applied_revision: 1,
      duplicate: false,
      superseded: false,
      auto_tags_added: [],
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
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 760,
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 0,
    });
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    mockedCreateSession.mockReset();
    mockedDeleteSession.mockReset();
    mockedGetAppSettings.mockReset();
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
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Search sessions by name or tag",
      }),
      {
        target: { value: "current" },
      },
    );
    await waitFor(() => expect(firstSignal?.aborted).toBe(true));
    await waitFor(() => expect(mockedListSessions).toHaveBeenCalledTimes(2));

    act(() => {
      second.resolve(page([makeSummary("current", "Current")]));
      first.resolve(page([makeSummary("stale", "Stale")]));
    });

    expect(await screen.findByText("Current")).toBeInTheDocument();
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
  });

  it("deduplicates page items and refuses duplicate cursor requests", async () => {
    const nextPage = deferred<SessionListResponse>();
    mockedListSessions
      .mockResolvedValueOnce(page([makeSummary("a", "Alpha")], "cursor-1"))
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
    expect(mockedListSessions).toHaveBeenCalledTimes(1);

    fireEvent.wheel(window, { deltaY: 120 });
    await waitFor(() => expect(mockedListSessions).toHaveBeenCalledTimes(2));
    expect(mockedListSessions).toHaveBeenLastCalledWith(
      "",
      "cursor-1",
      expect.any(AbortSignal),
      {
        limit: 5,
        sort: "updated_desc",
        updatedAfter: null,
        updatedBefore: null,
      },
    );

    act(() => {
      nextPage.resolve(
        page(
          [makeSummary("a", "Alpha"), makeSummary("b", "Beta")],
          "cursor-1",
        ),
      );
    });
    expect(await screen.findByText("Beta")).toBeInTheDocument();
    expect(screen.getAllByText("Alpha")).toHaveLength(1);

    act(() => observer.trigger());
    expect(mockedListSessions).toHaveBeenCalledTimes(2);
  });

  it("renders a searchable list and reloads for ordering and date filters", async () => {
    mockedListSessions.mockResolvedValue(
      page([
        makeSummary("a", "Alpha", { tags: ["Algorithms"] }),
        makeSummary("b", "Bravo", {
          createdAt: "2026-05-01T00:00:00Z",
          updatedAt: "2026-06-19T00:00:00Z",
        }),
      ]),
    );
    renderLibrary();

    expect(
      await screen.findByRole("heading", { name: "Sessions" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Pick up where you left off."),
    ).not.toBeInTheDocument();
    await screen.findByText("Alpha");
    expect(screen.getByRole("table", { name: "Sessions" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Updated" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Created" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tags: Algorithms")).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Order sessions" }),
      "updated_asc",
    );
    await waitFor(() =>
      expect(mockedListSessions).toHaveBeenLastCalledWith(
        "",
        null,
        expect.any(AbortSignal),
        {
          limit: 5,
          sort: "updated_asc",
          updatedAfter: null,
          updatedBefore: null,
        },
      ),
    );

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Filter by updated date" }),
      "7d",
    );
    await waitFor(() =>
      expect(mockedListSessions).toHaveBeenLastCalledWith(
        "",
        null,
        expect.any(AbortSignal),
        {
          limit: 5,
          sort: "updated_asc",
          updatedAfter: expect.stringMatching(/Z$/),
          updatedBefore: null,
        },
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear dates" }));
    fireEvent.change(screen.getByLabelText("Updated from date"), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(screen.getByLabelText("Updated to date"), {
      target: { value: "2026-06-20" },
    });
    await waitFor(() =>
      expect(mockedListSessions).toHaveBeenLastCalledWith(
        "",
        null,
        expect.any(AbortSignal),
        {
          limit: 5,
          sort: "updated_asc",
          updatedAfter: expect.any(String),
          updatedBefore: expect.any(String),
        },
      ),
    );
  });

  it("opens a shortened reference link without navigating to the session", async () => {
    mockedListSessions.mockResolvedValue(
      page([
        makeSummary("a", "Alpha", {
          refUrl: "https://www.example.com/docs/reference",
        }),
      ]),
    );
    const router = renderLibrary();

    const reference = await screen.findByRole("link", {
      name: "Reference: https://www.example.com/docs/reference",
    });
    expect(reference).toHaveTextContent("Reference · example.com/docs/reference");
    expect(reference).toHaveAttribute("target", "_blank");
    expect(reference).toHaveAttribute("rel", "noopener noreferrer");
    expect(router.state.location.pathname).toBe("/");
  });

  it("shows the current data path in a read-only settings panel", async () => {
    mockedListSessions.mockResolvedValue(page([]));
    mockedGetAppSettings.mockResolvedValue({
      data_path:
        "/Users/example/Library/Application Support/CodeBro/codebro.sqlite3",
    });
    renderLibrary();

    await userEvent.click(
      screen.getByRole("button", { name: "Settings" }),
    );

    const path = await screen.findByRole("textbox", {
      name: "Data storage path",
    });
    expect(path).toHaveValue(
      "/Users/example/Library/Application Support/CodeBro/codebro.sqlite3",
    );
    expect(path).toHaveAttribute("readonly");
    expect(mockedGetAppSettings).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.queryByRole("dialog", { name: "Data storage" }),
    ).not.toBeInTheDocument();
  });

  it("reuses the caller-owned create mutation ID after an uncertain failure", async () => {
    mockedListSessions.mockResolvedValue(page([]));
    mockedCreateSession
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(mutation("new-session", "Untitled Session"));
    const router = renderLibrary();

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
    expect(router.state.location.state).toEqual({
      focusSessionName: true,
    });
  });

  it("supports keyboard shortcuts for search and new sessions", async () => {
    mockedListSessions.mockResolvedValue(page([]));
    mockedCreateSession.mockResolvedValue(
      mutation("keyboard-session", "Untitled Session"),
    );
    renderLibrary();

    const search = await screen.findByRole("textbox", {
      name: "Search sessions by name or tag",
    });
    fireEvent.keyDown(window, { key: "/" });
    expect(search).toHaveFocus();

    search.blur();
    fireEvent.keyDown(window, { key: "n" });
    expect(await screen.findByText("Playground")).toBeInTheDocument();
    expect(mockedCreateSession).toHaveBeenCalledOnce();
  });

  it("reuses the caller-owned delete mutation ID after an uncertain failure", async () => {
    mockedListSessions.mockResolvedValue(page([makeSummary("a", "Alpha")]));
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
    mockedListSessions.mockResolvedValue(page([makeSummary("a", "Alpha")]));
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
    mockedListSessions.mockResolvedValue(page([makeSummary("a", "Alpha")]));
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
    mockedListSessions.mockResolvedValue(page([makeSummary("a", "Alpha")]));
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

  it("does not render checkbox header when there are no sessions", async () => {
    mockedListSessions.mockResolvedValue(page([]));
    renderLibrary();

    await waitFor(() => expect(mockedListSessions).toHaveBeenCalled());

    expect(
      screen.queryByRole("checkbox", { name: "Select all sessions" }),
    ).not.toBeInTheDocument();
  });

  it("properly handles checkbox selection with multiple sessions", async () => {
    mockedListSessions.mockResolvedValue(
      page([
        makeSummary("a", "Alpha"),
        makeSummary("b", "Bravo"),
      ]),
    );
    renderLibrary();

    await screen.findByText("Alpha");

    const selectAllCheckbox = screen.getByRole("checkbox", {
      name: "Select all sessions",
    });
    expect(selectAllCheckbox).not.toBeChecked();

    const firstSessionCheckbox = screen.getByRole("checkbox", {
      name: "Select session Alpha",
    });
    await userEvent.click(firstSessionCheckbox);
    expect(selectAllCheckbox).not.toBeChecked();

    const secondSessionCheckbox = screen.getByRole("checkbox", {
      name: "Select session Bravo",
    });
    await userEvent.click(secondSessionCheckbox);
    expect(selectAllCheckbox).toBeChecked();

    await userEvent.click(firstSessionCheckbox);
    expect(selectAllCheckbox).not.toBeChecked();
  });

  it("keeps failed bulk deletions visible and selected", async () => {
    mockedListSessions.mockResolvedValue(
      page([
        makeSummary("a", "Alpha"),
        makeSummary("b", "Bravo"),
      ]),
    );
    mockedDeleteSession
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("connection lost"));
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderLibrary();

    await screen.findByText("Alpha");
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select all sessions" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete Selected" }),
    );

    await waitFor(() =>
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Select session Bravo" }),
    ).toBeChecked();
    expect(
      screen.getByText("Some sessions could not be deleted. 1 failed."),
    ).toBeInTheDocument();
  });

  it("reuses a bulk-delete mutation ID after an uncertain failure", async () => {
    mockedListSessions.mockResolvedValue(page([makeSummary("a", "Alpha")]));
    mockedDeleteSession
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(undefined);
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderLibrary();

    await screen.findByText("Alpha");
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select session Alpha" }),
    );
    const deleteSelected = screen.getByRole("button", {
      name: "Delete Selected",
    });
    await userEvent.click(deleteSelected);
    expect(await screen.findByText(/1 failed/)).toBeInTheDocument();
    await userEvent.click(deleteSelected);

    await waitFor(() => expect(mockedDeleteSession).toHaveBeenCalledTimes(2));
    expect(mockedDeleteSession.mock.calls[0]?.[2]).toBe(
      mockedDeleteSession.mock.calls[1]?.[2],
    );
    await waitFor(() =>
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument(),
    );
  });

  it("clears selection when search results are replaced", async () => {
    mockedListSessions
      .mockResolvedValueOnce(page([makeSummary("a", "Alpha")]))
      .mockResolvedValueOnce(page([makeSummary("b", "Bravo")]));
    renderLibrary();

    await screen.findByText("Alpha");
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select session Alpha" }),
    );
    expect(screen.getByText("1 session(s) selected")).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole("textbox", {
        name: "Search sessions by name or tag",
      }),
      "bravo",
    );

    await screen.findByText("Bravo");
    expect(
      screen.queryByText("1 session(s) selected"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Select session Bravo" }),
    ).not.toBeChecked();
  });
});
