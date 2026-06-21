/* eslint-disable react-hooks/refs -- useExecution returns stable frame bindings, not render-read ref values. */
import {
  ArrowLeft,
  Check,
  CloudAlert,
  LoaderCircle,
  Play,
  RotateCcw,
  Save,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { CodeEditor } from "../components/CodeEditor";
import { ConflictDialog } from "../components/ConflictDialog";
import { EditorSettings } from "../components/EditorSettings";
import { ResizeHandle } from "../components/ResizeHandle";
import { RunnerPanel } from "../components/RunnerPanel";
import { useDragResize } from "../hooks/useDragResize";
import { getSession } from "../lib/api";
import {
  clampRunnerWidth,
  initialRunnerWidth,
  initialStdinHeight,
  persistRunnerWidth,
} from "../lib/preferences";
import { useAutosave } from "../hooks/useAutosave";
import { useExecution } from "../hooks/useExecution";
import type { SaveStatus, SessionResource } from "../types";

function SaveIndicator({ status }: { status: SaveStatus }) {
  const content = {
    saved: [Check, "Saved"],
    scheduled: [Save, "Unsaved"],
    saving: [LoaderCircle, "Saving"],
    failed: [CloudAlert, "Save failed"],
    conflict: [RotateCcw, "Conflict"],
  } as const;
  const [Icon, label] = content[status];
  return (
    <span className={`save-indicator save-indicator--${status}`}>
      <Icon size={14} className={status === "saving" ? "spin" : ""} />
      {label}
    </span>
  );
}

function PlaygroundContent({ session }: { session: SessionResource }) {
  const navigate = useNavigate();
  const autosave = useAutosave(session);
  const execution = useExecution();
  const [stdin, setStdin] = useState("");
  const [runnerWidth, setRunnerWidth] = useState(initialRunnerWidth);
  const [stdinHeightPercent, setStdinHeightPercent] = useState(initialStdinHeight);
  const [editorResetToken, setEditorResetToken] = useState(0);

  const runnerResize = useDragResize({
    direction: "horizontal",
    min: 280,
    max: Math.round(window.innerWidth * 0.55),
    onChange: setRunnerWidth,
    onCommit: (width) => persistRunnerWidth(clampRunnerWidth(width)),
  });

  const handleRun = useCallback(() => {
    void autosave.saveNow();
    execution.run(autosave.draft.code, stdin);
  }, [autosave, execution, stdin]);

  const handleBack = async () => {
    if (autosave.isDirty) {
      const saved = await autosave.saveNow();
      if (!saved && !window.confirm("Leave without saving your latest changes?")) {
        return;
      }
    }
    navigate("/");
  };

  const canRun =
    execution.workerReady &&
    ["ready", "completed", "failed", "stopped", "timed-out"].includes(
      execution.status,
    );

  return (
    <AppShell
      compact
      actions={
        <>
          <SaveIndicator status={autosave.status} />
          {execution.status === "running" ? (
            <button className="stop-button" type="button" onClick={execution.stop}>
              <Square size={15} fill="currentColor" />
              Stop
            </button>
          ) : (
            <button
              className="run-button"
              type="button"
              onClick={handleRun}
              disabled={!canRun}
            >
              {!execution.workerReady ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Play size={16} fill="currentColor" />
              )}
              {execution.status === "loading"
                ? "Loading Python"
                : !execution.workerReady
                  ? "Resetting"
                  : "Run"}
              <kbd>⌘↵</kbd>
            </button>
          )}
        </>
      }
    >
      <main className="playground">
        <div className="workspace-bar">
          <button className="back-button" type="button" onClick={handleBack}>
            <ArrowLeft size={17} />
            Sessions
          </button>
          <span className="workspace-divider" />
          <input
            className="session-name-input"
            value={autosave.draft.name}
            onChange={(event) =>
              autosave.setDraft((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            maxLength={120}
            aria-label="Session name"
          />
          <span className="language-pill">
            <span />
            Python
          </span>
        </div>
        <div
          className="workspace-grid"
          style={{ "--runner-width": `${runnerWidth}px` } as CSSProperties}
        >
          <section className="editor-card">
            <div className="editor-tabbar">
              <span className="editor-tab editor-tab--active">
                <span className="python-dot" />
                main.py
              </span>
              <div className="editor-tabbar__meta">
                <EditorSettings />
                <span className="editor-meta">
                  {autosave.draft.code.split("\n").length} lines
                </span>
              </div>
            </div>
            <CodeEditor
              key={session.id}
              value={autosave.draft.code}
              onChange={(code) =>
                autosave.setDraft((current) => ({ ...current, code }))
              }
              onRun={handleRun}
              resetToken={editorResetToken}
            />
          </section>
          <ResizeHandle
            direction="horizontal"
            label="Resize editor and runner panels"
            onPointerDown={(event) =>
              runnerResize.handlePointerDown(event, runnerWidth)
            }
            onPointerMove={runnerResize.handlePointerMove}
            onPointerUp={runnerResize.handlePointerUp}
            onPointerCancel={runnerResize.handlePointerCancel}
          />
          <RunnerPanel
            stdin={stdin}
            onStdinChange={setStdin}
            output={execution.output}
            status={execution.status}
            durationMs={execution.durationMs}
            onClear={execution.clearOutput}
            stdinHeightPercent={stdinHeightPercent}
            onStdinHeightChange={setStdinHeightPercent}
          />
        </div>
      </main>
      <iframe
        ref={execution.setFrameElement}
        className="execution-frame"
        src={execution.iframeSrc}
        title="CodeBro Python execution host"
        sandbox="allow-scripts allow-same-origin"
        onLoad={execution.initialize}
      />
      {autosave.conflict && (
        <ConflictDialog
          server={autosave.conflict}
          onKeepLocal={() => void autosave.keepLocal()}
          onLoadServer={() => {
            autosave.loadServer();
            setEditorResetToken((token) => token + 1);
          }}
        />
      )}
    </AppShell>
  );
}

export function Playground() {
  const { sessionId } = useParams();
  const [session, setSession] = useState<SessionResource | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionId) return;
    getSession(sessionId)
      .then(setSession)
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error ? loadError.message : "Session not found.",
        ),
      );
  }, [sessionId]);

  if (error) {
    return (
      <AppShell>
        <main className="not-found">
          <span className="empty-icon">
            <CloudAlert size={28} />
          </span>
          <h1>Session unavailable</h1>
          <p>{error}</p>
          <a className="primary-button" href="/">
            Back to sessions
          </a>
        </main>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell compact>
        <div className="page-loader">
          <LoaderCircle className="spin" />
          Loading session
        </div>
      </AppShell>
    );
  }
  return <PlaygroundContent session={session} />;
}
