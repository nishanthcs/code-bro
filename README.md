# CodeBro — Local Python Playground for Coding Interview Practice

> Let the code brew, bruh.

[![Cross-platform](https://img.shields.io/badge/source-cross--platform-2563eb)](#getting-started)
[![Python](https://img.shields.io/badge/Python-3.12%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Local First](https://img.shields.io/badge/local--first-private-6f42c1)](#privacy-and-security)

CodeBro is a free, open-source, local-first Python playground for practicing
data structures and algorithms, working through LeetCode-style coding problems,
and preparing for Python technical interviews without autocomplete, AI
suggestions, or browser tabs full of distractions.

Write Python, provide custom stdin, run it locally with bundled Pyodide, inspect
stdout and stderr, and save each solution as a searchable session with tags,
reference links, and Markdown notes. Your code and interview-preparation notes
stay in a local SQLite database.

## Why use CodeBro for coding interview preparation?

Coding interviews often require writing correct code without relying on an
IDE's autocomplete, Copilot-style assistance, automatic imports, or hidden
package installation. CodeBro provides a deliberately focused environment for
that workflow.

- Practice arrays, strings, hash maps, linked lists, stacks, queues, trees,
  graphs, heaps, recursion, backtracking, dynamic programming, and other DSA
  topics in Python.
- Paste or write a problem prompt in Markdown Notes and keep a link to the
  original challenge.
- Test solutions with your own stdin and inspect ordered stdout and stderr.
- Organize attempts by tags such as `Graph`, `Binary Search`, or `DP`.
- Revisit previous solutions through name-or-tag search.
- Work offline after installation with no runtime CDN or package downloads.
- Practice without autocomplete, code completion, snippets, lint popovers,
  automatic imports, or AI-generated code.

CodeBro does not bundle or scrape problems from LeetCode or other interview
platforms. Bring your own problem statement and test cases. CodeBro is not
affiliated with or endorsed by LeetCode.

## At a glance

| Capability | CodeBro |
| --- | --- |
| Primary use | Python coding interview and algorithm practice |
| Platform | Cross-platform when run from source |
| Execution | Local Pyodide in a fresh disposable Web Worker |
| Persistence | Local SQLite with autosave and revision protection |
| Problem input | Custom multiline stdin |
| Organization | Session names, tags, search, reference URLs, and Markdown Notes |
| Assistance | No autocomplete, AI suggestions, snippets, or automatic imports |
| Network requirement | None at runtime |

## Features

### Python editor and code runner

- Python syntax highlighting without autocomplete or completion UI.
- Python-aware indentation, code folding, search, and comment toggling.
- Custom stdin for testing interview examples and edge cases.
- Ordered stdout and stderr output rendered as plain text.
- A fresh Worker for every run, plus Stop, a 10-second timeout, and output
  limits that prevent runaway programs from freezing the interface.
- Resizable editor, stdin, output, and Session Notes panels.
- Keyboard-first workflow with `Cmd/Ctrl+Enter` to run and `Cmd/Ctrl+S` to
  save.

### Saved coding-practice sessions

- Compact list view with session name, tags, code preview, optional shortened
  Reference link, updated date, and created date.
- Server-backed name-or-tag search, recency/name ordering, and updated-date
  filters.
- Autosaved Python source, Reference URL, and Markdown Notes in SQLite.
- Optimistic revisions and idempotent retries protect against accidental
  overwrites after a lost response.
- Deterministic local tag suggestions based on the code, capped at two tags.
- Soft deletion so sessions are not immediately destroyed.
- Read-only Settings panel showing the active SQLite database path.
- Press `/` to focus search and `N` to create a session when focus is not in a
  form control.

### Focused, distraction-free practice

- No autocomplete, completion popovers, snippets, lint suggestions, ghost
  text, parameter hints, automatic imports, or AI code assistance.
- Browser spellcheck, autocorrect, autocapitalization, and grammar assistance
  are disabled on the code editor.
- No format-on-save or automatic mutation of your solution.
- Light and dark themes with adjustable editor font size.
- New sessions focus and select the session name. Press `F2` to return to the
  name field or `Ctrl+Shift+T` to expand metadata and focus the tag editor.
- `Ctrl+Shift+M` toggles the metadata drawer. Its disclosure preference is
  UI-only and restored locally.
- Sessions may store one absolute HTTP(S) Reference URL and up to 128 KiB of
  raw UTF-8 Markdown Notes. Notes preview supports common Markdown and GFM,
  does not render raw HTML, and never loads remote images.
- Press `Escape`, then `Tab`, to move keyboard focus out of the code editor.
- The stdin panel can be closed so the console occupies the full runner column.
- Editor/runner sizing, stdin and Notes sizing and visibility, and each
  session's cursor selection are restored from browser-local preferences.
- The UI detects failed API requests, shows a recovery banner, and periodically
  retries only while the local server is unavailable.

## Getting started

CodeBro's development environment runs cross-platform from source. There is not
yet a published binary release.

Prerequisites:

- Node.js 24.16.0
- Python 3.12 or newer
- [uv](https://docs.astral.sh/uv/)

### Unix-like shells

```bash
git clone https://github.com/nishanthcs/code-bro.git
cd code-bro
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python \
  -c backend/constraints.txt \
  -e './backend[dev,package]'
npm ci
npm run dev
```

### Windows PowerShell

```powershell
git clone https://github.com/nishanthcs/code-bro.git
cd code-bro
uv venv .venv --python 3.12
uv pip install --python .venv/Scripts/python.exe `
  -c backend/constraints.txt `
  -e "./backend[dev,package]"
npm ci
npm run dev
```

CodeBro opens in your browser and stores sessions in a local SQLite database.
The packaged `.app` and DMG currently target macOS 14+ on Apple silicon, while
the source-based development environment is cross-platform.

## Example interview-practice workflow

1. Create a session named after the problem, such as `Two Sum`.
2. Add topic tags such as `Array` and `Hash Map`.
3. Save the problem URL in Reference URL.
4. Put constraints, complexity notes, and follow-up ideas in Session Notes.
5. Write the solution without autocomplete or AI assistance.
6. Add sample and edge-case values to stdin.
7. Run with `Cmd/Ctrl+Enter`, inspect the output, and iterate.
8. Search by problem name or topic later for spaced repetition.

## Repository layout

- `frontend/` React, TypeScript, CodeMirror, and the Pyodide execution bridge.
- `backend/` FastAPI, SQLite, API tests, and the local controller.
- `scripts/` development and production-build helpers.
- `docs/` architecture and release notes.

## Development

### Install dependencies

Prerequisites:

- Node.js 24.16.0 (exactly; use `.node-version` or `.nvmrc`)
- Python 3.12+
- [uv](https://docs.astral.sh/uv/)

```bash
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python \
  -c backend/constraints.txt \
  -e './backend[dev,package]'
npm ci
```

This installs the backend runtime, test, development, and macOS packaging
dependencies into `.venv`.

### Run locally

#### Development servers

Start the full development environment from the repository root:

```bash
npm run dev
```

Open `http://127.0.0.1:5173`. The development controller starts:

- Vite UI: `127.0.0.1:5173`
- FastAPI persistence API: `127.0.0.1:8765`
- Isolated execution origin: `127.0.0.1:8766`

#### Production build and servers

To create a production build and launch the application and execution servers
with one command:

```bash
npm start
```

The controller selects two available loopback ports, generates a per-launch API
token, opens CodeBro in the default browser, and stores sessions under
`~/Library/Application Support/CodeBro`.

#### Backend only

To run only the FastAPI persistence backend:

```bash
CODEBRO_DATA_DIR="$PWD/.local-data" \
  .venv/bin/python -m uvicorn app.main:app \
  --app-dir backend \
  --host 127.0.0.1 \
  --port 8765
```

The standalone backend uses the development API token `dev-token`. Its strict
Host validation expects requests to arrive through the Vite development proxy
at `http://127.0.0.1:5173`.

### Verification

```bash
npm test
npm run lint
npm run typecheck
npm run build
.venv/bin/pytest backend/tests
npm run smoke:python
```

The browser smoke harness uses an existing local Chrome installation:

```bash
npm run dev
npm run smoke:ui
```

## Packaged macOS distribution

CodeBro supports macOS 14 or newer on Apple silicon. The packaged application
includes its Python runtime and other dependencies; the destination Mac does
not need Python, Node.js, uv, or npm.

### Build the app and DMG

If you installed the `package` extra during development setup, build the
application and DMG with:

```bash
scripts/package-macos.sh
```

`CODEBRO_SIGNING_IDENTITY` may be set to a Developer ID Application identity.
Set `CODEBRO_NOTARY_PROFILE` to an `xcrun notarytool` keychain profile to
notarize and staple both the application and DMG. Without release credentials,
the script generates a validated unsigned development bundle at
`release/CodeBro.app`.

### Install from the DMG

1. Copy `release/CodeBro.dmg` to the destination Mac.
2. Double-click `CodeBro.dmg` to mount it.
3. Drag `CodeBro.app` into the Applications folder.
4. Eject the CodeBro disk image.
5. Open CodeBro from Applications.

If you received `CodeBro.app` directly instead of the DMG, copy it into the
Applications folder and open it from there.

### Open an unsigned development build

A build created without signing and notarization credentials may be blocked by
Gatekeeper. Only bypass this protection for a build from a source you trust:

1. Control-click `CodeBro.app` in Applications and select **Open**.
2. Select **Open** in the confirmation dialog.
3. If macOS still blocks the app, open **System Settings → Privacy & Security**
   and select **Open Anyway** for CodeBro.

A signed and notarized build opens normally without these additional steps.

## Privacy and security

Python executes with Pyodide in a disposable Web Worker on a separate loopback
origin. The persistence API requires a per-launch capability token that is
never sent to the execution origin. This protects CodeBro data and keeps
runaway code off the UI thread, but it is not a certified hostile-code sandbox.

CodeBro does not include analytics, telemetry, remote fonts, third-party
scripts, runtime CDN dependencies, or cloud synchronization. Session names,
Python source, stdin, output, tags, links, and Notes are not logged or sent to a
remote service.

## Contributing

Issues and pull requests are welcome. Before submitting a broad change, run:

```bash
.venv/bin/pytest backend/tests
npm test
npm run lint
npm run typecheck
npm run build
npm run smoke:python
```

For UI or integration changes, also run `npm run dev` followed by
`npm run smoke:ui`.

## License

CodeBro is available under the [MIT License](LICENSE).
