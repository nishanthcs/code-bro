export const EDITOR_FONT_SIZES = [12, 13, 14, 16, 18] as const;

export type EditorFontSize = (typeof EDITOR_FONT_SIZES)[number];

export type EditorThemeId =
  | "auto"
  | "light"
  | "dark"
  | "midnight"
  | "solarized"
  | "paper";

export const EDITOR_THEME_OPTIONS: { id: EditorThemeId; label: string }[] = [
  { id: "auto", label: "Match app" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "midnight", label: "Midnight" },
  { id: "solarized", label: "Solarized" },
  { id: "paper", label: "Paper" },
];

export const DEFAULT_EDITOR_FONT_SIZE: EditorFontSize = 13;
export const DEFAULT_EDITOR_THEME: EditorThemeId = "auto";
export const DEFAULT_RUNNER_WIDTH = 380;
export const DEFAULT_STDIN_HEIGHT_PERCENT = 34;

export const RUNNER_WIDTH_MIN = 280;
export const RUNNER_WIDTH_MAX_RATIO = 0.55;
export const STDIN_HEIGHT_MIN = 20;
export const STDIN_HEIGHT_MAX = 65;

const STORAGE_KEYS = {
  editorFontSize: "codebro-editor-font-size",
  editorTheme: "codebro-editor-theme",
  runnerWidth: "codebro-runner-width",
  stdinHeight: "codebro-stdin-height",
} as const;

export function safeStorage(): Storage | null {
  if (import.meta.env.MODE === "test") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function readNumber(key: string): number | null {
  const raw = safeStorage()?.getItem(key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function initialEditorFontSize(): EditorFontSize {
  const stored = readNumber(STORAGE_KEYS.editorFontSize);
  if (stored !== null && EDITOR_FONT_SIZES.includes(stored as EditorFontSize)) {
    return stored as EditorFontSize;
  }
  return DEFAULT_EDITOR_FONT_SIZE;
}

export function initialEditorTheme(): EditorThemeId {
  const stored = safeStorage()?.getItem(STORAGE_KEYS.editorTheme);
  if (stored && EDITOR_THEME_OPTIONS.some((option) => option.id === stored)) {
    return stored as EditorThemeId;
  }
  return DEFAULT_EDITOR_THEME;
}

export function clampRunnerWidth(width: number): number {
  const max = Math.round(window.innerWidth * RUNNER_WIDTH_MAX_RATIO);
  return Math.min(Math.max(width, RUNNER_WIDTH_MIN), max);
}

export function initialRunnerWidth(): number {
  const stored = readNumber(STORAGE_KEYS.runnerWidth);
  if (stored !== null) {
    return clampRunnerWidth(stored);
  }
  return clampRunnerWidth(
    Math.round(window.innerWidth * 0.31) || DEFAULT_RUNNER_WIDTH,
  );
}

export function initialStdinHeight(): number {
  const stored = readNumber(STORAGE_KEYS.stdinHeight);
  if (
    stored !== null &&
    stored >= STDIN_HEIGHT_MIN &&
    stored <= STDIN_HEIGHT_MAX
  ) {
    return stored;
  }
  return DEFAULT_STDIN_HEIGHT_PERCENT;
}

export function persistEditorFontSize(size: EditorFontSize): void {
  safeStorage()?.setItem(STORAGE_KEYS.editorFontSize, String(size));
}

export function persistEditorTheme(theme: EditorThemeId): void {
  safeStorage()?.setItem(STORAGE_KEYS.editorTheme, theme);
}

export function persistRunnerWidth(width: number): void {
  safeStorage()?.setItem(STORAGE_KEYS.runnerWidth, String(Math.round(width)));
}

export function persistStdinHeight(percent: number): void {
  safeStorage()?.setItem(STORAGE_KEYS.stdinHeight, String(Math.round(percent)));
}

export function stepEditorFontSize(
  current: EditorFontSize,
  direction: "up" | "down",
): EditorFontSize {
  const index = EDITOR_FONT_SIZES.indexOf(current);
  if (direction === "up") {
    return EDITOR_FONT_SIZES[Math.min(index + 1, EDITOR_FONT_SIZES.length - 1)];
  }
  return EDITOR_FONT_SIZES[Math.max(index - 1, 0)];
}
