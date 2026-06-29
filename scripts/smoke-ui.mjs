import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = resolve(root, "artifacts");
const baseUrl = process.env.CODEBRO_BASE_URL ?? "http://127.0.0.1:5173";
await mkdir(artifacts, { recursive: true });

function localDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Sessions", exact: true }).waitFor();
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
  const metadataToggle = page.getByRole("button", { name: /Metadata/ });
  await metadataToggle.waitFor();
  await page.keyboard.press("Control+Shift+M");
  if ((await metadataToggle.getAttribute("aria-expanded")) !== "true") {
    throw new Error("The metadata shortcut did not expand the drawer.");
  }
  const tagInput = page.getByRole("combobox", { name: "Add session tag" });
  await tagInput.fill("browser");
  await page.keyboard.press("Enter");
  await page.getByText("browser", { exact: true }).waitFor();
  const referenceUrl = "https://example.com/docs/reference";
  await page.getByRole("textbox", { name: "Reference URL" }).fill(referenceUrl);
  await page.keyboard.press("Tab");
  await page.getByRole("link", {
    name: `Open reference: ${referenceUrl}`,
  }).waitFor();
  await page.getByRole("button", {
    name: "Expand session notes panel",
  }).click();
  const notes = page.getByRole("textbox", { name: "Session notes" });
  await notes.fill(
    "# Smoke notes\n\n[Docs](https://example.com/docs)\n\n![tracker](https://tracker.example/pixel.png)",
  );
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByRole("heading", { name: "Smoke notes" }).waitFor();
  if ((await page.getByLabel("Notes preview").locator("img").count()) !== 0) {
    throw new Error("Markdown Notes rendered a remote image.");
  }
  const notesLink = page.getByLabel("Notes preview").getByRole("link", {
    name: "Docs",
  });
  if (
    (await notesLink.getAttribute("target")) !== "_blank" ||
    (await notesLink.getAttribute("rel")) !== "noopener noreferrer"
  ) {
    throw new Error("Markdown Notes did not harden external links.");
  }

  await page.getByRole("button", { name: "Open notes full screen" }).click();
  const fullscreenDialog = page.getByRole("dialog", {
    name: "Session Notes",
  });
  await fullscreenDialog.waitFor();
  await fullscreenDialog.getByRole("heading", { name: "Smoke notes" }).waitFor();
  if ((await fullscreenDialog.locator("img").count()) !== 0) {
    throw new Error("Full-screen notes rendered a remote image.");
  }
  const fullscreenLink = fullscreenDialog.getByRole("link", { name: "Docs" });
  if (
    (await fullscreenLink.getAttribute("target")) !== "_blank" ||
    (await fullscreenLink.getAttribute("rel")) !== "noopener noreferrer"
  ) {
    throw new Error("Full-screen notes did not harden external links.");
  }

  const fontSizeDisplay = page.locator(".notes-fullscreen-font-size");
  const initialFontText = await fontSizeDisplay.textContent();
  if (initialFontText === null) {
    throw new Error("Could not read font size display.");
  }
  await fullscreenDialog.getByRole("button", { name: "Increase notes font size" }).click();
  await page.waitForTimeout(50);
  const increasedFontText = await fontSizeDisplay.textContent();
  if (increasedFontText === initialFontText) {
    throw new Error("Font size did not increase after clicking Increase.");
  }

  await fullscreenDialog.getByRole("button", { name: "Close full screen notes" }).click();
  await page.getByRole("button", { name: "Open notes full screen" }).waitFor();
  if (
    !(await page
      .getByRole("button", { name: "Open notes full screen" })
      .evaluate((el) => el === document.activeElement))
  ) {
    throw new Error("Focus did not return to Open notes full screen button.");
  }

  const notesSeparator = page.getByRole("separator", {
    name: "Resize output and session notes panels",
  });
  await notesSeparator.focus();
  await page.keyboard.press("ArrowDown");
  const persistedNotesHeight = await notesSeparator.getAttribute(
    "aria-valuenow",
  );
  await page.getByRole("button", {
    name: "Collapse session notes panel",
  }).click();
  const restoreNotes = page.getByRole("button", {
    name: "Expand session notes panel",
  });
  await restoreNotes.waitFor();
  if (!(await restoreNotes.evaluate((element) => element === document.activeElement))) {
    throw new Error("Collapsing Session Notes did not preserve keyboard focus.");
  }
  await page.getByLabel("Program output").waitFor();
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

  await page.keyboard.press("Control+Shift+M");
  if ((await metadataToggle.getAttribute("aria-expanded")) !== "false") {
    throw new Error("The metadata shortcut did not collapse the drawer.");
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("Python code editor").waitFor();
  const restoredMetadataToggle = page.getByRole("button", { name: /Metadata/ });
  if ((await restoredMetadataToggle.getAttribute("aria-expanded")) !== "false") {
    throw new Error("The metadata disclosure preference was not restored.");
  }
  await page.keyboard.press("Control+Shift+M");
  if (
    (await page.getByRole("textbox", { name: "Reference URL" }).inputValue()) !==
    referenceUrl
  ) {
    throw new Error("The session Reference URL was not restored.");
  }
  if (
    (await page.getByRole("button", {
      name: "Collapse session notes panel",
    }).getAttribute("aria-expanded")) !== "true"
  ) {
    throw new Error("The Session Notes panel was not expanded for an existing-notes session.");
  }
  await page.getByRole("heading", { name: "Smoke notes" }).waitFor();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  if (
    !(await page
      .getByRole("textbox", { name: "Session notes" })
      .inputValue()).includes("# Smoke notes")
  ) {
    throw new Error("The session Markdown Notes were not restored.");
  }
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  if (
    (await page
      .getByRole("separator", {
        name: "Resize output and session notes panels",
      })
      .getAttribute("aria-valuenow")) !== persistedNotesHeight
  ) {
    throw new Error("The Output/Notes panel height was not restored.");
  }
  await page.getByRole("link", {
    name: "Open reference",
    exact: true,
  }).waitFor();
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
  const dashboardReference = page.getByRole("link", {
    name: `Reference: ${referenceUrl}`,
  }).first();
  await dashboardReference.waitFor();
  if (!(await dashboardReference.textContent()).includes("example.com/docs")) {
    throw new Error("The dashboard did not shorten the Reference URL.");
  }
  const today = localDateInputValue(new Date());
  await page.getByLabel("Updated from date").fill(today);
  await page.getByLabel("Updated to date").fill(today);
  await page.getByText("Keyboard Smoke").first().waitFor();
  await page.getByRole("button", { name: "Clear dates" }).click();
  await page.getByRole("combobox", { name: "Filter by updated date" }).waitFor();

  await page.getByRole("button", { name: "New session" }).click();
  await page.getByRole("textbox", { name: "Session name" }).fill("Existing Tag Smoke");
  const existingTagEditor = page.getByLabel("Python code editor");
  await existingTagEditor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText("browser = True\nprint(browser)");
  await page.keyboard.press("Meta+S");
  await page.getByText("browser", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Sessions" }).click();

  await page.getByRole("button", { name: "New session" }).click();
  await page.getByRole("textbox", { name: "Session name" }).fill("Generated Tag Smoke");
  const generatedTagEditor = page.getByLabel("Python code editor");
  await generatedTagEditor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText(
    "from dataclasses import dataclass\n\n@dataclass\nclass Point:\n    x: int\n\nprint(Point(1))",
  );
  await page.keyboard.press("Meta+S");
  await page.getByText("Data Classes", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Sessions" }).click();

  await page.keyboard.press("/");
  const sessionSearch = page.getByRole("textbox", {
    name: "Search sessions by name or tag",
  });
  await sessionSearch.fill("browser");
  await page.getByText("Keyboard Smoke").first().waitFor();

  await page.route("**/api/v1/sessions?*", (route) => route.abort());
  await sessionSearch.fill("offline-check");
  await page.getByText("CodeBro server is unavailable").waitFor();
  await page.unroute("**/api/v1/sessions?*");
  await page.getByRole("button", { name: "Retry" }).click();
  await page.getByText("CodeBro server is unavailable").waitFor({
    state: "detached",
  });

  console.log(
    "CodeBro browser smoke passed: metadata, auto-tags, edit, run, save, theme, return.",
  );
} finally {
  await browser.close();
}
