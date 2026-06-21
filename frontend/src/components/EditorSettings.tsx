import { Minus, Plus } from "lucide-react";
import {
  EDITOR_THEME_OPTIONS,
  stepEditorFontSize,
  type EditorThemeId,
} from "../lib/preferences";
import { useTheme } from "./ThemeProvider";

export function EditorSettings() {
  const {
    editorFontSize,
    setEditorFontSize,
    editorTheme,
    setEditorTheme,
  } = useTheme();

  const decreaseFontSize = () => {
    setEditorFontSize(stepEditorFontSize(editorFontSize, "down"));
  };

  const increaseFontSize = () => {
    setEditorFontSize(stepEditorFontSize(editorFontSize, "up"));
  };

  const canDecrease = editorFontSize > 12;
  const canIncrease = editorFontSize < 18;

  return (
    <div className="editor-settings">
      <div className="editor-settings__group" aria-label="Editor font size">
        <button
          className="editor-settings__button"
          type="button"
          aria-label="Decrease editor font size"
          disabled={!canDecrease}
          onClick={decreaseFontSize}
        >
          <Minus size={13} />
        </button>
        <span className="editor-settings__value">{editorFontSize}px</span>
        <button
          className="editor-settings__button"
          type="button"
          aria-label="Increase editor font size"
          disabled={!canIncrease}
          onClick={increaseFontSize}
        >
          <Plus size={13} />
        </button>
      </div>
      <label className="editor-settings__theme">
        <span className="sr-only">Editor color theme</span>
        <select
          value={editorTheme}
          onChange={(event) =>
            setEditorTheme(event.target.value as EditorThemeId)
          }
          aria-label="Editor color theme"
        >
          {EDITOR_THEME_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
