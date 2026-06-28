import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Bug, LoaderCircle } from "lucide-react";
import type { DebugPausedInfo } from "../types";

export interface DebuggerPanelProps {
  debugStatus: "idle" | "attaching" | "attached" | "detached" | "error";
  pausedInfo: DebugPausedInfo | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onHeightChange: (percent: number) => void;
  onContinue: () => void;
  onStepOver: () => void;
  onStepIn: () => void;
  onStepOut: () => void;
  onStop: () => void;
  onSetVariable?: (
    pauseId: string,
    frameId: string,
    scope: "local" | "global",
    name: string,
    literal: string
  ) => void;
  onSelectFrame?: (frameId: string) => void;
  commandError?: string | null;
}

export function DebuggerPanel({
  debugStatus,
  pausedInfo,
  collapsed,
  onToggleCollapse,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onHeightChange,
  onContinue,
  onStepOver,
  onStepIn,
  onStepOut,
  onStop,
  onSetVariable,
  onSelectFrame,
  commandError,
}: DebuggerPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [editingVar, setEditingVar] = useState<{
    scope: string;
    name: string;
    value: string;
  } | null>(null);

  // Clear editing and frame selection states when we step/continue (reason changes or pause ID changes)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditingVar(null);
    setSelectedFrameId(null);
  }, [pausedInfo?.pauseId]);

  const isPaused = debugStatus === "attached" && pausedInfo !== null;

  return (
    <section
      ref={panelRef}
      className={`runner-card debugger-panel ${
        collapsed ? "debugger-panel--collapsed" : "debugger-panel--expanded"
      }`}
      aria-label="Python Debugger"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">debugger</span>
          <h2 className="debugger-panel__title">
            <Bug size={17} />
            <span>Debugger</span>
            {isPaused && pausedInfo && (
              <span className="debugger-panel__location">
                Line {pausedInfo.location.line}
              </span>
            )}
          </h2>
        </div>
        <div className="panel-actions">
          <button
            className="icon-button icon-button--quiet panel-toggle"
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand debugger panel" : "Collapse debugger panel"}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="debugger-controls">
            {isPaused && pausedInfo ? (
              <>
                <button
                  className="debug-btn debugger-button"
                  type="button"
                  onClick={onContinue}
                  title="Continue (F5)"
                  aria-label="Continue debugging"
                >
                  Continue <kbd>F5</kbd>
                </button>
                <button
                  className="debug-btn debugger-button"
                  type="button"
                  onClick={onStepOver}
                  title="Step Over (F10)"
                  aria-label="Step over"
                >
                  Step Over <kbd>F10</kbd>
                </button>
                <button
                  className="debug-btn debugger-button"
                  type="button"
                  onClick={onStepIn}
                  title="Step Into (F11)"
                  aria-label="Step into"
                >
                  Step In <kbd>F11</kbd>
                </button>
                <button
                  className="debug-btn debugger-button"
                  type="button"
                  onClick={onStepOut}
                  title="Step Out (Shift+F11)"
                  aria-label="Step out"
                >
                  Step Out <kbd>⇧F11</kbd>
                </button>
              </>
            ) : debugStatus === "attached" ? (
              <p className="debugger-status-text">
                <LoaderCircle size={14} className="spin" />
                Debug session is running...
              </p>
            ) : (
              <p className="debugger-status-text debugger-status-text--muted">
                No active debug session. Click Debug to start.
              </p>
            )}
            {debugStatus === "attached" && (
              <button
                className="debug-btn debugger-button stop-button"
                type="button"
                onClick={onStop}
                title="Stop Debug"
                aria-label="Stop Debugging"
              >
                Stop Debug
              </button>
            )}
          </div>

          <div
            className="debugger-content"
          >
            {commandError && (
              <div className="debugger-command-error" role="alert">
                {commandError}
              </div>
            )}
            {isPaused && pausedInfo ? (
              <>
                <div className="debugger-stack">
                  <span className="eyebrow debugger-section-label">call stack</span>
                  {pausedInfo.stack && pausedInfo.stack.length > 0 ? (
                    <ul className="debugger-stack__frames">
                      {pausedInfo.stack.map((frame, index) => {
                        const isActive = selectedFrameId
                          ? frame.id === selectedFrameId
                          : index === 0;
                        return (
                          <li
                            key={frame.id}
                            className={`debug-stack-frame ${
                              isActive ? "debug-stack-frame--active" : ""
                            }`}
                            onClick={() => {
                              setSelectedFrameId(frame.id);
                              if (onSelectFrame) {
                                onSelectFrame(frame.id);
                              }
                            }}
                          >
                            <span className="debug-stack-frame__function">{frame.function}</span>
                            <span className="debug-stack-frame__location">
                              {frame.file}:{frame.line}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="debugger-empty">No call stack available</p>
                  )}
                </div>

                <div className="debugger-variables">
                  <span className="eyebrow debugger-section-label">variables</span>
                  <div className="debugger-variables__scopes">
                    {pausedInfo.scopes &&
                      pausedInfo.scopes.map((scope) => (
                        <div key={scope.name} className="debugger-scope">
                          <h5 className="debugger-scope__title">
                            {scope.name}
                          </h5>
                          {scope.variables && scope.variables.length > 0 ? (
                            <ul
                              className="debugger-variables__list"
                            >
                              {scope.variables.map((variable) => {
                                const isEditing =
                                  editingVar &&
                                  editingVar.scope === scope.name.toLowerCase() &&
                                  editingVar.name === variable.name;
                                return (
                                  <li key={variable.name} className="debug-variable">
                                    <span className="debug-variable__name">{variable.name}</span>
                                    {isEditing ? (
                                      <div className="debug-variable__edit-wrap">
                                        <form
                                          className="debug-variable__editor"
                                          onSubmit={(e) => {
                                            e.preventDefault();
                                            if (onSetVariable) {
                                              const activeFrameId =
                                                selectedFrameId || pausedInfo.stack[0]?.id;
                                              onSetVariable(
                                                pausedInfo.pauseId,
                                                activeFrameId,
                                                scope.name.toLowerCase() as "local" | "global",
                                                variable.name,
                                                editingVar.value
                                              );
                                            }
                                          }}
                                        >
                                          <input
                                            autoFocus
                                            aria-label={`Set variable ${variable.name}`}
                                            className="debug-variable__input"
                                            value={editingVar.value}
                                            onChange={(e) =>
                                              setEditingVar({
                                                ...editingVar,
                                                value: e.target.value,
                                              })
                                            }
                                          />
                                          <button
                                            type="submit"
                                            className="ghost-button ghost-button--small"
                                            aria-label={`Apply variable ${variable.name}`}
                                          >
                                            Apply
                                          </button>
                                          <button
                                            type="button"
                                            className="ghost-button ghost-button--small"
                                            aria-label={`Cancel editing variable ${variable.name}`}
                                            onClick={() => setEditingVar(null)}
                                          >
                                            Cancel
                                          </button>
                                        </form>
                                        {commandError && (
                                          <span
                                            className="error-text"
                                          >
                                            {commandError}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <>
                                        <span
                                          className="debug-variable__value"
                                          title={variable.preview}
                                        >
                                          {variable.preview}
                                        </span>
                                        <span className="debug-variable__type">
                                          {variable.typeName}
                                        </span>
                                        {variable.editable && onSetVariable && (
                                          <button
                                            className="ghost-button ghost-button--small edit-var-btn"
                                            type="button"
                                            aria-label={`Edit variable ${variable.name}`}
                                            onClick={() =>
                                              setEditingVar({
                                                scope: scope.name.toLowerCase(),
                                                name: variable.name,
                                                value: variable.preview,
                                              })
                                            }
                                          >
                                            Edit
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <div className="debugger-empty">No variables in this scope</div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
                {pausedInfo?.reason === "entry" && (
                  <div className="debugger-entry-hint">
                    Paused at entry. Press <strong>Continue (F5)</strong> to start executing.
                  </div>
                )}
              </>
            ) : (
              <p className="debugger-empty">Debugger is not paused.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
