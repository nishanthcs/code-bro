# Python Debugger Implementation Plan

## Objective

Add an in-browser Python debugger for the code executed from a playground
session. The debugger must support:

- Starting a debug session from the current session code and `stdin` snapshot.
- Pausing at the first executable line and at user breakpoints.
- Step in.
- Step over.
- Step out.
- Continue.
- Stop.
- Viewing variable values for the selected stack frame.
- Setting variable values while paused.

The debugger must align with CodeBro's current design:

- Local-first and offline-capable.
- No runtime CDN, package download, telemetry, analytics, or remote service.
- No autocomplete, snippets, lint suggestions, ghost text, AI assistance, or
  automatic code mutation.
- App UI remains on the application origin.
- Python execution and debugger runtime remain on the execution origin.
- The execution origin must not receive the API token.
- Source code, `stdin`, output, variable values, and debugger commands must not
  be logged.
- Debug state is volatile or UI-only. It must not require database migrations
  for the first implementation.

## Non-goals

- Multi-file debugging.
- Thread debugging.
- Conditional breakpoints.
- Watch expressions.
- Arbitrary expression evaluation from the UI.
- Time-travel debugging.
- Persisting variable snapshots, call stacks, or debug history.
- Treating Pyodide as a certified hostile-code sandbox.

Line breakpoints are included in the initial implementation because the basic
step controls need a practical way to start from a meaningful location. They
should be implemented as UI/debugger state, not as session source-code changes.

## Current Architecture Constraints

The current execution path is:

1. `Playground.tsx` calls `useExecution().run(code, stdin)`.
2. `useExecution.ts` posts a `run` message to the execution iframe.
3. `frontend/execution/bridge.js` validates the parent origin and forwards the
   run to a disposable Worker.
4. `frontend/execution/worker.js` loads local Pyodide assets, redirects
   `stdout` and `stderr`, injects `stdin` as `StringIO`, and executes:

   ```python
   exec(compile(__codebro_source, "main.py", "exec"), scope, scope)
   ```

5. The bridge terminates the Worker after completion, failure, stop, timeout,
   or output overflow, then starts a fresh Worker.

The debugger must preserve the normal Run path. A normal run should keep the
existing fresh-Worker behavior, 10-second wall timeout, output limits, ordered
output fragments, and terminal-state semantics.

## Key Technical Decision: Paused Debugger Command Channel

A debugger based on Python `sys.settrace` can detect line, call, return, and
exception events. The hard part is not detecting pauses; it is waiting for UI
commands while the Python stack remains alive.

Do not implement the debugger by calling `pdb` or by assuming a trace callback
can `await` a browser `postMessage`. While Pyodide is executing Python in the
Worker, that Worker's message event loop cannot process new commands unless the
debugger provides a synchronous pause mechanism.

Use this design:

- The execution bridge remains responsive.
- The Python Worker pauses inside the trace callback.
- The bridge and Worker share a debugger command buffer.
- When the UI sends a step/continue/set-variable command, the bridge writes the
  command into the shared buffer and wakes the Worker.
- The Worker reads the command synchronously, applies it, and either resumes
  Python execution or remains paused.

The preferred implementation is a `SharedArrayBuffer` plus `Atomics.wait` /
`Atomics.notify` between `bridge.js` and `worker.js`. The parent app does not
need direct access to the shared buffer; it only sends normal `postMessage`
commands to the bridge.

### Required feasibility spike

Before implementing debugger features, run a small spike in the current
two-origin iframe topology to verify:

1. The execution bridge can create and pass a `SharedArrayBuffer` to its
   dedicated Worker.
2. `self.crossOriginIsolated` is true where required.
3. Any required `Cross-Origin-Opener-Policy`,
   `Cross-Origin-Embedder-Policy`, `Cross-Origin-Resource-Policy`, and
   permissions-policy changes do not weaken the existing boundaries:
   - strict Host validation remains;
   - the app origin keeps `frame-ancestors 'none'`;
   - the execution origin is frameable only by the app origin;
   - the API still has no CORS permission;
   - the execution origin still has no persistence routes;
   - the API token is still unavailable to the execution origin.
4. The packaged app and local browser flow still work after the header changes.

