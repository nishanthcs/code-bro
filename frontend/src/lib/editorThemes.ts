import { EditorView } from "@codemirror/view";
import type { EditorThemeId } from "./preferences";

const lightTheme = EditorView.theme(
  {
    "&": { color: "#172033", backgroundColor: "#fbfcff" },
    ".cm-content": { caretColor: "#6c4af2" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#6c4af2" },
    ".cm-gutters": {
      backgroundColor: "#fbfcff",
      color: "#9aa3b3",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "#f2f0ff" },
    ".cm-activeLineGutter": { backgroundColor: "#f2f0ff", color: "#5e687a" },
    ".cm-content ::selection": {
      backgroundColor: "#b9adff",
      color: "#111827",
    },
  },
  { dark: false },
);

const darkTheme = EditorView.theme(
  {
    "&": { color: "#e8ecf4", backgroundColor: "#10131a" },
    ".cm-content": { caretColor: "#b49cff" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#b49cff" },
    ".cm-gutters": {
      backgroundColor: "#10131a",
      color: "#596273",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "#171b25" },
    ".cm-activeLineGutter": { backgroundColor: "#171b25", color: "#aab2c1" },
    ".cm-content ::selection": {
      backgroundColor: "#6653bd",
      color: "#ffffff",
    },
  },
  { dark: true },
);

const midnightTheme = EditorView.theme(
  {
    "&": { color: "#d8dee9", backgroundColor: "#0a0c12" },
    ".cm-content": { caretColor: "#c792ea" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#c792ea" },
    ".cm-gutters": {
      backgroundColor: "#0a0c12",
      color: "#4c566a",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "#12151f" },
    ".cm-activeLineGutter": { backgroundColor: "#12151f", color: "#8b95a8" },
    ".cm-content ::selection": {
      backgroundColor: "#5b469e",
      color: "#ffffff",
    },
  },
  { dark: true },
);

const solarizedTheme = EditorView.theme(
  {
    "&": { color: "#839496", backgroundColor: "#002b36" },
    ".cm-content": { caretColor: "#2aa198" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#2aa198" },
    ".cm-gutters": {
      backgroundColor: "#002b36",
      color: "#586e75",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "#073642" },
    ".cm-activeLineGutter": { backgroundColor: "#073642", color: "#93a1a1" },
    ".cm-content ::selection": {
      backgroundColor: "#155564",
      color: "#fdf6e3",
    },
  },
  { dark: true },
);

const paperTheme = EditorView.theme(
  {
    "&": { color: "#3b3228", backgroundColor: "#f7f1e3" },
    ".cm-content": { caretColor: "#b8613a" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#b8613a" },
    ".cm-gutters": {
      backgroundColor: "#f7f1e3",
      color: "#9a8872",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "#efe6d4" },
    ".cm-activeLineGutter": { backgroundColor: "#efe6d4", color: "#7a6a56" },
    ".cm-content ::selection": {
      backgroundColor: "#d4b984",
      color: "#271f18",
    },
  },
  { dark: false },
);

const editorThemes: Record<Exclude<EditorThemeId, "auto">, typeof lightTheme> =
  {
    light: lightTheme,
    dark: darkTheme,
    midnight: midnightTheme,
    solarized: solarizedTheme,
    paper: paperTheme,
  };

export function resolveEditorTheme(
  editorTheme: EditorThemeId,
  appTheme: "light" | "dark",
): typeof lightTheme {
  if (editorTheme === "auto") {
    return appTheme === "dark" ? darkTheme : lightTheme;
  }
  return editorThemes[editorTheme];
}
