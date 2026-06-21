const params = new URLSearchParams(window.location.search);
const parentOrigin = params.get("parentOrigin");
const INITIALIZATION_TIMEOUT_MS = 30_000;
const RUN_TIMEOUT_MS = 10_000;

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
  }
});