If `SharedArrayBuffer` cannot be enabled without weakening the app/execution
boundary, pause the debugger implementation and document the blocker. Do not
replace it with polling, backend command endpoints, synchronous XHR, or an
interactive `pdb` prompt.

## Runtime Design

### Worker modes

Keep one Worker implementation, but support two mutually exclusive modes:

- `run`: the existing fast execution path.
- `debug`: trace-enabled execution with debugger command handling.

Normal runs and debug sessions must not overlap. Starting either mode while
another is active should be ignored or rejected by the bridge with a typed
system message.

### Debug session lifecycle

1. User clicks `Debug`.
2. The app autosaves using the existing save path, then sends a debug start
   request using the current draft code and `stdin` snapshot.
3. The bridge creates a fresh Worker or uses a ready idle Worker.
4. The Worker compiles `main.py`.
5. Compile errors are reported as the same visible failure style used by Run.
6. If compilation succeeds, the Worker installs the debugger trace function.
7. Execution starts and pauses before the first executable user-code line.
8. The Worker posts a `debug-paused` snapshot.
9. The UI enables step/continue/set-variable controls.
10. The user sends commands until the program completes, fails, is stopped,
    times out, or overflows output.
11. The bridge terminates the Worker and starts a fresh ready Worker.

### Timeout model

Normal Run keeps the existing 10-second wall timeout.

Debug sessions should use an execution-time budget that excludes time spent
paused for user input:

- While Python is running, enforce the same 10-second active-execution budget
  per uninterrupted resume segment.
- While paused, stop the active-execution timer.
- Add a defensive idle cap, for example 15 minutes paused, after which the
  debugger stops and reports an idle-timeout system message.
- Stop always terminates the Worker immediately.

This keeps debug pauses usable without letting runaway code or abandoned
sessions keep a Worker alive indefinitely.

### Output handling

Reuse the current output capture pipeline:

- Preserve `stdout`, `stderr`, and `system` streams.
- Preserve fragment ordering.
- Preserve the 1 MiB output limit.
- Preserve the 10,000-newline limit.
- Preserve the 2,000-fragment limit.
- Render all output as text, never HTML.

Debug protocol messages must not be mixed into the console as raw output unless
they are user-facing system messages such as timeout, stop, or overflow.

## Debugger Engine Design

Create a small pure-Python debugger engine loaded by `worker.js` inside
Pyodide. Prefer a separate execution asset such as:

- `frontend/execution/debugger.py`

Then update the execution build script to copy it into
`frontend/dist-execution/`.

The Worker should load it from the execution origin or embed it into Pyodide's
virtual filesystem during initialization. Keep the file local and bundled; do
not fetch from a CDN or install packages at runtime.

### Trace mechanism

Use `sys.settrace` with a custom trace function.

Track:

- active debug session id;
- command state;
- breakpoint line numbers for `main.py`;
- current stepping mode;
- current frame id;
- current call depth;
- step-over target frame and depth;
- step-out target depth;
- last pause id;
- stop requested flag;
- pause requested flag, if a Pause button is added.

Handle trace events:

- `line`: primary pause point.
- `call`: needed for step-in and call-stack depth.
- `return`: needed for step-out.
- `exception`: optional for initial implementation; useful for future
  "pause on exception".

Only pause automatically in user code compiled as `main.py`. Do not step into
Pyodide internals, the debugger engine, or Python standard-library internals by
default.

### Step semantics

Initial debug start:

- Pause at the first executable line in `main.py`.

Continue:

- Resume until a breakpoint, program completion, failure, stop, timeout, or
  overflow.

Step in:

- Pause at the next user-code line event, including inside called user
  functions.

Step over:

- If the current line calls a function, execute the call without pausing inside
  it.
- Pause at the next user-code line in the same frame or an older frame.
- If execution returns out of the current frame, pause at the caller's next
  user-code line.

Step out:

- Continue until the current frame returns.
- Pause at the caller's next user-code line.
- If the current frame is the top-level module frame, continue until completion
  or the next breakpoint.

Stop:

- From paused state, wake the Worker and raise an internal
  `CodeBroDebuggerStopped` exception.
- From running state, terminate the Worker through the bridge, matching the
  current Stop behavior.

### Breakpoints

Represent breakpoints as 1-based line numbers for `main.py`.

UI behavior:

