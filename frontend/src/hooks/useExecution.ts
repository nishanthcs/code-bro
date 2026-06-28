import { useCallback, useEffect, useRef, useState } from "react";
import { bootstrap } from "../lib/bootstrap";
import type { DebugPausedInfo, OutputFragment, RunStatus } from "../types";

type ExecutionMessage =
  | {
      type: "bridge-ready";
      bridgeId: string;
      sharedArrayBufferAvailable?: boolean;
      crossOriginIsolated?: boolean;
    }
  | { type: "ready" }
  | { type: "resetting" }
  | { type: "output"; runId: string; fragments: OutputFragment[] }
  | { type: "completed"; runId: string; durationMs: number }
  | { type: "failed"; runId: string; traceback: string }
  | { type: "stopped"; runId: string; workerReady?: boolean }
  | { type: "timed-out"; runId: string }
  | { type: "overflow"; runId: string; message: string }
  | { type: "initialization_failed"; message: string }
  | { type: "debug-paused"; runId: string; pauseId: number; reason: string; location: { file: string; line: number }; stack: unknown[]; scopes: unknown[] }
  | { type: "debug-command-failed"; runId: string; commandId: string; message: string };

function appendOutputFragments(
  current: OutputFragment[],
  incoming: OutputFragment[],
) {
  if (incoming.length === 0) return current;
  const next = [...current];
  for (const fragment of incoming) {
    const previous = next.at(-1);
    if (previous?.stream === fragment.stream) {
      next[next.length - 1] = {
        ...previous,
        text: previous.text + fragment.text,
      };
    } else {
      next.push(fragment);
    }
  }
  return next;
}

