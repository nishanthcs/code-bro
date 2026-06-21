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
  await page.getByRole("heading", { name: "Sessions" }).waitFor();
  await page.getByRole("combobox", { name: "Order sessions" }).waitFor();
  await page.getByRole("combobox", { name: "Filter by updated date" }).waitFor();
  await page.getByRole("button", { name: "Settings" }).click();
  const dataPath = page.getByRole("textbox", { name: "Data storage path" });
  await dataPath.waitFor();
  if ((await dataPath.getAttribute("readonly")) === null) {
    throw new Error("The dashboard data path is not read-only.");
  }
  if (!(await dataPath.inputValue()).endsWith("codebro.sqlite3")) {
    throw new Error("The dashboard did not show the SQLite data path.");
  }
  await page.getByRole("button", { name: "Close" }).click();
  await page.screenshot({
    path: resolve(artifacts, "codebro-library-light.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "New session" }).click();
  const sessionName = page.getByRole("textbox", { name: "Session name" });
  await sessionName.waitFor();
  if (!(await sessionName.evaluate((element) => element === document.activeElement))) {
    throw new Error("A new session did not focus its name field.");
  }
  await page.keyboard.type("Keyboard Smoke");
  const tagInput = page.getByRole("textbox", { name: "Add session tag" });
  await tagInput.fill("browser");
  await page.keyboard.press("Enter");
  await page.getByText("browser", { exact: true }).waitFor();
  await page.getByLabel("Python code editor").waitFor();

  const editor = page.getByLabel("Python code editor");
  await editor.click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  if (
    await editor.evaluate((element) => element.contains(document.activeElement))
  ) {
    throw new Error("Escape then Tab did not leave the code editor.");
  }
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.type("def indentation_check():");
  await page.keyboard.press("Enter");
  await page.keyboard.type("return True");
  const indentedSource = await page.locator(".cm-content").innerText();
  if (!indentedSource.includes("\n    return True")) {
    throw new Error("Python-aware Enter indentation was not preserved.");
  }

  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText(
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

  const runnerSeparator = page.getByRole("separator", {
    name: "Resize editor and runner panels",
  });
  await runnerSeparator.focus();
  await page.keyboard.press("ArrowLeft");
  const persistedRunnerWidth = await runnerSeparator.getAttribute(
    "aria-valuenow",
  );

  const stdinSeparator = page.getByRole("separator", {
    name: "Resize program input and output panels",
  });
  await stdinSeparator.focus();
  await page.keyboard.press("ArrowDown");
  const persistedStdinHeight = await stdinSeparator.getAttribute(
    "aria-valuenow",
  );

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

  await editor.focus();
  await page.keyboard.press("Meta+A");
  await page.keyboard.press("ArrowLeft");
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await page.getByRole("button", { name: "Close program input panel" }).click();

  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("Python code editor").waitFor();
  await page.getByRole("button", { name: "Show input" }).waitFor();
  if (
    (await page
      .getByRole("separator", { name: "Resize editor and runner panels" })
      .getAttribute("aria-valuenow")) !== persistedRunnerWidth
  ) {
    throw new Error("The editor/runner panel width was not restored.");
  }
  await page.getByLabel("Python code editor").focus();
  await page.keyboard.type("X");
  const cursorRestoredSource = await page.locator(".cm-content").innerText();
  if (!cursorRestoredSource.startsWith("def Xgreet")) {
    throw new Error("The per-session editor cursor was not restored.");
  }
  await page.getByRole("button", { name: "Show input" }).click();
  if (
    (await page
      .getByRole("separator", {
        name: "Resize program input and output panels",
      })
      .getAttribute("aria-valuenow")) !== persistedStdinHeight
  ) {
    throw new Error("The stdin/console panel height was not restored.");
  }

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
  await page.keyboard.press("/");
  const sessionSearch = page.getByRole("textbox", {
    name: "Search sessions by name or tag",
  });
  await sessionSearch.fill("browser");
  await page.getByText("Keyboard Smoke").first().waitFor();

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
