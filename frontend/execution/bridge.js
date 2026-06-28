const params = new URLSearchParams(window.location.search);
const parentOrigin = params.get("parentOrigin");
const INITIALIZATION_TIMEOUT_MS = 30_000;
const RUN_TIMEOUT_MS = 10_000;
const DEBUG_IDLE_TIMEOUT_MS = 15 * 60_000;
const bridgeId =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : String(Date.now());
const bridgeSharedArrayBufferAvailable =
  typeof SharedArrayBuffer === "function" && self.crossOriginIsolated === true;

if (!parentOrigin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(parentOrigin)) {
  throw new Error("CodeBro execution host received an invalid parent origin.");
}

let worker = null;
let workerReady = false;
let activeRunId = null;
let timeoutId = null;
let initializationTimeoutId = null;
let restartTimerId = null;
let restartAttempt = 0;

const debugSessions = {};

const COMMANDS = {
  none: 0,
  continue: 1,
  "step-in": 2,
  "step-over": 3,
  "step-out": 4,
  stop: 5,
  "update-breakpoints": 6,
  "set-variable": 7,
  "select-frame": 8,
};

function post(message) {
  window.parent.postMessage(message, parentOrigin);
}

function clearRunTimer() {
  if (timeoutId !== null) {
    window.clearTimeout(timeoutId);
    timeoutId = null;
  }
}

function clearInitializationTimer() {
  if (initializationTimeoutId !== null) {
    window.clearTimeout(initializationTimeoutId);
    initializationTimeoutId = null;
  }
}

function terminateWorker() {
  clearRunTimer();
  clearInitializationTimer();
  worker?.terminate();
  worker = null;
  workerReady = false;
}

function scheduleWorkerRestart() {
  if (restartTimerId !== null) return;
  const delay = Math.min(1_000 * 2 ** restartAttempt, 10_000);
  restartAttempt += 1;
  restartTimerId = window.setTimeout(() => {
    restartTimerId = null;
    startWorker();
  }, delay);
}

function recoverWorker(failedWorker, message) {
  if (worker !== failedWorker) return;
  const runId = activeRunId;
  activeRunId = null;
  terminateWorker();
  if (runId) {
    post({ type: "failed", runId, traceback: message });
  } else {
    post({ type: "initialization_failed", message });
  }
  scheduleWorkerRestart();
}

function startWorker() {
  terminateWorker();
  let nextWorker;
  try {
    nextWorker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
  } catch (error) {
    post({
      type: "initialization_failed",
      message: error instanceof Error ? error.message : String(error),
    });
    scheduleWorkerRestart();
    return;
  }
  worker = nextWorker;
  initializationTimeoutId = window.setTimeout(() => {
    recoverWorker(
      nextWorker,
      "Python initialization timed out. Retrying with a fresh worker.",
    );
  }, INITIALIZATION_TIMEOUT_MS);
  nextWorker.addEventListener("message", (event) => {
    if (worker !== nextWorker) return;
    const message = event.data;
    if (!message || typeof message.type !== "string") return;
    if (message.type === "ready") {
      clearInitializationTimer();
      restartAttempt = 0;
      workerReady = true;
      post({ type: "ready" });
      return;
    }
    if (message.type === "initialization_failed") {
      recoverWorker(
        nextWorker,
        message.message || "The Python worker failed to initialize.",
      );
      return;
    }
    if (message.runId !== activeRunId) return;
    post(message);
    if (["completed", "failed", "overflow"].includes(message.type)) {
      clearRunTimer();
      activeRunId = null;
      startWorker();
    }
  });
  nextWorker.addEventListener("error", (event) => {
    event.preventDefault();
    recoverWorker(
      nextWorker,
      event.message || "The Python worker crashed.",
    );
  });
}

function debugSessionCleanup(debugId) {
  const session = debugSessions[debugId];
  if (!session) return;
  if (session.timeoutId !== null) {
    window.clearTimeout(session.timeoutId);
  }
  if (session.idleTimeoutId !== null) {
    window.clearTimeout(session.idleTimeoutId);
  }
  session.worker?.terminate();
  delete debugSessions[debugId];
  if (activeRunId === debugId) activeRunId = null;
}