- Toggle breakpoints from a CodeMirror gutter marker.
- Allow breakpoints only on lines in the current session document.
- Store breakpoint line numbers in UI/debugger state.
- Optionally persist per-session breakpoint line numbers in `localStorage`
  under a key such as `codebro-debug-breakpoints:<sessionId>`.
- Never insert, remove, or edit source text when setting breakpoints.

Runtime behavior:

- On debug start, send the current breakpoint line set to the Worker.
- On breakpoint changes during a paused or running debug session, send an
  update command to the bridge.
- The Worker should ignore non-executable breakpoint lines at runtime.
- If a breakpoint line becomes invalid because the user edited code before
  starting the next debug session, keep the marker visually but let runtime
  ignore it until the user removes or moves it.

Recommended MVP behavior:

- Freeze source edits while a debug session is active so line mappings remain
  stable.
- Still allow breakpoint toggles while debugging because they do not mutate
  source code.

### Variable snapshots

Each `debug-paused` message should include a bounded variable snapshot for the
selected frame.

Minimum data:

```ts
interface DebugVariable {
  name: string;
  scope: "local" | "global";
  typeName: string;
  preview: string;
  editable: boolean;
  truncated: boolean;
}
```

Snapshot rules:

- Show locals for the selected frame first.
- Show globals in a separate collapsible section.
- Hide `__builtins__`, debugger internals, and double-underscore names by
  default.
- Provide a "Show internals" UI only if needed later.
- Limit the number of variables per scope.
- Limit preview length per variable.
- Limit total snapshot payload size.
- Catch serialization failures and show a safe placeholder.

Avoid calling arbitrary user-defined `__repr__` for previews in the MVP. A safe
serializer should handle common built-in types directly:

- `None`
- `bool`
- `int`
- `float`
- `complex`
- `str`
- `bytes`
- `list`
- `tuple`
- `set`
- `dict`

For unknown objects, display a safe shape such as:

```text
<ClassName object>
```

Do not allow one variable preview to hang the debugger.

### Setting variable values

Variable editing occurs only while paused.

UI flow:

1. User selects an editable variable.
2. User clicks Edit or presses Enter on the value cell.
3. User enters a Python literal value.
4. UI sends `set-variable` with debug session id, pause id, frame id, scope,
   variable name, and literal text.
5. Worker validates and applies the update.
6. Worker sends a refreshed `debug-paused` snapshot or a typed edit error.

Validation rules:

- Variable names must match Python identifier syntax.
- Do not allow editing protected names:
  - `__builtins__`
  - `__name__`
  - `__debugger__` or any CodeBro internal name
  - imported module objects in the MVP
- Parse values with `ast.literal_eval`.
- Support a small explicit set of literal values:
  - strings
  - numbers
  - booleans
  - `None`
  - lists
  - tuples
  - sets
  - dictionaries
- Reject arbitrary expressions and function calls in the MVP.

Applying local variable updates is the riskiest debugger requirement. CPython
optimized function locals may not always be updated by writing to
`frame.f_locals` unless the runtime provides a write-through locals proxy or an
explicit locals-to-fast synchronization path.

Before marking variable editing complete, add a runtime proof in Pyodide that
all required cases work:

```python
def demo():
    x = 1
    # pause here
    y = x + 1
    return y
```

Acceptance behavior:

- At the pause, set `x` to `40`.
- Step over.
- Verify `y == 41`.

If the current Pyodide Python version supports write-through frame locals, use
that directly. If not, investigate a CPython-specific synchronization helper
only inside Pyodide. If neither approach works reliably, keep global/module
variable editing enabled, disable optimized function-local editing, and record
the limitation explicitly before release. The user-facing requirement should
not be considered fully satisfied until function-local editing is proven.

## Message Protocol Plan

Extend the current app ↔ bridge ↔ Worker protocol. Keep validation strict at
each boundary.

### App to bridge

```ts
type ExecutionRequest =
  | { type: "initialize" }
  | { type: "run"; runId: string; code: string; stdin: string }
  | { type: "stop"; runId: string }
  | {
      type: "debug-start";
      debugId: string;
      code: string;
      stdin: string;
      breakpoints: number[];
    }
  | {
      type: "debug-command";
      debugId: string;
      commandId: string;
      command:
        | { type: "continue" }
        | { type: "step-in" }
        | { type: "step-over" }
        | { type: "step-out" }
        | { type: "stop" }
        | { type: "update-breakpoints"; breakpoints: number[] }
        | {
            type: "set-variable";
            pauseId: string;
            frameId: string;
            scope: "local" | "global";
            name: string;
            literal: string;
          };
    };
```

