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

function isUsableCommandBuffer(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.byteLength === "number" &&
    value.byteLength >= 64
  );
}

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

  // Fetch debugger.py and write it to Pyodide's virtual filesystem
  const debuggerResponse = await fetch("/debugger.py", { cache: "no-store" });
  if (!debuggerResponse.ok) {
    throw new Error(`Failed to fetch /debugger.py: ${debuggerResponse.statusText}`);
  }
  const debuggerText = await debuggerResponse.text();
  pyodide.FS.writeFile("/debugger.py", debuggerText);

  post({ type: "ready" });
} catch (error) {
  post({
    type: "initialization_failed",
    message: error instanceof Error ? error.message : String(error),
  });
}

const DEBUG_PYTHON_CODE = `
import sys
import json
import builtins
import io
import codebro_debugger

exec(compile(open("/debugger.py").read(), "debugger.py", "exec"))

debugger.set_command_bridge(codebro_debugger.pause_and_wait)

bp_list = __codebro_debug_breakpoints
debugger.breakpoints = set(bp_list)

sys.stdin = io.StringIO(__codebro_stdin)

sys.settrace(debugger.trace_func)

scope = {"__name__": "__main__", "__builtins__": builtins}
try:
    exec(compile(__codebro_source, "main.py", "exec"), scope, scope)
except CodeBroDebuggerStopped:
    pass
finally:
    sys.settrace(None)
    codebro_debugger.set_inactive()
`;

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

  if (message.debug === true) {
    const sab = message.sab;
    if (!isUsableCommandBuffer(sab)) return;
    const sabView = new Int32Array(sab);
    const breakpoints = Array.isArray(message.breakpoints) ? message.breakpoints : [];

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

    pyodide.registerJsModule("codebro_debugger", {
      pause_and_wait(pauseInfoJson) {
        const pauseInfo = JSON.parse(pauseInfoJson);
        const newPauseSeq = Atomics.add(sabView, 2, 1) + 1;
        Atomics.store(sabView, 3, 1);

        post({
          type: "debug-paused",
          runId: activeRunId,
          pauseId: newPauseSeq,
          reason: pauseInfo.reason,
          location: pauseInfo.location,
          stack: pauseInfo.stack,
          scopes: pauseInfo.scopes,
        });

        while (true) {
          const currentSeq = Atomics.load(sabView, 1);
          Atomics.wait(sabView, 1, currentSeq);

          const command = Atomics.load(sabView, 0);
          Atomics.store(sabView, 0, 0);

          if (command === 0) continue;

          if (command === 5) {
            Atomics.store(sabView, 3, 2);
            return JSON.stringify({ type: "stop" });
          }

          const payloadLen = Math.max(
            0,
            Math.min(Atomics.load(sabView, 4), sabView.length - 8),
          );
          let payload = null;
          if (payloadLen > 0) {
            let payloadText = "";
            for (let index = 0; index < payloadLen; index += 1) {
              payloadText += String.fromCharCode(
                Atomics.load(sabView, 8 + index),
              );
            }
            try {
              payload = JSON.parse(payloadText);
            } catch {
              payload = null;
            }
          }

          if (payload) {
            Atomics.store(sabView, 3, 0);
            return JSON.stringify(payload);
          }

          if ([6, 7, 8].includes(command)) {
            Atomics.store(sabView, 3, 0);
            return JSON.stringify({
              type: "invalid-command",
              message: "Debugger command payload was invalid.",
            });
          }

          const cmdNames = { 1: "continue", 2: "step-in", 3: "step-over", 4: "step-out" };
          Atomics.store(sabView, 3, 0);
          return JSON.stringify({ type: cmdNames[command] });
        }
      },
      set_inactive() {
        Atomics.store(sabView, 3, 2);
      },
      report_command_failed(commandId, message) {
        post({
          type: "debug-command-failed",
          runId: activeRunId,
          commandId,
          message,
        });
      },
    });

    pyodide.globals.set("__codebro_source", message.code);
    pyodide.globals.set(
      "__codebro_stdin",
      message.stdin.replaceAll("\r\n", "\n").replaceAll("\r", "\n"),
    );
    pyodide.globals.set("__codebro_debug_breakpoints", breakpoints);

    try {
      await pyodide.runPythonAsync(DEBUG_PYTHON_CODE);

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
      pyodide.globals.delete("__codebro_debug_breakpoints");
    }

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
    let execute_code = `
import builtins
import io
import sys

sys.stdin = io.StringIO(__codebro_stdin)
scope = {
    "__name__": "__main__",
    "__builtins__": builtins,
}
exec(compile(__codebro_source, "main.py", "exec"), scope, scope)
`;

    await pyodide.runPythonAsync(execute_code);

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
