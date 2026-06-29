import { type CSSProperties } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

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

export interface SessionNotesPreviewProps {
  value: string;
  className?: string;
  fontSize?: number;
  ariaLabel?: string;
}

export function SessionNotesPreview({
  value,
  className,
  fontSize,
  ariaLabel,
}: SessionNotesPreviewProps) {
  return (
    <div
      className={`notes-preview ${className ?? ""}`}
      style={{ "--notes-font-size": `${fontSize ?? 14}px` } as CSSProperties}
      aria-label={ariaLabel}
    >
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
        <span className="notes-preview__placeholder">No notes yet</span>
      )}
    </div>
  );
}