### Bridge to app

```ts
type ExecutionMessage =
  | { type: "ready" }
  | { type: "resetting" }
  | { type: "output"; runId: string; fragments: OutputFragment[] }
  | { type: "completed"; runId: string; durationMs: number }
  | { type: "failed"; runId: string; traceback: string }
  | { type: "stopped"; runId: string }
  | { type: "timed-out"; runId: string }
  | { type: "overflow"; runId: string; message: string }
  | { type: "initialization_failed"; message: string }
  | {
      type: "debug-paused";
      debugId: string;
      pauseId: string;
      reason: "entry" | "breakpoint" | "step" | "pause";
      location: DebugLocation;
      stack: DebugStackFrame[];
      scopes: DebugScope[];
    }
  | {
      type: "debug-command-failed";
      debugId: string;
      commandId: string;
      message: string;
    };
```

For compatibility with existing output rendering, either:

- reuse `runId` as the debug session id for output and terminal messages; or
- add `debugId` variants for output and terminal messages.

Prefer reusing a single execution id internally so output coalescing and
terminal-state handling do not fork unnecessarily.

## Frontend State Design

### `useExecution.ts`

Extend `useExecution` rather than creating a second iframe owner.

New responsibilities:

- track whether the active execution is normal run or debug run;
- expose `startDebug(code, stdin, breakpoints)`;
- expose debugger commands:
  - `continueDebug()`
  - `stepIn()`
  - `stepOver()`
  - `stepOut()`
  - `setVariable(...)`
  - `updateBreakpoints(...)`
  - `stop()`
- store the latest paused snapshot;
- reject stale `pauseId`, `debugId`, and `commandId` messages;
- clear debug state when a debug session terminates;
- preserve existing output behavior.

Recommended statuses:

```ts
type RunStatus =
  | "loading"
  | "ready"
  | "running"
  | "debug-running"
  | "debug-paused"
  | "resetting"
  | "completed"
  | "failed"
  | "stopped"
  | "timed-out";
```

This avoids a separate status machine in the top-level page while still letting
buttons and panels distinguish normal running from debugging.

### `Playground.tsx`

Add:

- Debug button next to Run.
- Stop button when status is `running`, `debug-running`, or `debug-paused`.
- Breakpoint state keyed by session id.
- Current debug line from `execution.debugPaused?.location.line`.
- Debug panel props.

Starting debug should:

- save the draft using the existing autosave path;
- use the current draft code as the debug snapshot;
- use the current `stdin` text as the input snapshot;
- freeze source editing until the debug session ends;
- auto-expand the Debugger panel.

Do not save or mutate source code merely because debugging starts.

### `CodeEditor.tsx`

Add debugger-specific props:

```ts
interface CodeEditorDebugProps {
  readOnly?: boolean;
  breakpoints: Set<number>;
  currentDebugLine: number | null;
  onToggleBreakpoint: (line: number) => void;
}
```

Implementation details:

- Add a CodeMirror gutter for breakpoints.
- Add line decorations for:
  - breakpoint line;
  - current paused line;
  - optional selected stack-frame line.
- Keep Python syntax highlighting, history, search, folding, and line comments.
- Do not enable autocomplete or lint extensions.
- Do not modify document text when toggling breakpoints.
- When read-only during debug, preserve selection, scroll position, line
  numbers, and breakpoint toggles.

### `RunnerPanel.tsx`

Add a dedicated Debugger panel in the runner column. It should behave like the
existing runner panels:

- collapsible;
- keyboard accessible;
- optional resizable split;
- localStorage-backed panel preference;
- does not affect output content or session persistence.

Recommended placement:

1. Program input, when open.
2. Output.
3. Debugger, when expanded or active.
4. Session Notes.

The Debugger panel should be collapsed by default when no debug session is
active and auto-expand when debugging starts. Do not change the user's Notes
content or collapse preference.

If available vertical space becomes too constrained, prioritize:

1. Output minimum height.
2. Active Debugger panel minimum height.
3. Notes collapsed height.
4. Stdin expanded height.

