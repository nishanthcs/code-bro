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
    expect(source).toContain('spellcheck: "false"');
    expect(source).not.toContain("autocompletion(");
    expect(source).not.toContain("closeBrackets(");
    expect(source).not.toMatch(/useEffect\(\(\) => \{[\s\S]*?\}, \[value\]\)/);
    expect(packageJson).not.toContain("@codemirror/autocomplete");
  });
});

