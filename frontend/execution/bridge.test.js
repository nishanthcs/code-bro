// @vitest-environment jsdom

class FakeWorker extends EventTarget {
  static instances = [];

  constructor() {
    super();
    this.messages = [];
    this.terminated = false;
    FakeWorker.instances.push(this);
  }

  postMessage(message) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  emitMessage(data) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

describe("execution bridge recovery", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("recovers initialization stalls and uses a fresh worker after every terminal run state", async () => {
    vi.useFakeTimers();
    FakeWorker.instances = [];
    window.history.replaceState(
      {},
      "",
      "/?parentOrigin=http%3A%2F%2F127.0.0.1%3A5173",
    );
    vi.stubGlobal("Worker", FakeWorker);
    const parentPostMessage = vi
      .spyOn(window.parent, "postMessage")
      .mockImplementation(() => undefined);

    await import("./bridge.js?bridge-recovery-test");

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: { type: "initialize" },
      }),
    );
    const firstWorker = FakeWorker.instances[0];
    await vi.advanceTimersByTimeAsync(29_999);
    expect(firstWorker.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(firstWorker.terminated).toBe(true);
    expect(parentPostMessage).toHaveBeenCalledWith(
      {
        type: "initialization_failed",
        message:
          "Python initialization timed out. Retrying with a fresh worker.",
      },
      "http://127.0.0.1:5173",
    );
    expect(FakeWorker.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    const secondWorker = FakeWorker.instances[1];
    secondWorker.emitMessage({ type: "ready" });

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: {
          type: "run",
          runId: "run-timeout",
          code: "while True: pass",
          stdin: "",
        },
      }),
    );
    expect(secondWorker.messages).toEqual([
      {
        type: "run",
        runId: "run-timeout",
        code: "while True: pass",
        stdin: "",
      },
    ]);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(secondWorker.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(secondWorker.terminated).toBe(true);
    expect(parentPostMessage).toHaveBeenCalledWith(
      { type: "timed-out", runId: "run-timeout" },
      "http://127.0.0.1:5173",
    );

    const thirdWorker = FakeWorker.instances[2];
    thirdWorker.emitMessage({ type: "ready" });
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: { type: "run", runId: "run-stop", code: "print(1)", stdin: "" },
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: { type: "stop", runId: "run-stop" },
      }),
    );
    expect(thirdWorker.terminated).toBe(true);
    expect(parentPostMessage).toHaveBeenCalledWith(
      { type: "stopped", runId: "run-stop" },
      "http://127.0.0.1:5173",
    );

    const fourthWorker = FakeWorker.instances[3];
    fourthWorker.emitMessage({ type: "ready" });
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: {
          type: "run",
          runId: "run-complete",
          code: "print(2)",
          stdin: "",
        },
      }),
    );
    fourthWorker.emitMessage({
      type: "output",
      runId: "run-complete",
      fragments: [{ sequence: 0, stream: "stdout", text: "2\n" }],
    });
    fourthWorker.emitMessage({
      type: "completed",
      runId: "run-complete",
      durationMs: 3,
    });
    expect(fourthWorker.terminated).toBe(true);
    expect(parentPostMessage).toHaveBeenCalledWith(
      {
        type: "completed",
        runId: "run-complete",
        durationMs: 3,
      },
      "http://127.0.0.1:5173",
    );

    const fifthWorker = FakeWorker.instances[4];
    fifthWorker.emitMessage({ type: "ready" });
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: {
          type: "run",
          runId: "run-crash",
          code: "print(3)",
          stdin: "",
        },
      }),
    );
    fifthWorker.dispatchEvent(
      new ErrorEvent("error", { message: "Worker process crashed" }),
    );
    expect(fifthWorker.terminated).toBe(true);
    expect(parentPostMessage).toHaveBeenCalledWith(
      {
        type: "failed",
        runId: "run-crash",
        traceback: "Worker process crashed",
      },
      "http://127.0.0.1:5173",
    );
    expect(FakeWorker.instances).toHaveLength(5);
    await vi.advanceTimersByTimeAsync(1_000);

    const sixthWorker = FakeWorker.instances[5];
    sixthWorker.emitMessage({
      type: "initialization_failed",
      message: "Pyodide could not initialize",
    });
    expect(sixthWorker.terminated).toBe(true);
    expect(parentPostMessage).toHaveBeenCalledWith(
      {
        type: "initialization_failed",
        message: "Pyodide could not initialize",
      },
      "http://127.0.0.1:5173",
    );
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeWorker.instances).toHaveLength(7);

    expect(
      FakeWorker.instances.slice(1, 5).map((instance) => instance.messages),
    ).toEqual([
      [
        {
          type: "run",
          runId: "run-timeout",
          code: "while True: pass",
          stdin: "",
        },
      ],
      [
        {
          type: "run",
          runId: "run-stop",
          code: "print(1)",
          stdin: "",
        },
      ],
      [
        {
          type: "run",
          runId: "run-complete",
          code: "print(2)",
          stdin: "",
        },
      ],
      [
        {
          type: "run",
          runId: "run-crash",
          code: "print(3)",
          stdin: "",
        },
      ],
    ]);
  });
});