### New `DebuggerPanel.tsx`

Create a focused component responsible for debugger UI.

Panel sections:

- Status bar:
  - Not debugging.
  - Running under debugger.
  - Paused at `main.py:<line>`.
  - Completed/failed/stopped.
- Controls:
  - Continue.
  - Step over.
  - Step in.
  - Step out.
  - Stop.
- Call stack:
  - function name;
  - file;
  - line;
  - selected frame.
- Variables:
  - locals;
  - globals collapsed by default;
  - type;
  - preview;
  - edit action for editable variables.
- Inline edit form:
  - literal input;
  - Apply;
  - Cancel;
  - validation error.

Recommended accessible names:

- `Start debugging`
- `Continue debugging`
- `Step over`
- `Step into`
- `Step out`
- `Stop debugging`
- `Edit variable <name>`
- `Set variable <name>`
- `Cancel editing variable <name>`

Recommended keyboard shortcuts:

- `F5`: continue debugging.
- `F10`: step over.
- `F11`: step into.
- `Shift+F11`: step out.
- Existing `Cmd/Ctrl+Enter`: normal Run only.

Shortcuts should be active only when a debug session exists and should not
override text input editing.

### Preferences

Add UI-only preferences in `frontend/src/lib/preferences.ts`:

- `codebro-debugger-collapsed`
- `codebro-debugger-height`
- optional `codebro-debug-breakpoints:<sessionId>`

Store only layout and breakpoint line numbers. Do not store source code,
`stdin`, output, variables, stack frames, or variable edit history.

## Backend and Security Plan

Expected backend changes are limited to execution-serving headers if the
`SharedArrayBuffer` spike requires cross-origin isolation.

Do not add:

- debugger API routes;
- debugger WebSocket routes;
- backend command queues;
- CORS permission from execution origin to API;
- API token forwarding to the execution origin;
- logging of debug commands or variable values.

Header changes must be covered by backend tests. The tests should verify that:

- app API token protection still works;
- app origin CSP still restricts frames to the execution origin;
- execution origin CSP still restricts `frame-ancestors` to the app origin;
- execution origin still serves only bridge, Worker, debugger asset, and local
  Pyodide assets;
- no API CORS headers are introduced.

## Styling Plan

Add CSS for:

- breakpoint gutter markers;
- current debug line highlight with sufficient contrast in all editor themes;
- debug panel layout;
- selected stack frame;
- variable table;
- inline variable editor;
- debug-running and debug-paused status colors;
- compact responsive behavior when the runner column is narrow.

Theme requirements:

- Support all existing app/editor themes.
- Do not rely on color alone for breakpoints or current execution line.
- Use icons, labels, or shape differences where needed.
- Keep focus rings visible.

## Testing Plan

### Unit tests

Add tests for:

- protocol validation in `bridge.js`;
- stale `debugId`, `pauseId`, and `commandId` rejection;
- bridge-to-Worker debug command delivery through the shared command buffer;
- Worker terminal-state cleanup;
- normal Run path remaining unchanged;
- output coalescing during debug;
- timeout behavior excluding paused time;
- breakpoint update commands;
- variable snapshot serialization and truncation;
- variable edit validation;
- variable edit application for module globals;
- variable edit application for function locals, if supported by the Pyodide
  runtime.

### Component tests

Add tests for:

- Debug button disabled/enabled states;
- starting debug auto-expands the Debugger panel;
- paused line is highlighted;
- breakpoint gutter toggles without changing editor text;
- source editor is read-only while debugging;
- controls enable only in valid states;
- variable edit success refreshes displayed value;
- variable edit failure displays a safe inline error;
- debugger panel collapse/expand preserves focus;
- keyboard shortcuts do not fire while typing in the variable editor.

### Smoke tests

Extend or add a UI smoke flow:

1. Create a session.
2. Enter a small program:

   ```python
   def add(a, b):
       total = a + b
       return total

   x = 1
   y = 2
   print(add(x, y))
   ```

3. Set a breakpoint on `total = a + b`.
4. Start debugging.
5. Continue to the breakpoint.
6. Verify the current line highlight.
7. Verify local variables `a` and `b`.
8. Set `a` to `40`.
9. Step over.
10. Verify `total` becomes `42`.
11. Continue.
12. Verify output is `42`.
13. Verify the Worker resets and normal Run still works.

