import { getSession } from "./api";
import {
  SERVER_AVAILABLE_EVENT,
  SERVER_UNAVAILABLE_EVENT,
} from "./serverHealthEvents";

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

  it("reports failed and successful ordinary requests", async () => {
    const unavailable = vi.fn();
    const available = vi.fn();
    window.addEventListener(SERVER_UNAVAILABLE_EVENT, unavailable);
    window.addEventListener(SERVER_AVAILABLE_EVENT, available);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSession("session-1")).rejects.toThrow("Failed to fetch");
    await expect(getSession("session-1")).resolves.toEqual({ status: "ok" });

    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(available).toHaveBeenCalledTimes(1);
    window.removeEventListener(SERVER_UNAVAILABLE_EVENT, unavailable);
    window.removeEventListener(SERVER_AVAILABLE_EVENT, available);
  });
});
