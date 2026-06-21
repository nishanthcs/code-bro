import { getSession } from "./api";

describe("API request timeouts", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("aborts a persistence request that does not settle", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener("abort", () => {
            reject(signal.reason);
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = getSession("session-1").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await result;
    const requestSignal = fetchMock.mock.calls[0]?.[1]?.signal;

    expect(requestSignal?.aborted).toBe(true);
    expect(error).toBeInstanceOf(DOMException);
    expect(error).toMatchObject({
      name: "TimeoutError",
      message: "Request timed out.",
    });
  });
});
