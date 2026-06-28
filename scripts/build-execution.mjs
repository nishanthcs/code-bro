import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const source = resolve(root, "frontend", "execution");
const target = resolve(root, "frontend", "dist-execution");
const pyodideSource = resolve(root, "node_modules", "pyodide");
const pyodideTarget = resolve(target, "pyodide");
const assets = [
  "pyodide.mjs",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
];
const executionFiles = ["bridge.html", "bridge.js", "worker.js", "debugger.py"];

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const file of executionFiles) {
  await cp(resolve(source, file), resolve(target, file), { force: true });
}
await mkdir(pyodideTarget, { recursive: true });
for (const asset of assets) {
  await cp(resolve(pyodideSource, asset), resolve(pyodideTarget, asset), {
    force: true,
  });
}

console.log(`Built execution origin assets in ${target}`);
