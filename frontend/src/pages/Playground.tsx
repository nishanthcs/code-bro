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
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { CodeEditor } from "../components/CodeEditor";
import { ConflictDialog } from "../components/ConflictDialog";
import { EditorSettings } from "../components/EditorSettings";
import { ResizeHandle } from "../components/ResizeHandle";
import { RunnerPanel } from "../components/RunnerPanel";
import { SessionTagEditor } from "../components/SessionTagEditor";
import { useDragResize } from "../hooks/useDragResize";
import { useDirtyDraftNavigation } from "../hooks/useDirtyDraftNavigation";
import { getSession } from "../lib/api";
import {
  clampRunnerWidth,
  initialStdinCollapsed,
  initialRunnerWidth,
  initialStdinHeight,
  persistStdinCollapsed,
  persistRunnerWidth,
  RUNNER_WIDTH_MAX_RATIO,
  RUNNER_WIDTH_MIN,
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
    <span
      className={`save-indicator save-indicator--${status}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <Icon size={14} className={status === "saving" ? "spin" : ""} />
      {label}
    </span>
  );
}

function PlaygroundContent({
  session,
  focusSessionName,
}: {
  session: SessionResource;
  focusSessionName: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const autosave = useAutosave(session);
  const execution = useExecution();
  const [stdin, setStdin] = useState("");
  const [runnerWidth, setRunnerWidth] = useState(initialRunnerWidth);
  const [stdinHeightPercent, setStdinHeightPercent] = useState(initialStdinHeight);
  const [stdinCollapsed, setStdinCollapsed] = useState(initialStdinCollapsed);
  const [editorResetToken, setEditorResetToken] = useState(0);
  const sessionNameRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  useDirtyDraftNavigation({
    isDirty: autosave.isDirty,
    saveNow: autosave.saveNow,
    abandon: autosave.abandon,
  });
  const runnerWidthMax = Math.round(
    window.innerWidth * RUNNER_WIDTH_MAX_RATIO,
  );

  const runnerResize = useDragResize({
    direction: "horizontal",
    min: RUNNER_WIDTH_MIN,
    max: runnerWidthMax,
    onChange: setRunnerWidth,
    onCommit: (width) => persistRunnerWidth(clampRunnerWidth(width)),
  });

  const canRun =
    execution.workerReady &&
    ["ready", "completed", "failed", "stopped", "timed-out"].includes(
      execution.status,
    );

  const handleRun = useCallback(() => {
    if (!canRun) return;
    void autosave.saveNow();
    execution.run(autosave.draft.code, stdin);
  }, [autosave, canRun, execution, stdin]);

  useEffect(() => {
    if (!focusSessionName) return;
    sessionNameRef.current?.focus();
    sessionNameRef.current?.select();
    navigate(location.pathname, { replace: true, state: null });
  }, [focusSessionName, location.pathname, navigate]);

  useEffect(() => {
    const handlePlaygroundShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void autosave.saveNow();
        return;
      }
      if (modifier && event.key === "Enter") {
        event.preventDefault();
        handleRun();
        return;
      }
      if (event.key === "F2") {
        event.preventDefault();
        sessionNameRef.current?.focus();
        sessionNameRef.current?.select();
        return;
      }
      if (
        event.ctrlKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "t"
      ) {
        event.preventDefault();
        tagInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handlePlaygroundShortcut);
    return () =>
      window.removeEventListener("keydown", handlePlaygroundShortcut);
  }, [autosave, handleRun]);

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
              aria-keyshortcuts="Meta+Enter Control+Enter"
              title="Run code (Cmd/Ctrl+Enter)"
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
          <button className="back-button" type="button" onClick={() => navigate("/")}>
            <ArrowLeft size={17} />
            Sessions
          </button>
          <span className="workspace-divider" />
          <div className="workspace-session-fields">
            <input
              ref={sessionNameRef}
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
              aria-keyshortcuts="F2"
              title="Session name (F2)"
            />
            <SessionTagEditor
              tags={autosave.draft.tags}
              onChange={(tags) =>
                autosave.setDraft((current) => ({ ...current, tags }))
              }
              inputRef={tagInputRef}
            />
          </div>
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
                <span className="editor-meta editor-tab-hint">
                  Esc then Tab exits editor
                </span>
                <span className="editor-meta">
                  {autosave.draft.code.split("\n").length} lines
                </span>
              </div>
            </div>
            <CodeEditor
              key={session.id}
              value={autosave.draft.code}
              sessionId={session.id}
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
            value={runnerWidth}
            min={RUNNER_WIDTH_MIN}
            max={runnerWidthMax}
            step={10}
            onValueChange={setRunnerWidth}
            onValueCommit={(width) =>
              persistRunnerWidth(clampRunnerWidth(width))
            }
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
            stdinCollapsed={stdinCollapsed}
            onToggleStdin={() =>
              setStdinCollapsed((collapsed) => {
                const next = !collapsed;
                persistStdinCollapsed(next);
                return next;
              })
            }
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
  const location = useLocation();
  const [loadState, setLoadState] = useState<{
    sessionId: string;
    session: SessionResource | null;
    error: string;
  }>({ sessionId: "", session: null, error: "" });
  const session =
    loadState.sessionId === sessionId ? loadState.session : null;
  const error = loadState.sessionId === sessionId ? loadState.error : "";

  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    let active = true;
    getSession(sessionId, controller.signal)
      .then((loadedSession) => {
        if (active) {
          setLoadState({
            sessionId,
            session: loadedSession,
            error: "",
          });
        }
      })
      .catch((loadError: unknown) => {
        if (!active || controller.signal.aborted) return;
        setLoadState({
          sessionId,
          session: null,
          error:
            loadError instanceof Error
              ? loadError.message
              : "Session not found.",
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
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
  const focusSessionName = Boolean(
    (location.state as { focusSessionName?: boolean } | null)
      ?.focusSessionName,
  );
  return (
    <PlaygroundContent
      key={session.id}
      session={session}
      focusSessionName={focusSessionName}
    />
  );
}
