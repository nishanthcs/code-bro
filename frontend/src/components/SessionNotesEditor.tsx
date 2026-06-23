import { Bold, Code, Heading1, Italic, Link, List, Pilcrow } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const MAX_NOTES_BYTES = 128 * 1_024;
const ALLOWED_MARKDOWN_ELEMENTS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "ul",
  "ol",
  "li",
  "blockquote",
  "strong",
  "em",
  "code",
  "pre",
  "hr",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "del",
  "input",
];

function wrapSelection(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
): string {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  const nextValue =
    textarea.value.slice(0, start) +
    before +
    selected +
    after +
    textarea.value.slice(end);
  textarea.value = nextValue;
  textarea.setSelectionRange(
    start + before.length,
    start + before.length + selected.length,
  );
  textarea.focus();
  return nextValue;
}

function prefixCurrentLine(
  textarea: HTMLTextAreaElement,
  prefix: string,
): string {
  const start = textarea.selectionStart;
  const lineStart = textarea.value.lastIndexOf("\n", start - 1) + 1;
  const nextValue =
    textarea.value.slice(0, lineStart) +
    prefix +
    textarea.value.slice(lineStart);
  textarea.value = nextValue;
  const cursor = start + prefix.length;
  textarea.setSelectionRange(cursor, cursor);
  textarea.focus();
  return nextValue;
}

const safeComponents: Components = {
  a: ({ href, children, ...props }) => (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
    >
      {children}
    </a>
  ),
  img: () => null,
};

export interface SessionNotesEditorHandle {
  focus: () => void;
}

export const SessionNotesEditor = forwardRef<
  SessionNotesEditorHandle,
  { value: string; onChange: (value: string) => void }
>(function SessionNotesEditor({ value, onChange }, ref) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        if (mode === "edit") {
          textareaRef.current?.focus();
        } else {
          containerRef.current?.querySelector<HTMLButtonElement>(".notes-editor__tab")?.focus();
        }
      },
    }),
    [mode],
  );

  const commitValue = useCallback(
    (nextValue: string) => {
      if (new TextEncoder().encode(nextValue).byteLength > MAX_NOTES_BYTES) {
        setError("Notes must be 128 KiB or smaller");
        return;
      }
      setError("");
      onChange(nextValue);
    },
    [onChange],
  );

  const applyToolbar = useCallback(
    (formatter: (textarea: HTMLTextAreaElement) => string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      commitValue(formatter(textarea));
    },
    [commitValue],
  );

  const tools = useMemo(
    () => [
      {
        label: "Bold",
        icon: Bold,
        action: (textarea: HTMLTextAreaElement) =>
          wrapSelection(textarea, "**", "**"),
      },
      {
        label: "Italic",
        icon: Italic,
        action: (textarea: HTMLTextAreaElement) =>
          wrapSelection(textarea, "_", "_"),
      },
      {
        label: "Heading",
        icon: Heading1,
        action: (textarea: HTMLTextAreaElement) =>
          prefixCurrentLine(textarea, "### "),
      },
      {
        label: "List",
        icon: List,
        action: (textarea: HTMLTextAreaElement) =>
          prefixCurrentLine(textarea, "- "),
      },
      {
        label: "Code",
        icon: Code,
        action: (textarea: HTMLTextAreaElement) =>
          wrapSelection(textarea, "`", "`"),
      },
      {
        label: "Link",
        icon: Link,
        action: (textarea: HTMLTextAreaElement) =>
          wrapSelection(textarea, "[", "](https://example.com)"),
      },
    ],
    [],
  );

  return (
    <div ref={containerRef} className="notes-editor">
      <div className="notes-editor__toolbar">
        <div className="notes-editor__formatting">
          {tools.map((tool) => (
            <button
              key={tool.label}
              type="button"
              className="notes-editor__tool"
              title={tool.label}
              disabled={mode === "preview"}
              onClick={() => applyToolbar(tool.action)}
              aria-label={tool.label}
            >
              <tool.icon size={14} />
            </button>
          ))}
        </div>
        <div className="notes-editor__tabs">
          <button
            type="button"
            className={`notes-editor__tab ${mode === "edit" ? "notes-editor__tab--active" : ""}`}
            onClick={() => setMode("edit")}
            aria-pressed={mode === "edit"}
          >
            <Pilcrow size={13} />
            Edit
          </button>
          <button
            type="button"
            className={`notes-editor__tab ${mode === "preview" ? "notes-editor__tab--active" : ""}`}
            onClick={() => setMode("preview")}
            aria-pressed={mode === "preview"}
          >
            <Pilcrow size={13} />
            Preview
          </button>
        </div>
      </div>
      {error && (
        <span className="notes-editor__error" role="alert">
          {error}
        </span>
      )}
      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
          className="notes-editor__textarea"
          value={value}
          onChange={(event) => commitValue(event.target.value)}
          placeholder="Write Markdown notes…"
          aria-label="Session notes"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      ) : (
        <div className="notes-editor__preview" aria-label="Notes preview">
          {value.trim() ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={safeComponents}
              allowedElements={ALLOWED_MARKDOWN_ELEMENTS}
              skipHtml
            >
              {value}
            </ReactMarkdown>
          ) : (
            <span className="notes-editor__placeholder">No notes yet</span>
          )}
        </div>
      )}
    </div>
  );
});
