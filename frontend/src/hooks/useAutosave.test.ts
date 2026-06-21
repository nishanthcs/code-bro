import { act, renderHook, waitFor } from "@testing-library/react";
import { ApiError, patchSession } from "../lib/api";
import type { MutationResponse, SessionResource } from "../types";
import { useAutosave } from "./useAutosave";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    patchSession: vi.fn(),
  };
});

const mockedPatchSession = vi.mocked(patchSession);

function session(
  code: string,
  revision = 1,
): SessionResource {
  return {
    id: "session-1",
    name: "Draft",
    code,
    tags: [],
    revision,
    created_at: "2026-06-20T00:00:00Z",
    updated_at: "2026-06-20T00:00:00Z",
    ref_url: null,
    notes_markdown: "",
  };
}

function response(
  resource: SessionResource,
  autoTagsAdded: string[] = [],
): MutationResponse {
  return {
    session: resource,
    mutation: {
      mutation_id: "mutation",
      applied_revision: resource.revision,
      duplicate: false,
      superseded: false,
      auto_tags_added: autoTagsAdded,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useAutosave", () => {
  beforeEach(() => {
    mockedPatchSession.mockReset();
  });

  it("drains edits made while an earlier save is in flight", async () => {
    const first = deferred<MutationResponse>();
    const second = deferred<MutationResponse>();
    mockedPatchSession
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useAutosave(session("first")));

    act(() => {
      result.current.setDraft((current) => ({ ...current, code: "second" }));
    });
    let savePromise!: Promise<boolean>;
    act(() => {
      savePromise = result.current.saveNow();
    });

    await waitFor(() => expect(mockedPatchSession).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.setDraft((current) => ({ ...current, code: "third" }));
      first.resolve(response(session("second", 2)));
    });

    await waitFor(() => expect(mockedPatchSession).toHaveBeenCalledTimes(2));
    expect(mockedPatchSession.mock.calls[1]?.[1]).toMatchObject({
      code: "third",
      expected_revision: 2,
    });

    await act(async () => {
      second.resolve(response(session("third", 3)));
      await savePromise;
    });
    expect(result.current.draft.code).toBe("third");
    expect(result.current.status).toBe("saved");
  });

  it("stays navigation-dirty when an in-flight edit is reverted", async () => {
    const first = deferred<MutationResponse>();
    const second = deferred<MutationResponse>();
    mockedPatchSession
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useAutosave(session("first")));

    act(() => {
      result.current.setDraft((current) => ({ ...current, code: "second" }));
    });
    let savePromise!: Promise<boolean>;
    act(() => {
      savePromise = result.current.saveNow();
    });
    await waitFor(() => expect(mockedPatchSession).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setDraft((current) => ({ ...current, code: "first" }));
    });
    await waitFor(() => expect(result.current.isDirty).toBe(true));

    act(() => {
      first.resolve(response(session("second", 2)));
    });
    await waitFor(() => expect(mockedPatchSession).toHaveBeenCalledTimes(2));
    expect(result.current.isDirty).toBe(true);
    expect(mockedPatchSession.mock.calls[1]?.[1]).toMatchObject({
      code: "first",
      expected_revision: 2,
    });

    await act(async () => {
      second.resolve(response(session("first", 3)));
      await savePromise;
    });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.status).toBe("saved");
  });

  it("drops a terminally rejected mutation before saving a corrected edit", async () => {
    mockedPatchSession
      .mockRejectedValueOnce(
        new ApiError(422, {
          error: {
            code: "validation_error",
            message: "The session was invalid.",
            details: {},
          },
        }),
      )
      .mockResolvedValueOnce(response(session("corrected", 2)));
    const { result } = renderHook(() => useAutosave(session("first")));

    act(() => {
      result.current.setDraft((current) => ({ ...current, code: "rejected" }));
    });
    await act(async () => {
      await result.current.saveNow();
    });
    expect(result.current.status).toBe("failed");
    const rejectedMutationId =
      mockedPatchSession.mock.calls[0]?.[1].mutation_id;

    act(() => {
      result.current.setDraft((current) => ({ ...current, code: "corrected" }));
    });
    expect(result.current.status).toBe("scheduled");
    await act(async () => {
      await result.current.saveNow();
    });

    expect(mockedPatchSession).toHaveBeenCalledTimes(2);
    expect(mockedPatchSession.mock.calls[1]?.[1]).toMatchObject({
      code: "corrected",
      expected_revision: 1,
    });
    expect(mockedPatchSession.mock.calls[1]?.[1].mutation_id).not.toBe(
      rejectedMutationId,
    );
    expect(result.current.status).toBe("saved");
  });

  it("persists tag-only changes", async () => {
    mockedPatchSession.mockResolvedValue(
      response({ ...session("first", 2), tags: ["Python"] }),
    );
    const { result } = renderHook(() => useAutosave(session("first")));

    act(() => {
      result.current.setDraft((current) => ({
        ...current,
        tags: ["Python"],
      }));
    });
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await result.current.saveNow();
    });

    expect(mockedPatchSession).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        tags: ["Python"],
        expected_revision: 1,
      }),
      expect.any(AbortSignal),
    );
    expect(result.current.isDirty).toBe(false);
    expect(result.current.status).toBe("saved");
  });

  it("persists metadata-only changes and clears them explicitly", async () => {
    const saved = {
      ...session("first", 2),
      ref_url: "https://example.com/docs",
      notes_markdown: "# Notes",
    };
    mockedPatchSession.mockResolvedValue(response(saved));
    const { result } = renderHook(() => useAutosave(session("first")));

    act(() => {
      result.current.setDraft((current) => ({
        ...current,
        ref_url: "https://example.com/docs",
        notes_markdown: "# Notes",
      }));
    });
    await act(async () => {
      await result.current.saveNow();
    });

    expect(mockedPatchSession.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        ref_url: "https://example.com/docs",
        notes_markdown: "# Notes",
        auto_tag_if_empty: true,
        expected_revision: 1,
      }),
    );
    expect(mockedPatchSession.mock.calls[0]?.[1]).not.toHaveProperty("code");
    expect(result.current.isDirty).toBe(false);
  });

  it("forces a clean enrichment save when explicitly requested", async () => {
    const tagged = { ...session("value = 1", 2), tags: ["Python"] };
    mockedPatchSession.mockResolvedValue(response(tagged, ["Python"]));
    const { result } = renderHook(() => useAutosave(session("value = 1")));

    await act(async () => {
      await result.current.saveNow(true);
    });

    expect(mockedPatchSession.mock.calls[0]?.[1]).toEqual({
      auto_tag_if_empty: true,
      expected_revision: 1,
      mutation_id: expect.any(String),
    });
    expect(result.current.draft.tags).toEqual(["Python"]);
  });

  it("does not overwrite newer manual tags with returned automatic tags", async () => {
    const first = deferred<MutationResponse>();
    const second = deferred<MutationResponse>();
    mockedPatchSession
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useAutosave(session("first")));

    act(() => {
      result.current.setDraft((current) => ({ ...current, code: "second" }));
    });
    let savePromise!: Promise<boolean>;
    act(() => {
      savePromise = result.current.saveNow();
    });
    await waitFor(() => expect(mockedPatchSession).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setDraft((current) => ({
        ...current,
        code: "third",
        tags: ["Manual"],
      }));
      first.resolve(
        response(
          { ...session("second", 2), tags: ["Python"] },
          ["Python"],
        ),
      );
    });

    await waitFor(() => expect(mockedPatchSession).toHaveBeenCalledTimes(2));
    expect(mockedPatchSession.mock.calls[1]?.[1]).toMatchObject({
      code: "third",
      tags: ["Manual"],
      expected_revision: 2,
    });

    await act(async () => {
      second.resolve(
        response({ ...session("third", 3), tags: ["Manual"] }),
      );
      await savePromise;
    });
    expect(result.current.draft.tags).toEqual(["Manual"]);
  });

  it("reuses a mutation ID after an uncertain failure", async () => {
    mockedPatchSession
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(response(session("second", 2)));
    const { result } = renderHook(() => useAutosave(session("first")));

    act(() => {
      result.current.setDraft((current) => ({ ...current, code: "second" }));
    });
    await act(async () => {
      await result.current.saveNow();
    });
    const firstMutationId = mockedPatchSession.mock.calls[0]?.[1].mutation_id;

    await act(async () => {
      await result.current.saveNow();
    });
    expect(mockedPatchSession.mock.calls[1]?.[1].mutation_id).toBe(
      firstMutationId,
    );
  });

  it("cancels retry timers on unmount", async () => {
    vi.useFakeTimers();
    mockedPatchSession.mockRejectedValue(new Error("connection lost"));
    const { result, unmount } = renderHook(() => useAutosave(session("first")));

    act(() => {
      result.current.setDraft((current) => ({ ...current, code: "second" }));
    });
    await act(async () => {
      await result.current.saveNow();
    });
    expect(mockedPatchSession).toHaveBeenCalledTimes(1);

    unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockedPatchSession).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("aborts an active save when the draft is explicitly abandoned", async () => {
    let requestSignal: AbortSignal | undefined;
    mockedPatchSession.mockImplementation((_id, _payload, signal) => {
      requestSignal = signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    });
    const { result } = renderHook(() => useAutosave(session("first")));

    act(() => {
      result.current.setDraft((current) => ({ ...current, code: "second" }));
    });
    let savePromise!: Promise<boolean>;
    act(() => {
      savePromise = result.current.saveNow();
    });
    await waitFor(() => expect(requestSignal).toBeDefined());

    act(() => result.current.abandon());

    expect(requestSignal?.aborted).toBe(true);
    await expect(savePromise).resolves.toBe(false);
  });
});
