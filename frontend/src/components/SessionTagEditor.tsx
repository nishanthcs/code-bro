import { X } from "lucide-react";
import {
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 32;

function normalizeTag(value: string): string {
  return value.trim().normalize("NFKC");
}

export function SessionTagEditor({
  tags,
  onChange,
  inputRef,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const commit = (input = value) => {
    const candidates = input.split(",");
    const next = [...tags];
    const seen = new Set(tags.map((tag) => tag.toLocaleLowerCase()));
    let validationError = "";

    for (const candidate of candidates) {
      const tag = normalizeTag(candidate);
      if (!tag) continue;
      if (tag.length > MAX_TAG_LENGTH) {
        validationError = `Tags must be ${MAX_TAG_LENGTH} characters or fewer.`;
        continue;
      }
      const key = tag.toLocaleLowerCase();
      if (seen.has(key)) continue;
      if (next.length >= MAX_TAGS) {
        validationError = `A session can have at most ${MAX_TAGS} tags.`;
        break;
      }
      next.push(tag);
      seen.add(key);
    }

    if (next.length !== tags.length) onChange(next);
    setValue("");
    setError(validationError);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === "Backspace" && !value && tags.length > 0) {
      onChange(tags.slice(0, -1));
      setError("");
    }
  };

  return (
    <div className="tag-editor">
      <span className="tag-editor__label" aria-hidden="true">
        Tags
      </span>
      <div className="tag-editor__items">
        {tags.map((tag) => (
          <span className="tag-chip" key={tag.toLocaleLowerCase()}>
            {tag}
            <button
              type="button"
              onClick={() => {
                onChange(tags.filter((item) => item !== tag));
                setError("");
              }}
              aria-label={`Remove tag ${tag}`}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => commit()}
          placeholder={tags.length ? "Add" : "Add tags"}
          aria-label="Add session tag"
          aria-describedby={error ? "session-tag-error" : undefined}
          aria-keyshortcuts="Control+Shift+T"
        />
      </div>
      {error && (
        <span id="session-tag-error" className="tag-editor__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
