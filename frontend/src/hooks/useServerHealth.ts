import { useCallback, useEffect, useRef, useState } from "react";
import { checkHealth } from "../lib/api";

export type ServerHealth = "checking" | "online" | "offline";

const HEALTH_INTERVAL_MS = 5_000;

export function useServerHealth() {
  const [health, setHealth] = useState<ServerHealth>("checking");
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const check = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      await checkHealth(controller.signal);
      if (mountedRef.current && generationRef.current === generation) {
        setHealth("online");
      }
    } catch {
      if (
        mountedRef.current &&
        generationRef.current === generation &&
        !controller.signal.aborted
      ) {
        setHealth("offline");
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    queueMicrotask(() => void check());
    const interval = window.setInterval(() => void check(), HEALTH_INTERVAL_MS);
    const handleFocus = () => void check();
    const handleOnline = () => void check();
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      controllerRef.current?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
    };
  }, [check]);

  return { health, check };
}
