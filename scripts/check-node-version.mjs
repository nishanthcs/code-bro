import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expected = (await readFile(resolve(root, ".node-version"), "utf8")).trim();
const actual = process.versions.node;

if (actual !== expected) {
  console.error(
    `CodeBro requires Node.js ${expected}; the active runtime is ${actual}.`,
  );
  process.exit(1);
}
