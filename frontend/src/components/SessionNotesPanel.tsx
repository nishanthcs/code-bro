import { ChevronDown, ChevronRight, FileText, Maximize2, Minus, Plus } from "lucide-react";
import {
  forwardRef,
  useId,
  useImperativeHandle,
  useRef,
  type RefObject,
} from "react";
import { SessionNotesEditor, type SessionNotesEditorHandle } from "./SessionNotesEditor";
import type { SessionNotesMode } from "../types";
import type { NotesFontSize } from "../lib/preferences";

export interface SessionNotesPanelHandle {
  focus: () => void;
}

interface SessionNotesPanelProps {
  notesMarkdown: string;
  onNotesMarkdownChange: (markdown: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  mode: SessionNotesMode;
  onModeChange: (mode: SessionNotesMode) => void;
  notesFontSize: NotesFontSize;
  onIncreaseNotesFontSize: () => void;
  onDecreaseNotesFontSize: () => void;
  fullscreenButtonRef: RefObject<HTMLButtonElement | null>;
}

export const SessionNotesPanel = forwardRef<
  SessionNotesPanelHandle,
  SessionNotesPanelProps
>(function SessionNotesPanel(
  {
    notesMarkdown,
    onNotesMarkdownChange,
    collapsed,
    onToggle,
    fullscreen,
    onToggleFullscreen,
    mode,
    onModeChange,
    notesFontSize,
    onIncreaseNotesFontSize,
    onDecreaseNotesFontSize,
    fullscreenButtonRef,
  },
  ref,
) {
  const contentId = useId();
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const editorRef = useRef<SessionNotesEditorHandle | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        if (collapsed) {
          toggleRef.current?.focus();
        } else {
          editorRef.current?.focus();
        }
      },
    }),
    [collapsed],
  );

  const trimmedNotes = notesMarkdown.trim();
  const noteWordCount = trimmedNotes ? trimmedNotes.split(/\s+/u).length : 0;

  const NOTES_FONT_SIZES = [12, 14, 16, 18, 20, 22] as const;
  const canDecrease = notesFontSize > NOTES_FONT_SIZES[0];
  const canIncrease = notesFontSize < NOTES_FONT_SIZES[NOTES_FONT_SIZES.length - 1];

  return (
    <section
      className={`runner-card notes-panel ${collapsed ? "notes-panel--collapsed" : "notes-panel--expanded"} ${fullscreen ? "notes-panel--fullscreen" : ""}`}
      aria-label="Session notes"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">notes</span>
          <h2>
            <FileText size={17} />
            Session Notes
          </h2>
        </div>
        <div className="panel-actions">
          {trimmedNotes && (
            <span className="panel-hint">
              {notesMarkdown.length} chars · {noteWordCount} words
            </span>
          )}
          <button
            className="icon-button icon-button--quiet panel-toggle"
            type="button"
            onClick={onDecreaseNotesFontSize}
            disabled={!canDecrease}
            aria-label="Decrease notes font size"
            title="Decrease notes font size"
          >
            <Minus size={16} />
          </button>
          <button
            className="icon-button icon-button--quiet panel-toggle"
            type="button"
            onClick={onIncreaseNotesFontSize}
            disabled={!canIncrease}
            aria-label="Increase notes font size"
            title="Increase notes font size"
          >
            <Plus size={16} />
          </button>
          <button
            ref={fullscreenButtonRef}
            className="icon-button icon-button--quiet panel-toggle"
            type="button"
            onClick={onToggleFullscreen}
            aria-label={"Open notes full screen"}
            title={"Open notes full screen"}
          >
            <Maximize2 size={16} />
          </button>
          <button
            ref={toggleRef}
            className="icon-button icon-button--quiet panel-toggle"
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand session notes panel" : "Collapse session notes panel"}
            aria-expanded={!collapsed}
            aria-controls={contentId}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      <div
        id={contentId}
        className="notes-panel__body"
        hidden={collapsed}
      >
        <SessionNotesEditor
          ref={editorRef}
          value={notesMarkdown}
          onChange={onNotesMarkdownChange}
          mode={mode}
          onModeChange={onModeChange}
          notesFontSize={notesFontSize}
        />
      </div>
    </section>
  );
});
