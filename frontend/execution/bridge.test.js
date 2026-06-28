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

  it("announces readiness and replies to duplicate initialize messages", async () => {
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

    await import("./bridge.js?bridge-ready-handshake-test");

    expect(parentPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "bridge-ready" }),
      "http://127.0.0.1:5173",
    );

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: { type: "initialize" },
      }),
    );
    const firstWorker = FakeWorker.instances[0];
    firstWorker.emitMessage({ type: "ready" });

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: { type: "initialize" },
      }),
    );

    const readyPosts = parentPostMessage.mock.calls.filter(
      ([message]) => message.type === "ready",
    );
    expect(readyPosts).toHaveLength(2);
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("keeps debug pauses interactive and reports ready after debug completion", async () => {
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

    await import("./bridge.js?bridge-debug-lifecycle-test");

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: { type: "initialize" },
      }),
    );
    const normalWorker = FakeWorker.instances[0];
    normalWorker.emitMessage({ type: "ready" });

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: {
          type: "debug-start",
          debugId: "debug-1",
          code: "x = 1\nprint(x)",
          stdin: "",
          breakpoints: [2],
        },
      }),
    );
    const debugWorker = FakeWorker.instances[1];
    debugWorker.emitMessage({ type: "ready" });
    expect(debugWorker.messages).toHaveLength(1);
    expect(debugWorker.messages[0]).toMatchObject({
      type: "run",
      runId: "debug-1",
      code: "x = 1\nprint(x)",
      stdin: "",
      debug: true,
      breakpoints: [2],
    });
    expect(debugWorker.messages[0].sab).toBeInstanceOf(SharedArrayBuffer);

    debugWorker.emitMessage({
      type: "debug-paused",
      runId: "debug-1",
      pauseId: 1,
      reason: "entry",
      location: { file: "main.py", line: 1 },
      stack: [],
      scopes: [],
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(parentPostMessage).not.toHaveBeenCalledWith(
      { type: "timed-out", runId: "debug-1" },
      "http://127.0.0.1:5173",
    );

    debugWorker.emitMessage({
      type: "completed",
      runId: "debug-1",
      durationMs: 24,
    });
    expect(debugWorker.terminated).toBe(true);
    expect(parentPostMessage).toHaveBeenCalledWith(
      { type: "completed", runId: "debug-1", durationMs: 24 },
      "http://127.0.0.1:5173",
    );
    expect(parentPostMessage).toHaveBeenCalledWith(
      { type: "ready" },
      "http://127.0.0.1:5173",
    );
  });

  it("terminates an active debug session when Stop Debug is requested", async () => {
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

    await import("./bridge.js?bridge-debug-stop-test");

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: { type: "initialize" },
      }),
    );
    FakeWorker.instances[0].emitMessage({ type: "ready" });

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: {
          type: "debug-start",
          debugId: "debug-stop",
          code: "while True:\n    pass",
          stdin: "",
          breakpoints: [],
        },
      }),
    );
    const debugWorker = FakeWorker.instances[1];
    debugWorker.emitMessage({ type: "ready" });
    debugWorker.emitMessage({
      type: "debug-paused",
      runId: "debug-stop",
      pauseId: 1,
      reason: "entry",
      location: { file: "main.py", line: 1 },
      stack: [],
      scopes: [],
    });

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: {
          type: "debug-stop",
          debugId: "debug-stop",
        },
      }),
    );

    expect(debugWorker.terminated).toBe(true);
    expect(parentPostMessage).toHaveBeenCalledWith(
      { type: "stopped", runId: "debug-stop", workerReady: true },
      "http://127.0.0.1:5173",
    );
    expect(parentPostMessage).toHaveBeenCalledWith(
      { type: "ready" },
      "http://127.0.0.1:5173",
    );
  });

  it("reports ready again when debug cannot allocate a SharedArrayBuffer", async () => {
    vi.useFakeTimers();
    FakeWorker.instances = [];
    window.history.replaceState(
      {},
      "",
      "/?parentOrigin=http%3A%2F%2F127.0.0.1%3A5173",
    );
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal("SharedArrayBuffer", undefined);
    const parentPostMessage = vi
      .spyOn(window.parent, "postMessage")
      .mockImplementation(() => undefined);

    await import("./bridge.js?bridge-debug-sab-failure-test");

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: { type: "initialize" },
      }),
    );
    FakeWorker.instances[0].emitMessage({ type: "ready" });

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: {
          type: "debug-start",
          debugId: "debug-no-sab",
          code: "print(1)",
          stdin: "",
          breakpoints: [],
        },
      }),
    );

    expect(parentPostMessage).toHaveBeenCalledWith(
      {
        type: "failed",
        runId: "debug-no-sab",
        traceback:
          "SharedArrayBuffer is not available. Please ensure cross-origin isolation is enabled (COOP/COEP headers).",
      },
      "http://127.0.0.1:5173",
    );
    expect(parentPostMessage).toHaveBeenCalledWith(
      { type: "ready" },
      "http://127.0.0.1:5173",
    );
  });

  it("writes debugger payload commands into the shared command buffer", async () => {
    vi.useFakeTimers();
    FakeWorker.instances = [];
    window.history.replaceState(
      {},
      "",
      "/?parentOrigin=http%3A%2F%2F127.0.0.1%3A5173",
    );
    vi.stubGlobal("Worker", FakeWorker);
    vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    await import("./bridge.js?bridge-debug-command-payload-test");

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: { type: "initialize" },
      }),
    );
    FakeWorker.instances[0].emitMessage({ type: "ready" });

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: {
          type: "debug-start",
          debugId: "debug-payload",
          code: "x = 1",
          stdin: "",
          breakpoints: [],
        },
      }),
    );
    const debugWorker = FakeWorker.instances[1];
    debugWorker.emitMessage({ type: "ready" });
    debugWorker.emitMessage({
      type: "debug-paused",
      runId: "debug-payload",
      pauseId: 1,
      reason: "entry",
      location: { file: "main.py", line: 1 },
      stack: [],
      scopes: [],
    });

    const sab = debugWorker.messages[0].sab;
    const view = new Int32Array(sab);
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:5173",
        source: window.parent,
        data: {
          type: "debug-command",
          debugId: "debug-payload",
          commandId: "command-1",
          command: {
            type: "set-variable",
            pauseId: "1",
            frameId: "frame-1",
            scope: "local",
            name: "x",
            literal: "40",
          },
        },
      }),
    );

    expect(Atomics.load(view, 0)).toBe(7);
    const payloadLength = Atomics.load(view, 4);
    const payload = Array.from({ length: payloadLength }, (_, index) =>
      String.fromCharCode(Atomics.load(view, 8 + index)),
    ).join("");
    expect(JSON.parse(payload)).toEqual({
      type: "set-variable",
      pauseId: "1",
      frameId: "frame-1",
      scope: "local",
      name: "x",
      literal: "40",
      commandId: "command-1",
    });
  });
});
