# CodeBro Implementation Plan

## Context

CodeBro is a local-first Python playground for macOS. It combines a modern
React interface, a Python-highlighted editor with all completion behavior
disabled, browser-isolated Pyodide execution, and durable SQLite sessions.

The implementation is intentionally split into:

- `frontend/`: React, TypeScript, Vite, CodeMirror, themes, autosave, and the
  execution client.
- `backend/`: FastAPI, SQLite, mutation receipts, session search, and local
  application servers.
- `scripts/`: build and development helpers.

All implementation artifacts remain inside this repository.

## Plan

1. Build and test the FastAPI/SQLite API.
2. Build the React session library and playground.
3. Add CodeMirror Python highlighting without completions.
4. Add isolated Pyodide execution with fresh workers, timeout, and output caps.
5. Add macOS controller and packaging scaffolding.
6. Run backend, frontend, build, and integration verification.
7. Audit the finished product against the source specification.

## Status

- Repository initialized.
- Backend implementation complete.
- Frontend implementation complete.
- Execution host complete.
- Light and dark design complete.
- Automated verification complete.
- Browser smoke complete against development and the rebuilt packaged app.
- Unsigned Apple-silicon `CodeBro.app` and DMG rebuilt with Node.js 24.16.0
  and validated.

## Verification outcome

- Backend: 28 tests passing.
- Frontend: 47 tests, ESLint, TypeScript, and Vite build passing.
- Runtime: Pyodide 314.0.0 executed `main.py` successfully.
- Browser: create, edit, autosave, run with stdin, output, theme toggle, and
  navigation passed in headless Chrome.
- Packaging: PyInstaller produced a 46 MiB onedir macOS application containing
  the frontend, SQLite backend, execution origin, and bundled Pyodide assets.

## Repository hardening and review

1. Add repository-specific `AGENTS.md` instructions.
2. Add the MIT license.
3. Run independent backend, frontend/runtime, and maintainability reviews.
4. Address substantive findings and repeat review passes until all reviewers
   report no remaining comments.
5. Rerun the complete verification matrix.

Status: implementation fixes complete; clean independent review pass in
progress.

## Editor and availability enhancements

- Added collapsible stdin with full-height console expansion.
- Reworked selection styling for legibility across every editor theme.
- Added Python block folding.
- Added `Cmd/Ctrl+/` line and selection commenting.
- Added proactive server-health reporting with retry.
- Added `Cmd/Ctrl+S` immediate save handling.
- Expanded unit and browser smoke coverage for these behaviors.

Status: implementation and browser verification complete; independent review
cycle in progress.

## Execution resilience and resize accessibility

- Worker crashes now fail an active run with its `runId`, terminate the failed
  Worker, and initialize a fresh Worker.
- Worker initialization failures terminate and replace the failed Worker.
- Output batches flush by elapsed time or accumulated UTF-8 bytes instead of
  flushing on each newline, while React appends transport-ordered fragments.
- Editor/runner and stdin/output separators expose keyboard focus, numeric ARIA
  values, arrow-key resizing, and Home/End bounds.
- Added focused bridge, Worker harness, hook, and separator regression tests.

Status: complete. Frontend tests, ESLint, and TypeScript typechecking pass.

## Reliability and repository hardening

- Added transactional ordered migrations and future-schema rejection.
- Persisted bounded code previews so session lists do not load full source
  blobs.
- Retained mutation receipts indefinitely and reused caller mutation IDs for
  uncertain create, rename, and delete retries.
- Blocked encoded and resolved-path traversal in the SPA fallback.
- Reserved controller ports before startup and published runtime state only
  after both servers were ready.
- Drained edits made during active saves and protected dirty drafts across
  application and browser navigation.
- Rejected stale session, search, pagination, and health-check responses.
- Added Worker crash recovery with bounded retry backoff and batched output.
- Added Worker initialization timeout, output fragment caps, and full
  timeout/stop/overflow/fresh-worker coverage.
- Added request timeouts, terminal validation recovery, modal focus management,
  and navigation-safe in-flight autosave tracking.
- Pinned JavaScript and Python dependencies and documented reproducible
  installation commands.
- Enforced Node.js 24.16.0 for packaging, bundled license notices, populated
  app versions, and added optional signing/notarization/stapling support.

Status: complete and verified.
