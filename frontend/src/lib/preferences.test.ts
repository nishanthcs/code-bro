import {
  clampRunnerWidth,
  initialEditorCursor,
  initialEditorFontSize,
  initialEditorTheme,
  initialNotesFontSize,
  initialRunnerWidth,
  initialStdinCollapsed,
  initialStdinHeight,
  persistEditorCursor,
  persistNotesFontSize,
  persistRunnerWidth,
  persistStdinCollapsed,
  persistStdinHeight,
  stepEditorFontSize,
  stepNotesFontSize,
} from "./preferences";

describe("preferences", () => {
  let storage: Storage;

  beforeEach(() => {
    const values = new Map<string, string>();
    storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => Array.from(values.keys())[index] ?? null,
      removeItem: (key) => {
        values.delete(key);
      },
      setItem: (key, value) => {
        values.set(key, value);
      },
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storage,
    });
  });

  afterEach(() => {
    storage.clear();
  });

  it("uses defaults when storage is empty", () => {
    expect(initialEditorFontSize()).toBe(13);
    expect(initialEditorTheme()).toBe("auto");
    expect(initialStdinHeight()).toBe(34);
    expect(initialStdinCollapsed()).toBe(false);
  });

  it("steps editor font size within supported values", () => {
    expect(stepEditorFontSize(13, "up")).toBe(14);
    expect(stepEditorFontSize(13, "down")).toBe(12);
    expect(stepEditorFontSize(12, "down")).toBe(12);
    expect(stepEditorFontSize(18, "up")).toBe(18);
  });

  it("clamps runner width to supported bounds", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1200,
    });
    expect(clampRunnerWidth(200)).toBe(280);
    expect(clampRunnerWidth(900)).toBe(660);
    expect(clampRunnerWidth(420)).toBe(420);
  });

  it("restores panel sizing and stdin visibility", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1400,
    });
    persistRunnerWidth(510);
    persistStdinHeight(48);
    persistStdinCollapsed(true);

    expect(initialRunnerWidth()).toBe(510);
    expect(initialStdinHeight()).toBe(48);
    expect(initialStdinCollapsed()).toBe(true);
  });

  it("stores cursor selections per session and clamps stale positions", () => {
    persistEditorCursor("session-a", { anchor: 8, head: 12 });
    persistEditorCursor("session-b", { anchor: 2, head: 2 });

    expect(initialEditorCursor("session-a", 20)).toEqual({
      anchor: 8,
      head: 12,
    });
    expect(initialEditorCursor("session-b", 20)).toEqual({
      anchor: 2,
      head: 2,
    });
    expect(initialEditorCursor("session-a", 10)).toEqual({
      anchor: 8,
      head: 10,
    });
  });

  it("uses default notes font size when storage is empty", () => {
    expect(initialNotesFontSize()).toBe(14);
  });

  it("persists and restores notes font size", () => {
    persistNotesFontSize(18);
    expect(initialNotesFontSize()).toBe(18);
  });

  it("falls back to default for invalid stored notes font size", () => {
    storage.setItem("codebro-notes-font-size", "999");
    expect(initialNotesFontSize()).toBe(14);
  });

  it("steps notes font size up", () => {
    expect(stepNotesFontSize(14, "up")).toBe(16);
    expect(stepNotesFontSize(22, "up")).toBe(22);
  });

  it("steps notes font size down", () => {
    expect(stepNotesFontSize(14, "down")).toBe(12);
    expect(stepNotesFontSize(12, "down")).toBe(12);
  });
});
