import { Minus, Plus, X } from "lucide-react";
import { type RefObject, useEffect } from "react";
import { useModalFocus } from "../hooks/useModalFocus";
import type { NotesFontSize } from "../lib/preferences";
import type { SessionNotesMode } from "../types";
import { SessionNotesEditor } from "./SessionNotesEditor";

const NOTES_FONT_SIZES = [12, 14, 16, 18, 20, 22] as const;

interface SessionNotesFullscreenProps {
  open: boolean;
  notesMarkdown: string;
  onNotesMarkdownChange: (markdown: string) => void;
  fontSize: NotesFontSize;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
  mode: SessionNotesMode;
  onModeChange: (mode: SessionNotesMode) => void;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function SessionNotesFullscreen({
  open,
  notesMarkdown,
  onNotesMarkdownChange,
  fontSize,
  onIncreaseFontSize,
  onDecreaseFontSize,
  mode,
  onModeChange,
  onClose,
  returnFocusRef,
}: SessionNotesFullscreenProps) {
  const dialogRef = useModalFocus<HTMLDivElement>({
    active: open,
    returnFocusRef,
  });

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const canDecrease = fontSize > NOTES_FONT_SIZES[0];
  const canIncrease = fontSize < NOTES_FONT_SIZES[NOTES_FONT_SIZES.length - 1];

  return (
    <div className="notes-fullscreen-backdrop">
      <div
        ref={dialogRef}
        className="notes-fullscreen-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notes-fullscreen-title"
      >
        <div className="notes-fullscreen-header">
          <h2 id="notes-fullscreen-title">Session Notes</h2>
          <div className="notes-fullscreen-actions">
            <button
              type="button"
              className="ghost-button ghost-button--small"
              onClick={onDecreaseFontSize}
              disabled={!canDecrease}
              aria-label="Decrease notes font size"
            >
              <Minus size={14} />
            </button>
            <span className="notes-fullscreen-font-size">{fontSize}px</span>
            <button
              type="button"
              className="ghost-button ghost-button--small"
              onClick={onIncreaseFontSize}
              disabled={!canIncrease}
              aria-label="Increase notes font size"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              className="ghost-button ghost-button--small"
              onClick={onClose}
              aria-label="Close full screen notes"
              title="Close full screen notes"
            >
              <X size={14} />
              Close
            </button>
          </div>
        </div>
        <div className="notes-fullscreen-content">
          <SessionNotesEditor
            value={notesMarkdown}
            onChange={onNotesMarkdownChange}
            mode={mode}
            onModeChange={onModeChange}
            notesFontSize={fontSize}
          />
        </div>
      </div>
    </div>
  );
}
