import { useEffect } from "react";
import { useServerHealth } from "../hooks/useServerHealth";

export function ServerStatusBanner() {
  const { health, check } = useServerHealth();
  
  // Check health on component mount
  useEffect(() => {
    check();
  }, [check]);

  if (health !== "offline") return null;

  return (
    <div className="server-status-banner" role="alert">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <div>
        <strong>CodeBro server is unavailable</strong>
        <p>Try restarting the server or check your connection.</p>
      </div>
    </div>
  );
}
