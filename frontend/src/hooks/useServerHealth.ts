import { useCallback, useEffect, useRef, useState } from "react";

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
    
    try {
      // Make actual API call to check server health
      const response = await fetch("/api/v1/health", {
        signal: AbortSignal.timeout(2500)
      });
      
      if (response.ok) {
        setHealth("online");
      } else {
        setHealth("offline");
      }
    } catch (error) {
      if (mountedRef.current && generationRef.current === generation) {
        setHealth("offline");
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    check();
    
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
