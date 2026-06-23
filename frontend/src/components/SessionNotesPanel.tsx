import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import {
  forwardRef,
  useId,
  useImperativeHandle,
  useRef,
  type RefObject,
} from "react";
import { SessionNotesEditor, type SessionNotesEditorHandle } from "./SessionNotesEditor";

export interface SessionNotesPanelHandle {
  focus: () => void;
}

interface SessionNotesPanelProps {
  notesMarkdown: string;
  onNotesMarkdownChange: (markdown: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  editorRef?: RefObject<SessionNotesEditorHandle | null>;
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
    editorRef,
  },
  ref,
) {
  const contentId = useId();
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        if (collapsed) {
          toggleRef.current?.focus();
        } else if (editorRef?.current) {
          editorRef.current.focus();
        }
      },
    }),
    [collapsed, editorRef],
  );

  const trimmedNotes = notesMarkdown.trim();
  const noteWordCount = trimmedNotes ? trimmedNotes.split(/\s+/u).length : 0;

  return (
    <section
      className={`runner-card notes-panel ${collapsed ? "notes-panel--collapsed" : "notes-panel--expanded"}`}
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
        />
      </div>
    </section>
  );
});