import {
  CircleAlert,
  CircleCheck,
  CircleStop,
  Clock3,
  Eraser,
  LoaderCircle,
  PanelTopClose,
  PanelTopOpen,
  TerminalSquare,
} from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";
import {
  persistNotesHeight,
  persistDebuggerHeight,
  persistStdinHeight,
  DEBUGGER_HEIGHT_MAX,
  DEBUGGER_HEIGHT_MIN,
  NOTES_HEIGHT_MAX,
  NOTES_HEIGHT_MIN,
  STDIN_HEIGHT_MAX,
  STDIN_HEIGHT_MIN,
} from "../lib/preferences";
import type { DebugPausedInfo, OutputFragment, RunStatus } from "../types";
import { useVerticalPercentResize } from "../hooks/useDragResize";
import { ResizeHandle } from "./ResizeHandle";
import {
  SessionNotesPanel,
  type SessionNotesPanelHandle,
} from "./SessionNotesPanel";
import { DebuggerPanel } from "./DebuggerPanel";

function statusLabel(status: RunStatus, durationMs: number | null) {
  switch (status) {
    case "loading":
      return "Loading Python";
    case "ready":
      return "Ready";
    case "running":
      return "Running";
    case "debug-running":
      return "Running (debug)";
    case "debug-paused":
      return "Paused (debug)";
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
  if (status === "loading" || status === "running" || status === "debug-running" || status === "resetting") {
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
  stdinCollapsed,
  onToggleStdin,
  notesMarkdown,
  onNotesMarkdownChange,
  notesHeightPercent,
  onNotesHeightChange,
  notesCollapsed,
  onToggleNotes,
  debugStatus,
  debugPausedInfo,
  debuggerCollapsed,
  onToggleDebuggerCollapse,
  debuggerHeightPercent,
  onDebuggerHeightChange,
  onDebugContinue,
  onDebugStepOver,
  onDebugStepIn,
  onDebugStepOut,
  onDebugStop,
  onSetVariable,
  onSelectFrame,
  commandError,
}: {
  stdin: string;
  onStdinChange: (value: string) => void;
  output: OutputFragment[];
  status: RunStatus;
  durationMs: number | null;
  onClear: () => void;
  stdinHeightPercent: number;
  onStdinHeightChange: (percent: number) => void;
  stdinCollapsed: boolean;
  onToggleStdin: () => void;
  notesMarkdown: string;
  onNotesMarkdownChange: (markdown: string) => void;
  notesHeightPercent: number;
  onNotesHeightChange: (percent: number) => void;
  notesCollapsed: boolean;
  onToggleNotes: () => void;
  debugStatus: "idle" | "attaching" | "attached" | "detached" | "error";
  debugPausedInfo: DebugPausedInfo | null;
  debuggerCollapsed: boolean;
  onToggleDebuggerCollapse: () => void;
  debuggerHeightPercent: number;
  onDebuggerHeightChange: (percent: number) => void;
  onDebugContinue: () => void;
  onDebugStepOver: () => void;
  onDebugStepIn: () => void;
  onDebugStepOut: () => void;
  onDebugStop: () => void;
  onSetVariable?: (pauseId: string, frameId: string, scope: "local" | "global", name: string, literal: string) => void;
  onSelectFrame?: (frameId: string) => void;
  commandError?: string | null;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const lowerRef = useRef<HTMLDivElement>(null);
  const stdinRef = useRef<HTMLTextAreaElement>(null);
  const showInputRef = useRef<HTMLButtonElement>(null);
  const notesPanelRef = useRef<SessionNotesPanelHandle | null>(null);
  const previousStdinCollapsedRef = useRef(stdinCollapsed);
  const previousNotesCollapsedRef = useRef(notesCollapsed);
  const stdinResize = useVerticalPercentResize({
    containerRef: panelRef,
    min: STDIN_HEIGHT_MIN,
    max: STDIN_HEIGHT_MAX,
    onChange: onStdinHeightChange,
    onCommit: persistStdinHeight,
  });
  const notesResize = useVerticalPercentResize({
    containerRef: lowerRef,
    min: NOTES_HEIGHT_MIN,
    max: NOTES_HEIGHT_MAX,
    reversed: true,
    onChange: onNotesHeightChange,
    onCommit: persistNotesHeight,
  });
  const debuggerResize = useVerticalPercentResize({
    containerRef: lowerRef,
    min: DEBUGGER_HEIGHT_MIN,
    max: DEBUGGER_HEIGHT_MAX,
    reversed: true,
    onChange: onDebuggerHeightChange,
    onCommit: persistDebuggerHeight,
  });

  useEffect(() => {
    if (previousStdinCollapsedRef.current === stdinCollapsed) return;
    previousStdinCollapsedRef.current = stdinCollapsed;
    if (stdinCollapsed) {
      showInputRef.current?.focus();
    } else {
      stdinRef.current?.focus();
    }
  }, [stdinCollapsed]);

  useEffect(() => {
    if (previousNotesCollapsedRef.current === notesCollapsed) return;
    previousNotesCollapsedRef.current = notesCollapsed;
    notesPanelRef.current?.focus();
  }, [notesCollapsed]);

  const panelClasses = [
    "runner-panel",
    stdinCollapsed ? "runner-panel--stdin-collapsed" : "",
    notesCollapsed ? "runner-panel--notes-collapsed" : "runner-panel--notes-expanded",
  ].filter(Boolean).join(" ");
  const lowerRows = [
    "minmax(140px, 1fr)",
    debuggerCollapsed
      ? "auto"
      : "auto minmax(180px, var(--debugger-height))",
    notesCollapsed ? "auto" : "auto minmax(120px, var(--notes-height))",
  ].join(" ");

  return (
    <aside
      ref={panelRef}
      className={panelClasses}
      style={
        { "--stdin-height": `${stdinHeightPercent}%` } as CSSProperties
      }
    >
      {!stdinCollapsed && (
        <>
          <section className="runner-card input-card">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">stdin</span>
                <h2>Program input</h2>
              </div>
              <div className="panel-actions">
                <span className="panel-hint">One value per line</span>
                <button
                  className="icon-button icon-button--quiet panel-toggle"
                  type="button"
                  onClick={onToggleStdin}
                  aria-label="Close program input panel"
                  title="Close program input panel"
                >
                  <PanelTopClose size={16} />
                </button>
              </div>
            </div>
            <textarea
              ref={stdinRef}
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
            value={stdinHeightPercent}
            min={STDIN_HEIGHT_MIN}
            max={STDIN_HEIGHT_MAX}
            step={5}
            onValueChange={onStdinHeightChange}
            onValueCommit={persistStdinHeight}
            onPointerDown={(event) =>
              stdinResize.handlePointerDown(event, stdinHeightPercent)
            }
            onPointerMove={stdinResize.handlePointerMove}
            onPointerUp={stdinResize.handlePointerUp}
            onPointerCancel={stdinResize.handlePointerCancel}
          />
        </>
      )}
      <div
        ref={lowerRef}
        className="runner-panel__lower"
        style={
          {
            gridTemplateRows: lowerRows,
            "--debugger-height": `${debuggerHeightPercent}%`,
            "--notes-height": `${notesHeightPercent}%`,
          } as CSSProperties
        }
      >
        <section className="runner-card output-card">
          <div className="panel-heading output-heading">
            <div>
              <span className="eyebrow">console</span>
              <h2>
                <TerminalSquare size={17} />
                Output
              </h2>
            </div>
            <div className="panel-actions">
              {stdinCollapsed && (
                <button
                  ref={showInputRef}
                  className="ghost-button ghost-button--small"
                  type="button"
                  onClick={onToggleStdin}
                >
                  <PanelTopOpen size={14} />
                  Show input
                </button>
              )}
              <button
                className="ghost-button ghost-button--small"
                type="button"
                onClick={onClear}
                disabled={status === "running" || status === "debug-running" || output.length === 0}
              >
                <Eraser size={14} />
                Clear
              </button>
            </div>
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

        {!debuggerCollapsed && (
          <ResizeHandle
            direction="vertical"
            label="Resize output and debugger panels"
            value={debuggerHeightPercent}
            min={DEBUGGER_HEIGHT_MIN}
            max={DEBUGGER_HEIGHT_MAX}
            step={5}
            onValueChange={onDebuggerHeightChange}
            onValueCommit={persistDebuggerHeight}
            onPointerDown={(event) =>
              debuggerResize.handlePointerDown(event, debuggerHeightPercent)
            }
            onPointerMove={debuggerResize.handlePointerMove}
            onPointerUp={debuggerResize.handlePointerUp}
            onPointerCancel={debuggerResize.handlePointerCancel}
          />
        )}
        <DebuggerPanel
          debugStatus={debugStatus}
          pausedInfo={debugPausedInfo}
          collapsed={debuggerCollapsed}
          onToggleCollapse={onToggleDebuggerCollapse}
          onHeightChange={onDebuggerHeightChange}
          onContinue={onDebugContinue}
          onStepOver={onDebugStepOver}
          onStepIn={onDebugStepIn}
          onStepOut={onDebugStepOut}
          onStop={onDebugStop}
          onSetVariable={onSetVariable}
          onSelectFrame={onSelectFrame}
          commandError={commandError}
        />

        {!notesCollapsed && (
          <ResizeHandle
            direction="vertical"
            label="Resize output and session notes panels"
            value={notesHeightPercent}
            min={NOTES_HEIGHT_MIN}
            max={NOTES_HEIGHT_MAX}
            step={5}
            onValueChange={onNotesHeightChange}
            onValueCommit={persistNotesHeight}
            onPointerDown={(event) =>
              notesResize.handlePointerDown(event, notesHeightPercent)
            }
            onPointerMove={notesResize.handlePointerMove}
            onPointerUp={notesResize.handlePointerUp}
            onPointerCancel={notesResize.handlePointerCancel}
          />
        )}
        <SessionNotesPanel
          ref={notesPanelRef}
          notesMarkdown={notesMarkdown}
          onNotesMarkdownChange={onNotesMarkdownChange}
          collapsed={notesCollapsed}
          onToggle={onToggleNotes}
        />
      </div>
    </aside>
  );
}