### Required verification before declaring complete

Run the standard broad checks:

```bash
.venv/bin/pytest backend/tests
npm test
npm run lint
npm run typecheck
npm run build
npm run smoke:python
```

For this feature, also run:

```bash
npm run dev
npm run smoke:ui
```

If execution headers or packaging behavior change, also run:

```bash
scripts/package-macos.sh
```

## Implementation Phases

### Phase 0: Runtime feasibility spikes

Deliverables:

- Minimal `SharedArrayBuffer` proof inside the execution iframe and Worker.
- Header changes required for cross-origin isolation, if any.
- Tests proving existing app/execution/API isolation remains intact.
- Pyodide proof for setting function-local variables while paused.

Exit criteria:

- Bridge can wake a paused Worker without involving the app API.
- Function-local variable editing is either proven or explicitly blocked with a
  documented fallback.
- No source code, stdin, output, or variable value logging is introduced.

### Phase 1: Protocol and state scaffolding

Deliverables:

- TypeScript protocol types.
- Extended `useExecution` state machine.
- Debug start/command/terminal handling without UI polish.
- Stale message rejection.
- Tests for normal Run compatibility.

Exit criteria:

- Existing Run behavior and tests remain green.
- Debug messages can be started, paused, continued, stopped, and cleaned up in
  mocked tests.

### Phase 2: Debugger runtime

Deliverables:

- Pure-Python debugger engine.
- Worker integration.
- Bridge command buffer integration.
- Breakpoint, step-in, step-over, step-out, continue, stop behavior.
- Variable snapshot serialization.
- Variable edit command support.

Exit criteria:

- A debug session can pause at entry, step through simple code, display
  variables, edit a variable, and continue to completion in automated tests.

### Phase 3: Editor integration

Deliverables:

- Breakpoint gutter.
- Current paused line highlight.
- Read-only editor mode during active debugging.
- Per-session breakpoint state.
- Accessibility labels for breakpoint controls.

Exit criteria:

- Breakpoint toggles never mutate source text.
- Existing editor guarantees remain intact.
- Keyboard users can discover and operate breakpoint controls.

### Phase 4: Debugger panel UI

Deliverables:

- `DebuggerPanel`.
- Runner-panel layout integration.
- Step/continue/stop controls.
- Call stack display.
- Locals/globals variable display.
- Inline variable editing.
- Panel collapse/expand and resize preferences.

Exit criteria:

- The UI supports the requested debugger actions without leaving the
  playground.
- Debugger layout fits the current runner design and remains usable when Notes
  and `stdin` exist.

### Phase 5: Full verification and docs

Deliverables:

- Unit/component/smoke tests.
- `docs/ARCHITECTURE.md` update for debugger data flow and isolation.
- `README.md` update only if the debugger becomes user-facing in the shipped
  app.
- Release docs update only if packaging or release steps change.

Exit criteria:

- Required verification commands pass.
- The feature is documented accurately without overstating Pyodide sandbox
  guarantees.

## Acceptance Criteria

The feature is complete when:

- Starting a debug session does not persist source code outside SQLite.
- The API token is never sent to the execution origin.
- A debug session pauses at the first executable line.
- User breakpoints pause execution.
- Step in works across user-defined function calls.
- Step over skips pausing inside user-defined function calls.
- Step out returns to the caller.
- Variables for the selected frame are visible with bounded safe previews.
- Setting a variable changes subsequent execution behavior.
- Stop terminates the Worker.
- Output ordering and limits match normal Run.
- Normal Run remains unchanged.
- Debugger controls are keyboard accessible.
- Breakpoints and line highlights do not modify source text.
- Tests cover the debugger runtime, UI state, and security boundaries.

## Main Risks

1. `SharedArrayBuffer` may require header changes that interact with the
   existing cross-origin iframe design.
2. Function-local variable editing may depend on Pyodide's Python version and
   frame-locals behavior.
3. Safe variable previews must avoid arbitrary user `__repr__` hangs.
4. Debugger layout can become cramped when `stdin`, Output, Debugger, and Notes
   are all expanded.
5. Freezing source edits during debug is simpler and safer, but it must be
   clearly communicated in the UI.

Address risks 1 and 2 before building the full UI. They determine whether the
requested debugger behavior is technically reliable in the current architecture.
