import { useEffect, useState } from "react";
import { useExecution } from "../hooks/useExecution";

interface RunnerPanelProps {
  className?: string;
}

export function RunnerPanel({ className }: RunnerPanelProps) {
  const { status, workerReady, output, durationMs, runCode, stopExecution } = useExecution();
  const [isExpanded, setIsExpanded] = useState(true);
  
  return (
    <div className={`runner-panel ${className || ''}`}>
      <div className="runner-header">
        <span className="runner-status">
          {statusLabel(status, durationMs)}
        </span>
        <button 
          className="icon-button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          )}
        </button>
      </div>
      
      {isExpanded && (
        <div className="runner-content">
          <div className="output-container">
            {output.length === 0 ? (
              <div className="console-empty">
                <span className="console-prompt">&gt;_</span>
                <p>Run your code and the output will land here.</p>
              </div>
            ) : (
              output.map((fragment, index) => (
                <div 
                  key={index} 
                  className={`output-fragment output-${fragment.stream}`}
                  dangerouslySetInnerHTML={{ __html: fragment.text }}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function statusLabel(status: string, durationMs: number | null) {
  switch (status) {
    case "loading":
      return "Loading Python";
    case "ready":
      return "Ready";
    case "running":
      return "Running";
    case "resetting":
      return "Resetting Python";
    case "completed":
      return durationMs !== null ? `Completed in ${durationMs}ms` : "Completed";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
    case "timed-out":
      return "Timed out";
    default:
      return "Unknown";
  }
}
