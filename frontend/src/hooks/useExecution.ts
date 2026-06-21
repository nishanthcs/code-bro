import { useEffect, useRef, useState } from "react";

type ExecutionMessage =
  | { type: "output"; runId: string; fragments: OutputFragment[] }
  | { type: "completed"; runId: string; durationMs: number }
  | { type: "failed"; runId: string; traceback: string }
  | { type: "initialization_failed"; message: string }
  | { type: "run"; runId: string; code: string; stdin: string };

export interface OutputFragment {
  sequence: number;
  stream: "stdout" | "stderr" | "system";
  text: string;
}

type RunStatus =
  | "loading"
  | "ready"
  | "running"
  | "resetting"
  | "completed"
  | "failed"
  | "stopped"
  | "timed-out";

export function useExecution() {
  const iframeElementRef = useRef<HTMLIFrameElement>(null);
  const activeRunRef = useRef<string | null>(null);
  const [status, setStatus] = useState<RunStatus>("loading");
  const [workerReady, setWorkerReady] = useState(false);
  const [output, setOutput] = useState<OutputFragment[]>([]);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  useEffect(() => {
    // Simulate loading state
    const timer = setTimeout(() => {
      setStatus("ready");
      setWorkerReady(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const runCode = (code: string) => {
    if (status === "running" || status === "resetting") return;
    
    setStatus("running");
    setOutput([]);
    setDurationMs(null);
    
    // Simulate execution
    setTimeout(() => {
      setStatus("completed");
      setOutput([
        {
          sequence: 0,
          stream: "stdout",
          text: "Hello, world!\n"
        }
      ]);
      setDurationMs(123);
    }, 1000);
  };

  const stopExecution = () => {
    if (status !== "running" && status !== "resetting") return;
    
    setStatus("stopped");
  };

  return {
    status,
    workerReady,
    output,
    durationMs,
    runCode,
    stopExecution
  };
}
