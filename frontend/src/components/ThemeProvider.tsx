import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  initialEditorFontSize,
  initialEditorTheme,
  persistEditorFontSize,
  persistEditorTheme,
  type EditorFontSize,
  type EditorThemeId,
} from "../lib/preferences";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  editorFontSize: EditorFontSize;
  setEditorFontSize: (size: EditorFontSize) => void;
  editorTheme: EditorThemeId;
  setEditorTheme: (theme: EditorThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function initialTheme(): Theme {
  const stored = safeStorage()?.getItem("codebro-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function safeStorage(): Storage | null {
  if (import.meta.env.MODE === "test") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [editorFontSize, setEditorFontSizeState] =
    useState<EditorFontSize>(initialEditorFontSize);
  const [editorTheme, setEditorThemeState] =
    useState<EditorThemeId>(initialEditorTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    safeStorage()?.setItem("codebro-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--editor-font-size",
      `${editorFontSize}px`,
    );
    persistEditorFontSize(editorFontSize);
  }, [editorFontSize]);

  useEffect(() => {
    persistEditorTheme(editorTheme);
  }, [editorTheme]);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () =>
        setTheme((current) => (current === "dark" ? "light" : "dark")),
      editorFontSize,
      setEditorFontSize: (size: EditorFontSize) => setEditorFontSizeState(size),
      editorTheme,
      setEditorTheme: (nextTheme: EditorThemeId) =>
        setEditorThemeState(nextTheme),
    }),
    [editorFontSize, editorTheme, theme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// The hook intentionally shares the component context from this module.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
