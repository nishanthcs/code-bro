import { act, renderHook } from "@testing-library/react";
import { useExecution } from "./useExecution";

vi.mock("../lib/bootstrap", () => ({
  bootstrap: {
    executionOrigin: "http://127.0.0.1:8766",
  },
}));

describe("useExecution", () => {
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
});
