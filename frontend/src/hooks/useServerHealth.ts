import { useCallback, useEffect, useRef, useState } from "react";
import { checkHealth } from "../lib/api";
import {
  SERVER_AVAILABLE_EVENT,
  SERVER_UNAVAILABLE_EVENT,
} from "../lib/serverHealthEvents";

export type ServerHealth = "checking" | "online" | "offline";

const OFFLINE_RETRY_INTERVAL_MS = 30_000;

export function useServerHealth() {
  const [health, setHealth] = useState<ServerHealth>("checking");
  const healthRef = useRef<ServerHealth>("checking");
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const updateHealth = useCallback((nextHealth: ServerHealth) => {
    healthRef.current = nextHealth;
    setHealth(nextHealth);
  }, []);

  const check = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      await checkHealth(controller.signal);
      if (mountedRef.current && generationRef.current === generation) {
        updateHealth("online");
      }
    } catch {
      if (
        mountedRef.current &&
        generationRef.current === generation &&
        !controller.signal.aborted
      ) {
        updateHealth("offline");
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }, [updateHealth]);

  useEffect(() => {
    mountedRef.current = true;
    queueMicrotask(() => void check());
    const handleAvailable = () => updateHealth("online");
    const handleUnavailable = () => updateHealth("offline");
    const checkIfOffline = () => {
      if (healthRef.current === "offline") void check();
    };
    window.addEventListener(SERVER_AVAILABLE_EVENT, handleAvailable);
    window.addEventListener(SERVER_UNAVAILABLE_EVENT, handleUnavailable);
    window.addEventListener("focus", checkIfOffline);
    window.addEventListener("online", checkIfOffline);
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      controllerRef.current?.abort();
      window.removeEventListener(SERVER_AVAILABLE_EVENT, handleAvailable);
      window.removeEventListener(SERVER_UNAVAILABLE_EVENT, handleUnavailable);
      window.removeEventListener("focus", checkIfOffline);
      window.removeEventListener("online", checkIfOffline);
    };
  }, [check, updateHealth]);

  useEffect(() => {
    if (health !== "offline") return;
    const interval = window.setInterval(
      () => void check(),
      OFFLINE_RETRY_INTERVAL_MS,
    );
    return () => window.clearInterval(interval);
  }, [check, health]);

  return { health, check };
}
