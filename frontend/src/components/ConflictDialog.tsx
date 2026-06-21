import { GitCompareArrows } from "lucide-react";
import { useModalFocus } from "../hooks/useModalFocus";
import type { SessionResource } from "../types";

export function ConflictDialog({
  server,
  onKeepLocal,
  onLoadServer,
}: {
  server: SessionResource;
  onKeepLocal: () => void;
  onLoadServer: () => void;
}) {
  const dialogRef = useModalFocus<HTMLDivElement>({ active: true });

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
        tabIndex={-1}
      >
        <span className="dialog-icon">
          <GitCompareArrows size={22} />
        </span>
        <div>
          <span className="eyebrow">Save conflict</span>
          <h2 id="conflict-title">This session changed elsewhere</h2>
          <p>
            CodeBro kept your draft. Choose which version should become the
            saved session. The saved version is revision {server.revision}.
          </p>
        </div>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onLoadServer}>
            Load saved version
          </button>
          <button className="primary-button" type="button" onClick={onKeepLocal}>
            Keep my version
          </button>
        </div>
      </div>
    </div>
  );
}
