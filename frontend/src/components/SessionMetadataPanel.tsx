import { ChevronDown, ChevronRight, ExternalLink, FileText } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useId,
  useImperativeHandle,
  useMemo,
  useState,
  type RefObject,
} from "react";
import { shortenReferenceUrl } from "../lib/referenceUrl";
import { SessionReferenceField } from "./SessionReferenceField";
import { SessionTagEditor } from "./SessionTagEditor";

const STORAGE_KEY = "codebro-session-metadata-expanded";

function initialExpanded(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistExpanded(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // The preference is optional when browser storage is unavailable.
  }
}

export interface SessionMetadataPanelHandle {
  expand: () => void;
  toggle: () => void;
}

interface SessionMetadataPanelProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  refUrl: string | null;
  onRefUrlChange: (url: string | null) => void;
  notesMarkdown: string;
  tagInputRef?: RefObject<HTMLInputElement | null>;
}

export const SessionMetadataPanel = forwardRef<
  SessionMetadataPanelHandle,
  SessionMetadataPanelProps
>(function SessionMetadataPanel(
  {
    tags,
    onTagsChange,
    refUrl,
    onRefUrlChange,
    notesMarkdown,
    tagInputRef,
  },
  ref,
) {
  const [expanded, setExpandedState] = useState(initialExpanded);
  const contentId = useId();

  const setExpanded = useCallback((value: boolean) => {
    setExpandedState(value);
    persistExpanded(value);
  }, []);
  const toggle = useCallback(() => {
    setExpandedState((current) => {
      const next = !current;
      persistExpanded(next);
      return next;
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      expand: () => setExpanded(true),
      toggle,
    }),
    [setExpanded, toggle],
  );

  const visibleTags = useMemo(() => tags.slice(0, 2), [tags]);
  const remainingCount = Math.max(0, tags.length - visibleTags.length);
  const trimmedNotes = notesMarkdown.trim();
  const noteWordCount = trimmedNotes ? trimmedNotes.split(/\s+/u).length : 0;

  return (
    <section
      className={`metadata-panel ${expanded ? "metadata-panel--expanded" : ""}`}
      aria-label="Session metadata"
    >
      <button
        type="button"
        className="metadata-panel__toggle"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls={contentId}
        aria-keyshortcuts="Control+Shift+M"
        title="Toggle metadata (Ctrl+Shift+M)"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Metadata
        {!expanded && (
          <span className="metadata-panel__summary">
            {visibleTags.length > 0 && (
              <span className="metadata-panel__tags">
                {visibleTags.map((tag) => (
                  <span className="tag-chip" key={tag}>
                    {tag}
                  </span>
                ))}
                {remainingCount > 0 && (
                  <span className="metadata-panel__remaining">
                    +{remainingCount}
                  </span>
                )}
              </span>
            )}
            {refUrl && (
              <span className="metadata-panel__ref">
                <ExternalLink size={11} />
                {shortenReferenceUrl(refUrl, 34)}
              </span>
            )}
            {trimmedNotes && (
              <span className="metadata-panel__notes-indicator">
                <FileText size={11} />
                {notesMarkdown.length} chars · {noteWordCount} words
              </span>
            )}
          </span>
        )}
      </button>
      {expanded && (
        <div id={contentId} className="metadata-panel__content">
          <SessionTagEditor
            tags={tags}
            onChange={onTagsChange}
            inputRef={tagInputRef}
          />
          <SessionReferenceField
            key={refUrl ?? ""}
            value={refUrl}
            onChange={onRefUrlChange}
          />
        </div>
      )}
    </section>
  );
});
