import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const venvPython = resolve(root, ".venv", "bin", "python");
const python = existsSync(venvPython) ? venvPython : "python3";
const environment = {
  ...process.env,
  CODEBRO_API_TOKEN: "dev-token",
  CODEBRO_APP_ORIGIN: "http://127.0.0.1:5173",
  CODEBRO_EXECUTION_ORIGIN: "http://127.0.0.1:8766",
  CODEBRO_DATA_DIR: resolve(root, ".local-data"),
};

const commands = [
  {
    name: "api",
    command: python,
    args: [
      "-m",
      "uvicorn",
      "app.main:app",
      "--host",
      "127.0.0.1",
      "--port",
      "8765",
    ],
    cwd: resolve(root, "backend"),
  },
  {
    name: "execution",
    command: python,
    args: [
      "-m",
      "uvicorn",
      "app.execution_server:app",
      "--host",
      "127.0.0.1",
      "--port",
      "8766",
    ],
    cwd: resolve(root, "backend"),
  },
  {
    name: "ui",
    command: "npm",
    args: ["run", "dev", "--workspace", "frontend"],
    cwd: root,
  },
];

const children = commands.map(({ name, command, args, cwd }) => {
  const child = spawn(command, args, {
    cwd,
    env: environment,
    stdio: ["inherit", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  return child;
});

function stop() {
  for (const child of children) child.kill("SIGTERM");
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

const exitCode = await new Promise((resolveExit) => {
  for (const child of children) {
    child.on("exit", (code) => resolveExit(code ?? 0));
  }
});
stop();
process.exit(exitCode);
