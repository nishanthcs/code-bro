import { act, renderHook, waitFor } from "@testing-library/react";
import { checkHealth } from "../lib/api";
import {
  SERVER_AVAILABLE_EVENT,
  SERVER_UNAVAILABLE_EVENT,
} from "../lib/serverHealthEvents";
import { useServerHealth } from "./useServerHealth";

vi.mock("../lib/api", () => ({
  checkHealth: vi.fn(),
}));

const mockedCheckHealth = vi.mocked(checkHealth);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useServerHealth", () => {
  beforeEach(() => {
    mockedCheckHealth.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts older checks and ignores their stale results", async () => {
    const first = deferred<{ status: string }>();
    const second = deferred<{ status: string }>();
    mockedCheckHealth
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useServerHealth());

    await waitFor(() => expect(mockedCheckHealth).toHaveBeenCalledTimes(1));
    const firstSignal = mockedCheckHealth.mock.calls[0]?.[0];
    let secondCheck!: Promise<void>;
    act(() => {
      secondCheck = result.current.check();
    });
    await waitFor(() => expect(mockedCheckHealth).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);

    act(() => second.reject(new Error("offline")));
    await secondCheck;
    await waitFor(() => expect(result.current.health).toBe("offline"));

    act(() => first.resolve({ status: "ok" }));
    await first.promise;
    expect(result.current.health).toBe("offline");
  });

  it("aborts the active check on unmount", async () => {
    const pending = deferred<{ status: string }>();
    mockedCheckHealth.mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useServerHealth());

    await waitFor(() => expect(mockedCheckHealth).toHaveBeenCalled());
    const signal = mockedCheckHealth.mock.calls[0]?.[0];
    unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("does not poll while online and retries every 30 seconds while offline", async () => {
    vi.useFakeTimers();
    mockedCheckHealth.mockResolvedValue({ status: "ok" });
    const { result } = renderHook(() => useServerHealth());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockedCheckHealth).toHaveBeenCalledTimes(1);
    expect(result.current.health).toBe("online");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mockedCheckHealth).toHaveBeenCalledTimes(1);

    act(() => window.dispatchEvent(new Event(SERVER_UNAVAILABLE_EVENT)));
    expect(result.current.health).toBe("offline");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mockedCheckHealth).toHaveBeenCalledTimes(2);
    expect(result.current.health).toBe("online");
  });

  it("tracks ordinary API availability events", async () => {
    mockedCheckHealth.mockResolvedValue({ status: "ok" });
    const { result } = renderHook(() => useServerHealth());
    await waitFor(() => expect(result.current.health).toBe("online"));

    act(() => window.dispatchEvent(new Event(SERVER_UNAVAILABLE_EVENT)));
    expect(result.current.health).toBe("offline");

    act(() => window.dispatchEvent(new Event(SERVER_AVAILABLE_EVENT)));
    expect(result.current.health).toBe("online");
  });
});
