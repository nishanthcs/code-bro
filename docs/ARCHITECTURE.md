# CodeBro Architecture

## Runtime topology

CodeBro uses two loopback origins:

1. The application origin serves the React build and the token-protected
   FastAPI persistence API.
2. The execution origin serves only an iframe bridge, a disposable Web Worker,
   and bundled Pyodide assets.

The browser sends code and program input to the execution iframe with
`postMessage`. The iframe validates the exact parent origin and delegates each
run to a fresh Worker. The Worker is terminated after completion, failure,
manual stop, timeout, or output overflow.

## Persistence

SQLite contains:

- `sessions`: names, normalized search names, code, persisted code previews,
  normalized tags, tag-search text, revision, timestamps, and soft-deletion
  state.
- `mutations`: durable idempotency receipts used to distinguish a lost HTTP
  response from a genuine concurrent edit.

Session updates use optimistic revisions. Mutation receipts are checked before
revision checks so retries remain idempotent even if another tab saved a newer
revision. Receipts are retained indefinitely because deleting one would allow a
delayed retry to apply as a new mutation.

Session listing is server-backed and cursor-paginated. Name-or-tag search, sort
selection, and updated-date thresholds are applied in SQLite so the dashboard
remains correct beyond the first loaded page.

The token-protected settings endpoint exposes only the resolved SQLite database
path. The dashboard presents this value read-only and provides no settings
mutation API.

Schema changes run as ordered migrations inside one explicit write
transaction. The application refuses to open a database with a schema version
newer than it supports. Schema version 2 adds and backfills `code_preview`;
create and code-patch mutations maintain it so session lists do not read full
source text. Schema version 3 adds JSON tag storage and normalized tag-search
text.

## Controller startup

The macOS controller binds and reserves both loopback sockets before either
Uvicorn server starts, then passes the open sockets into the servers. It waits
for both origins to finish startup before atomically replacing `runtime.json`
and opening the browser. This prevents port-selection races and prevents other
launches from observing runtime state for servers that are not ready.

## Static application fallback

The application origin resolves candidate SPA files against the frontend
distribution root and rejects paths that escape it, including percent-encoded
traversal segments and symlinks that resolve outside the distribution.

## Editor

CodeMirror 6 uses the Python language package, syntax highlighting, line
numbers, history, search, language-aware newline indentation, Python-aware
folding, and line-comment commands. Native selection rendering is used so each
editor theme controls both selection foreground and background contrast. The
implementation does not enable completion, lint, snippet, automatic-import, or
close-bracket extensions.

The playground installs page-level `Cmd/Ctrl+S` and `Cmd/Ctrl+Enter` handling
so save and run work outside the editor. `F2` focuses the session name and
`Ctrl+Shift+T` focuses the tag editor. CodeMirror handles `Cmd/Ctrl+/` for the
current line or selected lines. `Escape`, then `Tab`, temporarily disables
CodeMirror's Tab indentation binding so keyboard users can leave the editor.

## Availability feedback

The React shell polls the token-protected `/api/v1/health` route and rechecks on
browser focus or network recovery. If the local API is unavailable, a fixed
alert explains that sessions cannot load or save and provides a retry action.

## Runner layout

The editor/runner split and stdin/console split are resizable with pointers or
keyboard-accessible separators. Closing stdin removes its resize handle and
gives the console the full runner height; a `Show input` action restores the
panel without discarding its text. Split sizes, stdin visibility, and
per-session cursor selections are UI-only preferences stored in localStorage.

## Themes

The UI ships polished light and dark themes. The initial value follows the
operating system and the user choice is stored as a UI-only local preference.
Session source code, names, and tags are never persisted in browser storage.
