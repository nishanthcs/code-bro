# Agent Handbook for CodeBro

## Purpose

CodeBro is a local-first macOS Python playground. It provides:

- A React and TypeScript browser interface.
- A CodeMirror 6 editor with Python syntax highlighting.
- No autocomplete, completion popovers, snippets, lint suggestions, automatic
  imports, or AI code assistance.
- Python execution through Pyodide in a disposable Web Worker.
- Named sessions persisted in a local SQLite database through FastAPI.
- Search, autosave, revision conflict handling, soft deletion, and light/dark
  themes.
- A packaged Apple-silicon macOS application and DMG.

## Repository Layout

- `frontend/`
  - `src/`: React application, editor, session UI, themes, API client, and
    hooks.
  - `execution/`: cross-origin iframe bridge and Pyodide Worker source.
  - `dist/`: generated production frontend; ignored by Git.
  - `dist-execution/`: generated execution assets and bundled Pyodide; ignored.
- `backend/`
  - `app/`: FastAPI apps, SQLite repository, models, configuration, and macOS
    controller.
  - `tests/`: backend API and repository tests.
  - `CodeBro.spec`: PyInstaller configuration.
- `scripts/`: development, build, browser-smoke, Pyodide-smoke, and packaging
  commands.
- `docs/`: architecture, release checklist, and release manifest.
- `release/`: generated app and DMG; ignored by Git.

## Runtime Architecture

CodeBro uses two loopback origins:

1. The application origin serves the React UI and token-protected persistence
   API.
2. The execution origin serves only the iframe bridge, Worker, and local
   Pyodide assets.

The execution origin must never receive the per-launch API token. It has no
persistence routes and no CORS permission to the application API. Preserve this
boundary when changing startup, CSP, iframe, Worker, or API code.

Each Python run must use a fresh Worker. Stop, timeout, overflow, success, and
failure all terminate the active Worker before another run becomes available.

## Critical Product Contracts

### Editor

- Keep Python syntax highlighting enabled.
- Do not enable CodeMirror autocomplete or completion keymaps.
- Do not add snippets, lint popovers, ghost text, parameter hints, automatic
  imports, or AI suggestions.
- Keep browser spellcheck, autocorrect, autocapitalization, and grammar
  assistance disabled on the editor surface.
- Do not add format-on-save or mutate the user's source text.

`@codemirror/lang-python` currently has autocomplete as a transitive package,
but CodeBro must not import or configure the autocomplete extension.

### Persistence

- SQLite is the durable source of truth for session names and code.
- Do not store session source code in local storage.
- Theme preference may remain in local storage because it is UI-only state.
- Preserve optimistic revisions and durable mutation receipts.
- Check mutation receipts before revision conflicts so retries remain
  idempotent after lost responses.
- Keep session deletion soft.
- Search names using the same Unicode NFKC normalization and case folding for
  writes and queries.

### Execution

- Pyodide assets must be bundled locally; do not add a CDN fallback.
- Do not call `loadPackagesFromImports`, `micropip.install`, or package-fetching
  APIs.
- Preserve the 10-second timeout, 1 MiB output limit, 10,000-newline limit, and
  ordered stdout/stderr fragments.
- Render execution output as text, never HTML.
- Pyodide is an application-stability boundary, not a certified hostile-code
  sandbox. Do not claim otherwise.

### Security and Privacy

- Bind servers only to `127.0.0.1`.
- Require the per-launch `X-CodeBro-Token` header on every API request.
- Keep mutation requests JSON-only.
- Keep strict Host validation, separate CSPs, absent API CORS headers, and
  origin/source validation for `postMessage`.
- Never log session names, code, stdin, or output.
- Do not add analytics, telemetry, remote fonts, third-party scripts, or runtime
  CDN dependencies.

## Development Environment

- Node.js is pinned by `.node-version` and `.nvmrc` to `24.16.0`.
- Python 3.12 or newer is required.
- The repository-local virtual environment is `.venv/`.
- Install dependencies:

```bash
python3.12 -m venv .venv
.venv/bin/pip install -c backend/constraints.txt -e './backend[dev,package]'
npm ci
```

- Start development services:

```bash
npm run dev
```

This starts:

- UI: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8765`
- Execution origin: `http://127.0.0.1:8766`

## Required Verification

Run checks proportionate to the change. Before declaring a broad change
complete, run:

```bash
.venv/bin/pytest backend/tests
npm test
npm run lint
npm run typecheck
npm run build
npm run smoke:python
```

For UI, execution, or integration changes, also run development services and:

```bash
npm run smoke:ui
```

The UI smoke uses the locally installed Google Chrome. It creates ignored
screenshots under `artifacts/`.

For controller or packaging changes:

```bash
scripts/package-macos.sh
```

Signing requires `CODEBRO_SIGNING_IDENTITY`. Set `CODEBRO_NOTARY_PROFILE` to a
configured `xcrun notarytool` keychain profile to notarize and staple the app
and DMG. Without those credentials, output is a development artifact and must
not be described as Gatekeeper-ready.

## Coding Standards

- Keep TypeScript strict and Python type annotations explicit at public
  boundaries.
- Prefer small functions with one responsibility.
- Use comments only for non-obvious decisions, invariants, and security
  boundaries.
- Avoid hidden global state. Pass settings and dependencies explicitly where
  practical.
- Preserve stable JSON API error codes and response shapes.
- Validate input at the API boundary and avoid echoing source code in errors.
- Keep generated files, caches, databases, screenshots, build output, and
  release artifacts out of Git.
- Preserve unrelated changes in a dirty worktree.

## Testing Standards

- A bug fix should include a regression test when practical.
- Backend tests should cover API status, error code, persistence result, and
  idempotency behavior.
- Frontend tests should prefer observable behavior. Source-inspection tests are
  acceptable only for negative configuration guarantees such as ensuring
  autocomplete is not enabled.
- Execution changes should cover stdout, stderr, stdin, timeout, stop, output
  limits, UTF-8 boundaries, and fresh-Worker behavior as applicable.
- Avoid tests that require public internet access.

## Documentation and Record Keeping

- Update `README.md` when setup, commands, or user-facing behavior changes.
- Update `docs/ARCHITECTURE.md` when boundaries or data flow change.
- Update `docs/RELEASE.md` when release steps change.
- Update `docs/RELEASE_MANIFEST.md` only for an actual rebuilt release artifact.
- Record non-trivial implementation work and verification in
  `IMPLEMENTATION_PLAN.md` or a focused document under `docs/`.

## Review Expectations

When reviewing:

1. Report correctness, security, data-loss, and execution-isolation findings
   before style concerns.
2. Include exact paths and line numbers.
3. Explain the concrete failure mode and a practical fix.
4. Identify missing tests or documentation when they create maintenance risk.
5. Do not report preferences as defects unless they materially reduce clarity,
   reliability, accessibility, or maintainability.
