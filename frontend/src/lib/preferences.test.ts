import {
  clampRunnerWidth,
  initialEditorFontSize,
  initialEditorTheme,
  initialStdinHeight,
  stepEditorFontSize,
} from "./preferences";

describe("preferences", () => {
  it("uses defaults when storage is unavailable in tests", () => {
    expect(initialEditorFontSize()).toBe(13);
    expect(initialEditorTheme()).toBe("auto");
    expect(initialStdinHeight()).toBe(34);
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
});
