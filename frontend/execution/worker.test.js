import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TextDecoder, TextEncoder } from "node:util";

const workerSourcePath = resolve(process.cwd(), "execution", "worker.js");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function createWorkerHarness(runPythonAsync) {
  const source = (await readFile(workerSourcePath, "utf8")).replace(
    'import { loadPyodide } from "/pyodide/pyodide.mjs";',
    "",
  );
  const posted = [];
  const listeners = new Map();
  const timers = new Map();
  let nextTimerId = 1;
  const streams = {};
  const pyodide = {
    globals: {
      set: vi.fn(),
      delete: vi.fn(),
    },
    setStdout(options) {
      streams.stdout = options.write;
    },
    setStderr(options) {
      streams.stderr = options.write;
    },
    runPythonAsync: () => runPythonAsync(streams),
  };
  const workerSelf = {
    postMessage(message) {
      posted.push(message);
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
  const setTimeoutFake = (callback) => {
    const id = nextTimerId++;
    timers.set(id, callback);
    return id;
  };
  const clearTimeoutFake = (id) => {
    timers.delete(id);
  };
  const execute = new AsyncFunction(
    "loadPyodide",
    "self",
    "setTimeout",
    "clearTimeout",
    "TextEncoder",
    "TextDecoder",
    "performance",
    source,
  );

  await execute(
    async () => pyodide,
    workerSelf,
    setTimeoutFake,
    clearTimeoutFake,
    TextEncoder,
    TextDecoder,
    performance,
  );

  return {
    posted,
    timers,
    async run() {
      await listeners.get("message")({
        data: { type: "run", runId: "run-1", code: "", stdin: "" },
      });
    },
  };
}

describe("execution worker output batching", () => {
  it("coalesces adjacent tiny writes without changing stream order", async () => {
    const encoder = new TextEncoder();
    const harness = await createWorkerHarness(async (streams) => {
      for (let index = 0; index < 1_000; index += 1) {
        streams.stdout(encoder.encode("x"));
      }
      streams.stderr(encoder.encode("error"));
      streams.stderr(encoder.encode("!"));
    });

    await harness.run();

    const outputMessages = harness.posted.filter(
      (message) => message.type === "output",
    );
    expect(outputMessages).toHaveLength(1);
    expect(outputMessages[0].fragments).toEqual([
      { sequence: 0, stream: "stdout", text: "x".repeat(1_000) },
      { sequence: 1, stream: "stderr", text: "error!" },
    ]);
  });

  it("flushes a short fragment when the time batch expires", async () => {
    const encoder = new TextEncoder();
    let releaseRun;
    const runBlocked = new Promise((resolve) => {
      releaseRun = resolve;
    });
    const harness = await createWorkerHarness(async (streams) => {
      streams.stdout(encoder.encode("waiting"));
      await runBlocked;
    });

    const runPromise = harness.run();
    await Promise.resolve();
    expect(harness.timers.size).toBe(1);
    harness.timers.values().next().value();
    expect(
      harness.posted.filter((message) => message.type === "output"),
    ).toHaveLength(1);

    releaseRun();
    await runPromise;
  });

  it("flushes once pending UTF-8 output reaches the byte threshold", async () => {
    const encoder = new TextEncoder();
    let releaseRun;
    const runBlocked = new Promise((resolve) => {
      releaseRun = resolve;
    });
    const harness = await createWorkerHarness(async (streams) => {
      streams.stdout(encoder.encode("x".repeat(16 * 1024)));
      await runBlocked;
    });

    const runPromise = harness.run();
    await Promise.resolve();
    const outputMessages = harness.posted.filter(
      (message) => message.type === "output",
    );
    expect(outputMessages).toHaveLength(1);
    expect(outputMessages[0].fragments[0].text).toHaveLength(16 * 1024);

    releaseRun();
    await runPromise;
  });

  it("stops output that exceeds the UTF-8 byte limit", async () => {
    const encoder = new TextEncoder();
    const harness = await createWorkerHarness(async (streams) => {
      streams.stdout(encoder.encode("x".repeat(1024 * 1024 + 1)));
    });

    await harness.run();

    expect(
      harness.posted.filter((message) => message.type === "output"),
    ).toHaveLength(0);
    expect(
      harness.posted.filter((message) => message.type === "completed"),
    ).toHaveLength(0);
    expect(harness.posted.at(-1)).toMatchObject({
      type: "overflow",
      runId: "run-1",
    });
  });

  it("stops output that exceeds the newline limit", async () => {
    const encoder = new TextEncoder();
    const harness = await createWorkerHarness(async (streams) => {
      streams.stdout(encoder.encode("\n".repeat(10_001)));
    });

    await harness.run();

    expect(
      harness.posted.filter((message) => message.type === "output"),
    ).toHaveLength(0);
    expect(harness.posted.at(-1)).toMatchObject({
      type: "overflow",
      runId: "run-1",
    });
  });

  it("caps alternating stream fragments while preserving accepted order", async () => {
    const encoder = new TextEncoder();
    const harness = await createWorkerHarness(async (streams) => {
      for (let index = 0; index < 2_001; index += 1) {
        const stream = index % 2 === 0 ? streams.stdout : streams.stderr;
        stream(encoder.encode(String(index % 10)));
      }
    });

    await harness.run();

    const outputMessages = harness.posted.filter(
      (message) => message.type === "output",
    );
    expect(outputMessages).toHaveLength(1);
    expect(outputMessages[0].fragments).toHaveLength(2_000);
    expect(outputMessages[0].fragments.slice(0, 4)).toEqual([
      { sequence: 0, stream: "stdout", text: "0" },
      { sequence: 1, stream: "stderr", text: "1" },
      { sequence: 2, stream: "stdout", text: "2" },
      { sequence: 3, stream: "stderr", text: "3" },
    ]);
    expect(outputMessages[0].fragments.at(-1)).toEqual({
      sequence: 1_999,
      stream: "stderr",
      text: "9",
    });
    expect(harness.posted.at(-1)).toMatchObject({
      type: "overflow",
      runId: "run-1",
    });
  });
});
