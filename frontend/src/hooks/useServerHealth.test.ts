import { act, renderHook, waitFor } from "@testing-library/react";
import { checkHealth } from "../lib/api";
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
});
