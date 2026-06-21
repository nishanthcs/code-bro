import { X } from "lucide-react";
import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { getTagSuggestions } from "../lib/api";

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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [allTags, setAllTags] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const activeInputRef = inputRef || internalInputRef;

  useEffect(() => {
    const controller = new AbortController();
    getTagSuggestions(controller.signal)
      .then((tags) => setAllTags(tags))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const commit = useCallback(
    (input: string) => {
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
      setShowSuggestions(false);
    },
    [tags, onChange],
  );

  const handleInputChange = (input: string) => {
    setValue(input);
    setError("");
    if (input.length >= 1) {
      const lower = input.toLocaleLowerCase();
      const filtered = allTags.filter(
        (tag) =>
          tag.toLocaleLowerCase().includes(lower) &&
          !tags.some(
            (t) => t.toLocaleLowerCase() === tag.toLocaleLowerCase(),
          ),
      );
      setSuggestions(filtered.slice(0, 10));
      setShowSuggestions(filtered.length > 0);
      setActiveSuggestionIndex(0);
    } else {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  };

  const selectSuggestion = (tag: string) => {
    commit(tag);
    activeInputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveSuggestionIndex((prev) =>
          Math.min(prev + 1, suggestions.length - 1),
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveSuggestionIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (
        (event.key === "Enter" || event.key === "Tab") &&
        activeSuggestionIndex >= 0 &&
        activeSuggestionIndex < suggestions.length
      ) {
        event.preventDefault();
        selectSuggestion(suggestions[activeSuggestionIndex]);
        return;
      }
      if (event.key === "Escape") {
        setShowSuggestions(false);
        return;
      }
    }
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit(value);
      return;
    }
    if (event.key === "Backspace" && !value && tags.length > 0) {
      onChange(tags.slice(0, -1));
      setError("");
    }
  };

  const handleBlur = () => {
    commit(value);
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
          ref={activeInputRef}
          value={value}
          onChange={(event) => handleInputChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={tags.length ? "Add" : "Add tags"}
          aria-label="Add session tag"
          aria-describedby={error ? "session-tag-error" : undefined}
          aria-keyshortcuts="Control+Shift+T"
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls="tag-suggestions-list"
          aria-autocomplete="list"
          aria-activedescendant={
            showSuggestions && suggestions.length > 0
              ? `tag-suggestion-${activeSuggestionIndex}`
              : undefined
          }
        />
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            id="tag-suggestions-list"
            className="tag-suggestions"
            role="listbox"
          >
            {suggestions.map((tag, index) => (
              <button
                key={tag}
                id={`tag-suggestion-${index}`}
                role="option"
                aria-selected={index === activeSuggestionIndex}
                className={`tag-suggestion-item ${index === activeSuggestionIndex ? "active" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectSuggestion(tag);
                }}
                type="button"
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && (
        <span id="session-tag-error" className="tag-editor__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
