import { RefreshCw, ServerCrash } from "lucide-react";
import { useServerHealth } from "../hooks/useServerHealth";

export function ServerStatusBanner() {
  const { health, check } = useServerHealth();

  if (health !== "offline") return null;

  return (
    <div className="server-status-banner" role="alert">
      <ServerCrash size={18} />
      <div>
        <strong>CodeBro server is unavailable</strong>
        <span>
          Sessions cannot load or save. Start the local server, then retry.
        </span>
      </div>
      <button type="button" onClick={() => void check()}>
        <RefreshCw size={14} />
        Retry
      </button>
    </div>
  );
}

