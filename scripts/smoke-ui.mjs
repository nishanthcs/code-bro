import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = resolve(root, "artifacts");
const baseUrl = process.env.CODEBRO_BASE_URL ?? "http://127.0.0.1:5173";
await mkdir(artifacts, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Pick up where you left off." }).waitFor();
  await page.screenshot({
    path: resolve(artifacts, "codebro-library-light.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "New session" }).click();
  await page.getByLabel("Python code editor").waitFor();

  const editor = page.getByLabel("Python code editor");
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.type(
    'def greet(name):\n    return f"Hello, {name}!"\n\nname = input("Name: ")\nprint(greet(name))',
  );

  await page.keyboard.press("Meta+A");
  await page.keyboard.press("Meta+/");
  await page.locator(".cm-content").getByText(/# def greet/).waitFor();
  await page.keyboard.press("Meta+/");

  const foldMarker = page.locator(".cm-foldGutter .cm-gutterElement").filter({
    hasText: "⌄",
  }).first();
  await foldMarker.waitFor();
  await foldMarker.click();
  await page.locator(".cm-foldPlaceholder").waitFor();
  await page.locator(".cm-foldPlaceholder").click();

  await page.keyboard.press("Meta+S");
  await page.getByText("Saved", { exact: true }).waitFor();

  await page.getByRole("button", { name: "Close program input panel" }).click();
  await page.getByRole("button", { name: "Show input" }).waitFor();
  await page.getByRole("button", { name: "Show input" }).click();
  await page.getByRole("textbox", { name: "Program input" }).fill("Ada");

  await page.getByRole("button", { name: /Run/ }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: /Run/ }).click();
  await page.getByLabel("Program output").getByText("Hello, Ada!").waitFor({
    timeout: 30_000,
  });
  await page.getByText(/Completed in/).waitFor();

  if ((await page.locator(".cm-tooltip-autocomplete").count()) !== 0) {
    throw new Error("Autocomplete UI appeared in the Python editor.");
  }

  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.locator("html[data-theme='dark']").waitFor();
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.screenshot({
    path: resolve(artifacts, "codebro-playground-dark.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Sessions" }).click();
  await page.getByText("Untitled Session").first().waitFor();

  await page.route("**/api/v1/health", (route) => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByText("CodeBro server is unavailable").waitFor();
  await page.unroute("**/api/v1/health");
  await page.getByRole("button", { name: "Retry" }).click();
  await page.getByText("CodeBro server is unavailable").waitFor({
    state: "detached",
  });

  console.log("CodeBro browser smoke passed: create, edit, run, save, theme, return.");
} finally {
  await browser.close();
}
