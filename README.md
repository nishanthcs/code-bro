# CodeBro

CodeBro is a local-first Python playground for macOS. It provides a focused
Python editor, in-browser execution, named autosaved sessions, search, and
light/dark themes.

## Editor and runner

- Python syntax highlighting without autocomplete or completion UI.
- Function and block folding from the editor gutter.
- `Cmd+/` on macOS or `Ctrl+/` elsewhere toggles comments for the current line
  or selected lines.
- `Cmd+S` on macOS or `Ctrl+S` elsewhere saves immediately.
- `Cmd+Enter` on macOS or `Ctrl+Enter` elsewhere runs the current code.
- The stdin panel can be closed so the console occupies the full runner column.
- The UI continuously checks the local API and shows a recovery banner if the
  server becomes unavailable.

## Repository layout

- `frontend/` React, TypeScript, CodeMirror, and the Pyodide execution bridge.
- `backend/` FastAPI, SQLite, API tests, and the local controller.
- `scripts/` development and production-build helpers.
- `docs/` architecture and release notes.

## Development

Prerequisites:

- Node.js 24.16.0 (exactly; use `.node-version` or `.nvmrc`)
- Python 3.12+

```bash
python3.12 -m venv .venv
.venv/bin/pip install -c backend/constraints.txt -e './backend[dev]'
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. The development controller starts:

- Vite UI: `127.0.0.1:5173`
- FastAPI persistence API: `127.0.0.1:8765`
- Isolated execution origin: `127.0.0.1:8766`

## Verification

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

## macOS package

Install the packaging extra, then build the application and DMG:

```bash
.venv/bin/pip install -c backend/constraints.txt -e './backend[package]'
scripts/package-macos.sh
```

`CODEBRO_SIGNING_IDENTITY` may be set to a Developer ID Application identity.
Set `CODEBRO_NOTARY_PROFILE` to an `xcrun notarytool` keychain profile to
notarize and staple both the application and DMG. Without release credentials,
the script generates a validated unsigned development bundle at
`release/CodeBro.app`.

## Security boundary

Python executes with Pyodide in a disposable Web Worker on a separate loopback
origin. The persistence API requires a per-launch capability token that is
never sent to the execution origin. This protects CodeBro data and keeps
runaway code off the UI thread, but it is not a certified hostile-code sandbox.