function cleanupAllWorkers() {
  if (restartTimerId !== null) {
    window.clearTimeout(restartTimerId);
    restartTimerId = null;
  }
  for (const debugId of Object.keys(debugSessions)) {
    debugSessionCleanup(debugId);
  }
  activeRunId = null;
  terminateWorker();
}

function postReadyIfIdle() {
  if (!activeRunId && worker && workerReady) {
    post({ type: "ready" });
  }
}

function postStopped(runId) {
  post({
    type: "stopped",
    runId,
    workerReady: Boolean(worker && workerReady),
  });
}

function postFailedAndReady(runId, traceback) {
  post({ type: "failed", runId, traceback });
  postReadyIfIdle();
}

function isUsableCommandBuffer(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.byteLength === "number" &&
    value.byteLength >= 64
  );
}

function clearDebugRunTimer(session) {
  if (session.timeoutId !== null) {
    window.clearTimeout(session.timeoutId);
    session.timeoutId = null;
  }
}

function clearDebugIdleTimer(session) {
  if (session.idleTimeoutId !== null) {
    window.clearTimeout(session.idleTimeoutId);
    session.idleTimeoutId = null;
  }
}

function startDebugRunTimer(debugId, session) {
  clearDebugRunTimer(session);
  session.timeoutId = window.setTimeout(() => {
    if (debugSessions[debugId] !== session) return;
    debugSessionCleanup(debugId);
    post({ type: "timed-out", runId: debugId });
    postReadyIfIdle();
  }, RUN_TIMEOUT_MS);
}

function startDebugIdleTimer(debugId, session) {
  clearDebugIdleTimer(session);
  session.idleTimeoutId = window.setTimeout(() => {
    if (debugSessions[debugId] !== session) return;
    debugSessionCleanup(debugId);
    post({ type: "timed-out", runId: debugId });
    postReadyIfIdle();
  }, DEBUG_IDLE_TIMEOUT_MS);
}

