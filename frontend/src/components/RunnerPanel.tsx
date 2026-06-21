import {
  CircleAlert,
  CircleCheck,
  CircleStop,
  Clock3,
  Eraser,
  LoaderCircle,
  TerminalSquare,
} from "lucide-react";
import { useRef, type CSSProperties } from "react";
import { useVerticalPercentResize } from "../hooks/useDragResize";
import {
  persistStdinHeight,
  STDIN_HEIGHT_MAX,
  STDIN_HEIGHT_MIN,
} from "../lib/preferences";
import type { OutputFragment, RunStatus } from "../types";
import { ResizeHandle } from "./ResizeHandle";

function statusLabel(status: RunStatus, durationMs: number | null) {
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
      return durationMs === null ? "Completed" : `Completed in ${durationMs} ms`;
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
    case "timed-out":
      return "Timed out";
  }
}

function StatusIcon({ status }: { status: RunStatus }) {
  if (status === "loading" || status === "running" || status === "resetting") {
    return <LoaderCircle size={14} className="spin" />;
  }
  if (status === "completed" || status === "ready") {
    return <CircleCheck size={14} />;
  }
  if (status === "stopped") return <CircleStop size={14} />;
  if (status === "timed-out") return <Clock3 size={14} />;
  return <CircleAlert size={14} />;
}

export function RunnerPanel({
  stdin,
  onStdinChange,
  output,
  status,
  durationMs,
  onClear,
  stdinHeightPercent,
  onStdinHeightChange,
}: {
  stdin: string;
  onStdinChange: (value: string) => void;
  output: OutputFragment[];
  status: RunStatus;
  durationMs: number | null;
  onClear: () => void;
  stdinHeightPercent: number;
  onStdinHeightChange: (percent: number) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const resize = useVerticalPercentResize({
    containerRef: panelRef,
    min: STDIN_HEIGHT_MIN,
    max: STDIN_HEIGHT_MAX,
    onChange: onStdinHeightChange,
    onCommit: persistStdinHeight,
  });

  return (
    <aside
      ref={panelRef}
      className="runner-panel"
      style={
        { "--stdin-height": `${stdinHeightPercent}%` } as CSSProperties
      }
    >
      <section className="runner-card input-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">stdin</span>
            <h2>Program input</h2>
          </div>
          <span className="panel-hint">One value per line</span>
        </div>
        <textarea
          value={stdin}
          onChange={(event) => onStdinChange(event.target.value)}
          placeholder={"Ada\n42"}
          aria-label="Program input"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </section>
      <ResizeHandle
        direction="vertical"
        label="Resize program input and output panels"
        onPointerDown={(event) =>
          resize.handlePointerDown(event, stdinHeightPercent)
        }
        onPointerMove={resize.handlePointerMove}
        onPointerUp={resize.handlePointerUp}
        onPointerCancel={resize.handlePointerCancel}
      />
      <section className="runner-card output-card">
        <div className="panel-heading output-heading">
          <div>
            <span className="eyebrow">console</span>
            <h2>
              <TerminalSquare size={17} />
              Output
            </h2>
          </div>
          <button
            className="ghost-button ghost-button--small"
            type="button"
            onClick={onClear}
            disabled={status === "running" || output.length === 0}
          >
            <Eraser size={14} />
            Clear
          </button>
        </div>
        <div className="console" aria-live="polite" aria-label="Program output">
          {output.length === 0 ? (
            <div className="console-empty">
              <span className="console-prompt">&gt;_</span>
              <p>Run your code and the output will land here.</p>
            </div>
          ) : (
            <pre>
              {output.map((fragment, index) => (
                <span
                  className={`stream-${fragment.stream}`}
                  key={`${fragment.sequence}-${index}`}
                >
                  {fragment.text}
                </span>
              ))}
            </pre>
          )}
        </div>
        <div className={`run-status run-status--${status}`}>
          <StatusIcon status={status} />
          {statusLabel(status, durationMs)}
        </div>
      </section>
    </aside>
  );
}
