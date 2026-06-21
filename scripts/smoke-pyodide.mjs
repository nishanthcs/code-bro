import { loadPyodide } from "pyodide";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const output = [];
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pyodide = await loadPyodide({
  indexURL: `${resolve(root, "node_modules", "pyodide")}/`,
});
pyodide.setStdout({
  batched: (text) => output.push(text),
});
pyodide.globals.set("__codebro_source", "print(sum([6, 7, 8, 9, 12]))");
await pyodide.runPythonAsync(`
scope = {"__name__": "__main__"}
exec(compile(__codebro_source, "main.py", "exec"), scope, scope)
`);

if (output.join("\n").trim() !== "42") {
  throw new Error(`Unexpected Pyodide output: ${output.join("\\n")}`);
}

console.log(`Pyodide ${pyodide.version} executed main.py successfully: 42`);