window.addEventListener("message", (event) => {
  if (
    event.origin !== parentOrigin ||
    event.source !== window.parent ||
    !event.data ||
    typeof event.data.type !== "string"
  ) {
    return;
  }
  const message = event.data;
  if (message.type === "initialize") {
    if (!worker && restartTimerId === null) startWorker();
    else if (workerReady) post({ type: "ready" });
    return;
  }
  if (message.type === "run") {
    if (
      !worker ||
      !workerReady ||
      activeRunId ||
      typeof message.runId !== "string" ||
      typeof message.code !== "string" ||
      typeof message.stdin !== "string"
    ) {
      return;
    }
    workerReady = false;
    activeRunId = message.runId;
    timeoutId = window.setTimeout(() => {
      const runId = activeRunId;
      if (!runId) return;
      terminateWorker();
      activeRunId = null;
      post({ type: "timed-out", runId });
      startWorker();
    }, RUN_TIMEOUT_MS);
    worker.postMessage(message);
    return;
  }
  if (message.type === "stop" && message.runId === activeRunId) {
    const runId = activeRunId;
    terminateWorker();
    activeRunId = null;
    post({ type: "stopped", runId });
    startWorker();
    return;
  }

  if (message.type === "debug-start") {
    const { debugId, code, stdin, breakpoints } = message;
    if (
      activeRunId ||
      typeof debugId !== "string" ||
      typeof code !== "string" ||
      typeof stdin !== "string" ||
      !Array.isArray(breakpoints) ||
      debugSessions[debugId]
    ) {
      return;
    }
    if (!breakpoints.every((bp) => Number.isInteger(bp) && bp >= 0)) {
      return;
    }

    let sab = null;
    if (typeof SharedArrayBuffer === "function") {
      try {
        sab = new SharedArrayBuffer(4096);
      } catch {
        sab = null;
      }
    }
    if (!isUsableCommandBuffer(sab)) {
      postFailedAndReady(
        debugId,
        "SharedArrayBuffer is not available. Please ensure cross-origin isolation is enabled (COOP/COEP headers).",
      );
      debugSessionCleanup(debugId);
      return;
    }
    const view = new Int32Array(sab);

    let debugWorker;
    try {
      debugWorker = new Worker(new URL("./worker.js", import.meta.url), {
        type: "module",
      });
    } catch (error) {
      postFailedAndReady(
        debugId,
        error instanceof Error
          ? error.message
          : "Debug worker could not be created.",
      );
      return;
    }

    const session = {
      worker: debugWorker,
      sab,
      view,
      timeoutId: null,
      idleTimeoutId: null,
      paused: false,
    };
    debugSessions[debugId] = session;
    activeRunId = debugId;

    debugWorker.addEventListener("message", (msgEvent) => {
      if (debugSessions[debugId] !== session) return;
      const msg = msgEvent.data;
      if (!msg || typeof msg.type !== "string") return;

      if (msg.type === "ready") {
        debugWorker.postMessage({
          type: "run",
          runId: debugId,
          code,
          stdin,
          debug: true,
          breakpoints: breakpoints.slice(0, 10),
          sab,
        });
        startDebugRunTimer(debugId, session);
        return;
      }

      if (msg.type === "initialization_failed") {
        post({
          type: "failed",
          runId: debugId,
          traceback: msg.message || "Debug worker initialization failed.",
        });
        debugSessionCleanup(debugId);
        postReadyIfIdle();
        return;
      }

      if (msg.runId !== debugId) return;

      if (msg.type === "debug-paused") {
        session.paused = true;
        clearDebugRunTimer(session);
        startDebugIdleTimer(debugId, session);
      }

      post(msg);

      if (["completed", "failed", "overflow"].includes(msg.type)) {
        debugSessionCleanup(debugId);
        postReadyIfIdle();
      }
    });

    debugWorker.addEventListener("error", (event) => {
      event.preventDefault();
      if (debugSessions[debugId] !== session) return;
      post({
        type: "failed",
        runId: debugId,
        traceback: event.message || "Debug worker crashed.",
      });
      debugSessionCleanup(debugId);
      postReadyIfIdle();
    });

    return;
  }

  if (message.type === "debug-command") {
    const { debugId, command } = message;
    const session = debugSessions[debugId];
    if (!session || typeof debugId !== "string") {
      return;
    }

    let commandName;
    let payload = null;

    if (typeof command === "string") {
      commandName = command;
      if (command === "update-breakpoints") {
        payload = { type: "update-breakpoints", breakpoints: message.breakpoints || [] };
      } else {
        payload = { type: command };
      }
    } else if (command && typeof command === "object") {
      commandName = command.type;
      payload = { ...command, commandId: message.commandId };
    }

    if (!commandName || !(commandName in COMMANDS)) {
      return;
    }

    if (commandName === "stop") {
      debugSessionCleanup(debugId);
      postStopped(debugId);
      postReadyIfIdle();
      return;
    }

    if (commandName === "update-breakpoints") {
      const bps = payload.breakpoints;
      if (
        !Array.isArray(bps) ||
        !bps.every((bp) => Number.isInteger(bp) && bp >= 0)
      ) {
        return;
      }
    }

    const { view, sab } = session;
    Atomics.store(view, 0, COMMANDS.none);
    Atomics.store(view, 4, 0);
    if (payload) {
      const payloadStr = JSON.stringify(payload);
      const maxChars = view.length - 8;
      if (payloadStr.length > maxChars) {
        post({
          type: "debug-command-failed",
          runId: debugId,
          commandId: message.commandId || "",
          message: "Debugger command payload is too large.",
        });
        return;
      }
      for (let index = 0; index < maxChars; index += 1) {
        Atomics.store(
          view,
          8 + index,
          index < payloadStr.length ? payloadStr.charCodeAt(index) : 0,
        );
      }
      Atomics.store(view, 4, payloadStr.length);
    }

    Atomics.store(view, 0, COMMANDS[commandName]);
    Atomics.add(view, 1, 1);
    Atomics.notify(view, 1, 1);

    if (["continue", "step-in", "step-over", "step-out"].includes(commandName)) {
      session.paused = false;
      clearDebugIdleTimer(session);
      startDebugRunTimer(debugId, session);
    }

    return;
  }

  if (message.type === "debug-stop") {
    const { debugId } = message;
    if (typeof debugId !== "string" || !debugSessions[debugId]) return;
    debugSessionCleanup(debugId);
    postStopped(debugId);
    postReadyIfIdle();
    return;
  }
});

window.addEventListener("pagehide", cleanupAllWorkers);
window.addEventListener("beforeunload", cleanupAllWorkers);
post({
  type: "bridge-ready",
  bridgeId,
  sharedArrayBufferAvailable: bridgeSharedArrayBufferAvailable,
  crossOriginIsolated: self.crossOriginIsolated === true,
});
