import { act, renderHook } from "@testing-library/react";
import { useExecution } from "./useExecution";

vi.mock("../lib/bootstrap", () => ({
  bootstrap: {
    executionOrigin: "http://127.0.0.1:8766",
  },
}));

describe("useExecution", () => {
  it("initializes again when a fresh execution bridge announces itself", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const frameWindow = iframe.contentWindow;
    if (!frameWindow) throw new Error("Expected iframe contentWindow.");

    const postMessage = vi
      .spyOn(frameWindow, "postMessage")
      .mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() => useExecution());

    act(() => result.current.setFrameElement(iframe));
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "http://127.0.0.1:8766",
          source: frameWindow,
          data: { type: "bridge-ready", bridgeId: "bridge-1" },
        }),
      );
    });

    expect(result.current.status).toBe("loading");
    expect(result.current.workerReady).toBe(false);
    expect(postMessage).toHaveBeenLastCalledWith(
      { type: "initialize" },
      "http://127.0.0.1:8766",
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "http://127.0.0.1:8766",
          source: frameWindow,
          data: { type: "ready" },
        }),
      );
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.workerReady).toBe(true);

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "http://127.0.0.1:8766",
          source: frameWindow,
          data: { type: "bridge-ready", bridgeId: "bridge-2" },
        }),
      );
    });
    expect(result.current.status).toBe("loading");
    expect(result.current.workerReady).toBe(false);
    expect(postMessage).toHaveBeenLastCalledWith(
      { type: "initialize" },
      "http://127.0.0.1:8766",
    );

    unmount();
    iframe.remove();
  });

  it("coalesces adjacent streams in transport order without re-sorting output", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const frameWindow = iframe.contentWindow;
    if (!frameWindow) throw new Error("Expected iframe contentWindow.");

    const postMessage = vi
      .spyOn(frameWindow, "postMessage")
      .mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() => useExecution());

    act(() => result.current.setFrameElement(iframe));
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "http://127.0.0.1:8766",
          source: frameWindow,
          data: { type: "ready" },
        }),
      );
    });
    act(() => result.current.run("print('ok')", ""));

    const runMessage = postMessage.mock.calls.at(-1)?.[0];
    if (
      !runMessage ||
      typeof runMessage !== "object" ||
      !("runId" in runMessage) ||
      typeof runMessage.runId !== "string"
    ) {
      throw new Error("Expected a run message with a runId.");
    }

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "http://127.0.0.1:8766",
          source: frameWindow,
          data: {
            type: "output",
            runId: runMessage.runId,
            fragments: [{ sequence: 8, stream: "stdout", text: "first" }],
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "http://127.0.0.1:8766",
          source: frameWindow,
          data: {
            type: "output",
            runId: runMessage.runId,
            fragments: [{ sequence: 3, stream: "stdout", text: " second" }],
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "http://127.0.0.1:8766",
          source: frameWindow,
          data: {
            type: "output",
            runId: runMessage.runId,
            fragments: [{ sequence: 4, stream: "stderr", text: "third" }],
          },
        }),
      );
    });

    expect(result.current.output).toEqual([
      { sequence: 8, stream: "stdout", text: "first second" },
      { sequence: 4, stream: "stderr", text: "third" },
    ]);

    unmount();
    iframe.remove();
  });

  it("uses the dedicated debug-stop bridge message and recovers run readiness", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const frameWindow = iframe.contentWindow;
    if (!frameWindow) throw new Error("Expected iframe contentWindow.");

    const postMessage = vi
      .spyOn(frameWindow, "postMessage")
      .mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() => useExecution());

    act(() => result.current.setFrameElement(iframe));
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "http://127.0.0.1:8766",
          source: frameWindow,
          data: { type: "ready" },
        }),
      );
    });
    act(() => result.current.startDebug("x = 1", "", []));

    const debugStart = postMessage.mock.calls.at(-1)?.[0];
    if (
      !debugStart ||
      typeof debugStart !== "object" ||
      !("debugId" in debugStart) ||
      typeof debugStart.debugId !== "string"
    ) {
      throw new Error("Expected a debug-start message with a debugId.");
    }
    expect(result.current.status).toBe("debug-running");
    expect("commandBuffer" in debugStart).toBe(false);

    act(() => result.current.stop());

    expect(postMessage).toHaveBeenLastCalledWith(
      { type: "debug-stop", debugId: debugStart.debugId },
      "http://127.0.0.1:8766",
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "http://127.0.0.1:8766",
          source: frameWindow,
          data: {
            type: "stopped",
            runId: debugStart.debugId,
            workerReady: true,
          },
        }),
      );
    });

    expect(result.current.status).toBe("stopped");
    expect(result.current.workerReady).toBe(true);

    unmount();
    iframe.remove();
  });
});