export function useExecution() {
  const iframeElementRef = useRef<HTMLIFrameElement>(null);
  const activeRunRef = useRef<string | null>(null);
  const [status, setStatus] = useState<RunStatus>("loading");
  const [workerReady, setWorkerReady] = useState(false);
  const [output, setOutput] = useState<OutputFragment[]>([]);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [debugPaused, setDebugPaused] = useState<DebugPausedInfo | null>(null);
  const [debugCommandError, setDebugCommandError] = useState<string | null>(null);
  const debugIdRef = useRef<string | null>(null);

  const post = useCallback((message: unknown) => {
    iframeElementRef.current?.contentWindow?.postMessage(
      message,
      bootstrap.executionOrigin,
    );
  }, []);

  const initialize = useCallback(() => {
    activeRunRef.current = null;
    debugIdRef.current = null;
    setWorkerReady(false);
    setDebugPaused(null);
    setDebugCommandError(null);
    setStatus("loading");
    post({ type: "initialize" });
  }, [post]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExecutionMessage>) => {
      if (
        event.origin !== bootstrap.executionOrigin ||
        event.source !== iframeElementRef.current?.contentWindow
      ) {
        return;
      }
      const message = event.data;
      if (!message || typeof message.type !== "string") return;
      if ("runId" in message && message.runId !== activeRunRef.current) return;
      switch (message.type) {
        case "bridge-ready":
          initialize();
          break;
        case "ready":
          setWorkerReady(true);
          setStatus((current) =>
            current === "loading" || current === "resetting" ? "ready" : current,
          );
          break;
        case "resetting":
          setWorkerReady(false);
          setStatus("resetting");
          break;
        case "output":
          setOutput((current) =>
            appendOutputFragments(current, message.fragments),
          );
          break;
        case "completed":
          setWorkerReady(false);
          setDurationMs(message.durationMs);
          setStatus("completed");
          setDebugPaused(null);
          debugIdRef.current = null;
          activeRunRef.current = null;
          break;
        case "failed":
          setWorkerReady(false);
          setOutput((current) =>
            appendOutputFragments(current, [
              {
                sequence: Number.MAX_SAFE_INTEGER,
                stream: "stderr",
                text: `${message.traceback}\n`,
              },
            ]),
          );
          setStatus("failed");
          setDebugPaused(null);
          debugIdRef.current = null;
          activeRunRef.current = null;
          break;
        case "stopped":
          setWorkerReady(message.workerReady ?? false);
          setStatus("stopped");
          setDebugPaused(null);
          debugIdRef.current = null;
          activeRunRef.current = null;
          break;
        case "timed-out":
          setWorkerReady(false);
          setOutput((current) =>
            appendOutputFragments(current, [
              {
                sequence: Number.MAX_SAFE_INTEGER,
                stream: "system",
                text: "Execution stopped: 10 second time limit exceeded.\n",
              },
            ]),
          );
          setStatus("timed-out");
          setDebugPaused(null);
          debugIdRef.current = null;
          activeRunRef.current = null;
          break;
        case "overflow":
          setWorkerReady(false);
          setOutput((current) =>
            appendOutputFragments(current, [
              {
                sequence: Number.MAX_SAFE_INTEGER,
                stream: "system",
                text: `${message.message}\n`,
              },
            ]),
          );
          setStatus("failed");
          setDebugPaused(null);
          debugIdRef.current = null;
          activeRunRef.current = null;
          break;
        case "initialization_failed":
          setWorkerReady(false);
          setOutput([
            {
              sequence: 0,
              stream: "stderr",
              text: `Python failed to load: ${message.message}\n`,
            },
          ]);
          setStatus("failed");
          break;
        case "debug-paused":
          setDebugPaused({
            debugId: message.runId,
            pauseId: String(message.pauseId),
            reason: message.reason as DebugPausedInfo["reason"],
            location: message.location,
            stack: message.stack as DebugPausedInfo["stack"],
            scopes: message.scopes as DebugPausedInfo["scopes"],
          });
          setStatus("debug-paused");
          break;
        case "debug-command-failed":
          setDebugCommandError(message.message);
          break;
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [initialize]);

  const setFrameElement = useCallback((node: HTMLIFrameElement | null) => {
    iframeElementRef.current = node;
  }, []);

  const canRun =
    workerReady &&
    ["ready", "completed", "failed", "stopped", "timed-out"].includes(status);

  const run = useCallback(
    (code: string, stdin: string) => {
      if (!canRun) return;
      const runId = crypto.randomUUID();
      activeRunRef.current = runId;
      setOutput([]);
      setDurationMs(null);
      setDebugPaused(null);
      setStatus("running");
      post({ type: "run", runId, code, stdin });
    },
    [canRun, post],
  );

  const startDebug = useCallback(
    (code: string, stdin: string, breakpoints: number[]) => {
      if (!canRun) return;
      const debugId = crypto.randomUUID();
      debugIdRef.current = debugId;
      activeRunRef.current = debugId;
      setOutput([]);
      setDurationMs(null);
      setDebugPaused(null);
      setStatus("debug-running");
      post({
        type: "debug-start",
        debugId,
        code,
        stdin,
        breakpoints,
      });
    },
    [canRun, post],
  );

  const sendDebugCommand = useCallback(
    (command: string, breakpoints?: number[]) => {
      const debugId = debugIdRef.current;
      if (!debugId) return;
      setDebugCommandError(null);
      if (command === "stop" || command === "continue" || command === "step-in" || command === "step-over" || command === "step-out") {
        if (command !== "stop") {
          setStatus("debug-running");
        }
        setDebugPaused(null);
        post({ type: "debug-command", debugId, command });
      } else if (command === "update-breakpoints" && breakpoints) {
        post({ type: "debug-command", debugId, command: "update-breakpoints", breakpoints });
      }
    },
    [post],
  );

  const setVariable = useCallback(
    (pauseId: string, frameId: string, scope: "local" | "global", name: string, literal: string) => {
      const debugId = debugIdRef.current;
      if (!debugId) return;
      setDebugCommandError(null);
      const commandId = crypto.randomUUID();
      post({
        type: "debug-command",
        debugId,
        commandId,
        command: {
          type: "set-variable",
          pauseId,
          frameId,
          scope,
          name,
          literal,
        },
      });
    },
    [post],
  );

  const selectFrame = useCallback(
    (frameId: string) => {
      const debugId = debugIdRef.current;
      if (!debugId) return;
      setDebugCommandError(null);
      post({
        type: "debug-command",
        debugId,
        command: {
          type: "select-frame",
          frameId,
        },
      });
    },
    [post],
  );

  const stop = useCallback(() => {
    const runId = activeRunRef.current;
    if (!runId) return;
    const debugId = debugIdRef.current;
    if (debugId) {
      setDebugCommandError(null);
      setDebugPaused(null);
      post({ type: "debug-stop", debugId });
    } else {
      post({ type: "stop", runId });
    }
  }, [post]);

  return {
    setFrameElement,
    iframeSrc: `${bootstrap.executionOrigin}/bridge.html?parentOrigin=${encodeURIComponent(window.location.origin)}`,
    status,
    workerReady,
    output,
    durationMs,
    debugPaused,
    debugCommandError,
    initialize,
    run,
    startDebug,
    sendDebugCommand,
    setVariable,
    selectFrame,
    stop,
    clearOutput: () => setOutput([]),
  };
}
