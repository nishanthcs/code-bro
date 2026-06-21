import { useCallback, useEffect, useRef, useState } from "react";
import { bootstrap } from "../lib/bootstrap";
import type { OutputFragment, RunStatus } from "../types";

type ExecutionMessage =
  | { type: "ready" }
  | { type: "resetting" }
  | { type: "output"; runId: string; fragments: OutputFragment[] }
  | { type: "completed"; runId: string; durationMs: number }
  | { type: "failed"; runId: string; traceback: string }
  | { type: "stopped"; runId: string }
  | { type: "timed-out"; runId: string }
  | { type: "overflow"; runId: string; message: string }
  | { type: "initialization_failed"; message: string };

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
          activeRunRef.current = null;
          break;
        case "stopped":
          setWorkerReady(false);
          setStatus("stopped");
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
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const post = useCallback((message: unknown) => {
    iframeElementRef.current?.contentWindow?.postMessage(
      message,
      bootstrap.executionOrigin,
    );
  }, []);

  const initialize = useCallback(() => {
    setWorkerReady(false);
    setStatus("loading");
    post({ type: "initialize" });
  }, [post]);

  const setFrameElement = useCallback((node: HTMLIFrameElement | null) => {
    iframeElementRef.current = node;
  }, []);

  const run = useCallback(
    (code: string, stdin: string) => {
      if (
        !workerReady ||
        !["ready", "completed", "failed", "stopped", "timed-out"].includes(status)
      ) {
        return;
      }
      const runId = crypto.randomUUID();
      activeRunRef.current = runId;
      setOutput([]);
      setDurationMs(null);
      setStatus("running");
      post({ type: "run", runId, code, stdin });
    },
    [post, status, workerReady],
  );

  const stop = useCallback(() => {
    if (!activeRunRef.current) return;
    post({ type: "stop", runId: activeRunRef.current });
  }, [post]);

  return {
    setFrameElement,
    iframeSrc: `${bootstrap.executionOrigin}/bridge.html?parentOrigin=${encodeURIComponent(window.location.origin)}`,
    status,
    workerReady,
    output,
    durationMs,
    initialize,
    run,
    stop,
    clearOutput: () => setOutput([]),
  };
}
