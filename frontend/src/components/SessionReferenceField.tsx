import { ExternalLink, Link as LinkIcon, X } from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";
import {
  shortenReferenceUrl,
  validateReferenceUrl,
} from "../lib/referenceUrl";

export function SessionReferenceField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [inputValue, setInputValue] = useState(value ?? "");
  const [error, setError] = useState("");
  const inputId = useId();
  const errorId = `${inputId}-error`;

  const displayUrl = useMemo(
    () => (value ? shortenReferenceUrl(value, 42) : null),
    [value],
  );

  const handleCommit = useCallback(() => {
    try {
      const validated = validateReferenceUrl(inputValue);
      setError("");
      onChange(validated);
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Enter a valid URL",
      );
    }
  }, [inputValue, onChange]);

  const handleClear = useCallback(() => {
    setInputValue("");
    setError("");
    onChange(null);
  }, [onChange]);

  return (
    <div className="ref-url-field">
      <label className="ref-url-field__label" htmlFor={inputId}>
        Reference URL
      </label>
      <div className="ref-url-field__row">
        <LinkIcon size={14} className="ref-url-field__icon" />
        <input
          id={inputId}
          className="ref-url-field__input"
          type="url"
          value={inputValue}
          onChange={(event) => {
            setInputValue(event.target.value);
            setError("");
          }}
          onBlur={handleCommit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleCommit();
            }
          }}
          placeholder="https://example.com"
          aria-label="Reference URL"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          maxLength={2_048}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        {value && (
          <a
            className="ref-url-field__open"
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            title={value}
            aria-label={`Open reference: ${value}`}
          >
            <ExternalLink size={14} />
            {displayUrl}
          </a>
        )}
        {inputValue && (
          <button
            type="button"
            className="ref-url-field__clear"
            onClick={handleClear}
            aria-label="Clear reference URL"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {error && (
        <span id={errorId} className="ref-url-field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
