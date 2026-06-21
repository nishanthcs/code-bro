import { loadPyodide } from "/pyodide/pyodide.mjs";

const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_NEWLINES = 10_000;
const MAX_OUTPUT_FRAGMENTS = 2_000;
const MAX_BATCH_BYTES = 16 * 1024;
const FLUSH_INTERVAL_MS = 50;
const encoder = new TextEncoder();
const stdoutDecoder = new TextDecoder();
const stderrDecoder = new TextDecoder();
let sequence = 0;
let pendingFragments = [];
let pendingBytes = 0;
let outputBytes = 0;
let outputNewlines = 0;
let outputFragments = 0;
let lastOutputStream = null;
let flushTimer = null;
let activeRunId = null;
let overflowed = false;

function post(message) {
  self.postMessage(message);
}

function flushOutput() {
  if (!activeRunId || pendingFragments.length === 0) return;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  post({
    type: "output",
    runId: activeRunId,
    fragments: pendingFragments.map(({ sequence, stream, parts }) => ({
      sequence,
      stream,
      text: parts.join(""),
    })),
  });
  pendingFragments = [];
  pendingBytes = 0;
}

function scheduleFlush() {
  if (flushTimer === null) {
    flushTimer = setTimeout(flushOutput, FLUSH_INTERVAL_MS);
  }
}

function capture(stream, text) {
  if (!activeRunId || overflowed || text.length === 0) return;
  const bytes = encoder.encode(text).byteLength;
  const newlines = (text.match(/\n/g) || []).length;
  const startsFragment = stream !== lastOutputStream;
  if (
    outputBytes + bytes > MAX_OUTPUT_BYTES ||
    outputNewlines + newlines > MAX_NEWLINES ||
    (startsFragment && outputFragments >= MAX_OUTPUT_FRAGMENTS)
  ) {
    overflowed = true;
    flushOutput();
    post({
      type: "overflow",
      runId: activeRunId,
      message:
        "Execution stopped: output exceeded the 1 MiB, 10,000 line, or 2,000 fragment limit.",
    });
    return;
  }
  outputBytes += bytes;
  outputNewlines += newlines;
  if (startsFragment) {
    outputFragments += 1;
    lastOutputStream = stream;
  }
  pendingBytes += bytes;
  const pendingFragment = pendingFragments.at(-1);
  if (pendingFragment?.stream === stream) {
    pendingFragment.parts.push(text);
  } else {
    pendingFragments.push({ sequence: sequence++, stream, parts: [text] });
  }
  if (pendingBytes >= MAX_BATCH_BYTES) {
    flushOutput();
  } else {
    scheduleFlush();
  }
}

function flushDecoders() {
  capture("stdout", stdoutDecoder.decode());
  capture("stderr", stderrDecoder.decode());
}

let pyodide;
try {
  pyodide = await loadPyodide({
    indexURL: "/pyodide/",
    jsglobals: Object.create(null),
  });
  pyodide.setStdout({
    write(buffer) {
      const text = stdoutDecoder.decode(buffer, { stream: true });
      capture("stdout", text);
      return buffer.length;
    },
  });
  pyodide.setStderr({
    write(buffer) {
      const text = stderrDecoder.decode(buffer, { stream: true });
      capture("stderr", text);
      return buffer.length;
    },
  });
  post({ type: "ready" });
} catch (error) {
  post({
    type: "initialization_failed",
    message: error instanceof Error ? error.message : String(error),
  });
}

self.addEventListener("message", async (event) => {
  const message = event.data;
  if (
    !pyodide ||
    message?.type !== "run" ||
    typeof message.runId !== "string" ||
    typeof message.code !== "string" ||
    typeof message.stdin !== "string"
  ) {
    return;
  }
  activeRunId = message.runId;
  sequence = 0;
  pendingFragments = [];
  pendingBytes = 0;
  outputBytes = 0;
  outputNewlines = 0;
  outputFragments = 0;
  lastOutputStream = null;
  overflowed = false;
  const started = performance.now();
  pyodide.globals.set("__codebro_source", message.code);
  pyodide.globals.set(
    "__codebro_stdin",
    message.stdin.replaceAll("\r\n", "\n").replaceAll("\r", "\n"),
  );
  try {
    await pyodide.runPythonAsync(`
import builtins
import io
import sys

sys.stdin = io.StringIO(__codebro_stdin)
scope = {
    "__name__": "__main__",
    "__builtins__": builtins,
}
exec(compile(__codebro_source, "main.py", "exec"), scope, scope)
`);
    flushDecoders();
    flushOutput();
    if (!overflowed) {
      post({
        type: "completed",
        runId: activeRunId,
        durationMs: Math.round(performance.now() - started),
      });
    }
  } catch (error) {
    flushDecoders();
    flushOutput();
    if (!overflowed) {
      post({
        type: "failed",
        runId: activeRunId,
        traceback: error instanceof Error ? error.message : String(error),
      });
    }
  } finally {
    pyodide.globals.delete("__codebro_source");
    pyodide.globals.delete("__codebro_stdin");
  }
});
