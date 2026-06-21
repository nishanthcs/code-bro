import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("CodeEditor configuration", () => {
  it("enables Python highlighting without completion packages", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/CodeEditor.tsx"),
      "utf8",
    );
    const packageJson = readFileSync(resolve(process.cwd(), "package.json"), "utf8");

    expect(source).toContain("python()");
    expect(source).toContain("foldGutter(");
    expect(source).toContain("...foldKeymap");
    expect(source).toContain('key: "Mod-/"');
    expect(source).toContain("run: toggleComment");
    expect(source).toContain('key: "Enter"');
    expect(source).toContain("run: insertNewlineAndIndent");
    expect(source).toContain('key: "Escape"');
    expect(source).toContain("run: temporarilySetTabFocusMode");
    expect(source).toContain("run: toggleTabFocusMode");
    expect(source).toContain("initialEditorCursor(sessionId, value.length)");
    expect(source).toContain("persistEditorCursor(sessionId");
    expect(source).toContain('spellcheck: "false"');
    expect(source).not.toContain("drawSelection()");
    expect(source).not.toContain("autocompletion(");
    expect(source).not.toContain("closeBrackets(");
    expect(source).not.toMatch(/useEffect\(\(\) => \{[\s\S]*?\}, \[value\]\)/);
    expect(packageJson).not.toContain("@codemirror/autocomplete");
  });

  it("uses theme-controlled native selection colors", () => {
    const themes = readFileSync(
      resolve(process.cwd(), "src/lib/editorThemes.ts"),
      "utf8",
    );

    expect(themes.match(/\.cm-content ::selection/g)).toHaveLength(5);
    expect(themes).toContain('backgroundColor: "#6653bd"');
    expect(themes).toContain('color: "#ffffff"');
  });
});
