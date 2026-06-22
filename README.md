# CodeBro

CodeBro is a local-first Python playground for macOS. It provides a focused
Python editor, in-browser execution, named and tagged autosaved sessions,
search, local automatic tagging, reference URLs, Markdown Notes, and
light/dark themes.

## Session dashboard

- Compact list view with session name, tags, code preview, optional shortened
  Reference link, updated date, and created date.
- Server-backed name-or-tag search, recency/name ordering, and updated-date
  filters.
- Read-only Settings panel showing the active SQLite database path.
- Rename and soft-delete actions remain available per row.
- Press `/` to focus search and `N` to create a session when focus is not in a
  form control.

## Editor and runner

- Python syntax highlighting without autocomplete or completion UI.
- Python-aware indentation is preserved when Enter creates a new line.
- Function and block folding from the editor gutter.
- `Cmd+/` on macOS or `Ctrl+/` elsewhere toggles comments for the current line
  or selected lines.
- `Cmd+S` on macOS or `Ctrl+S` elsewhere saves immediately.
- `Cmd+Enter` on macOS or `Ctrl+Enter` elsewhere runs the current code.
- New sessions focus and select the session name. Press `F2` to return to the
  name field or `Ctrl+Shift+T` to expand metadata and focus the tag editor.
- `Ctrl+Shift+M` toggles the metadata drawer. Its disclosure preference is
  UI-only and restored locally.
- Saving non-empty code with no tags applies up to two deterministic local
  tags. Existing matching tags are reused before a new tag is generated.
- Sessions may store one absolute HTTP(S) Reference URL and up to 128 KiB of
  raw UTF-8 Markdown Notes. Notes preview supports common Markdown and GFM,
  does not render raw HTML, and never loads remote images.
- Press `Escape`, then `Tab`, to move keyboard focus out of the code editor.
- The stdin panel can be closed so the console occupies the full runner column.
- Editor/runner sizing, stdin sizing and visibility, and each session's cursor
  selection are restored from browser-local preferences.
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

Start the full development environment from the repository root:

```bash
npm run dev
```

Open `http://127.0.0.1:5173`. The development controller starts:

- Vite UI: `127.0.0.1:5173`
- FastAPI persistence API: `127.0.0.1:8765`
- Isolated execution origin: `127.0.0.1:8766`

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

## Security boundary

Python executes with Pyodide in a disposable Web Worker on a separate loopback
origin. The persistence API requires a per-launch capability token that is
never sent to the execution origin. This protects CodeBro data and keeps
runaway code off the UI thread, but it is not a certified hostile-code sandbox.
