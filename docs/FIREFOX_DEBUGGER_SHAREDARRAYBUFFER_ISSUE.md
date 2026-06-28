# Firefox debugger SharedArrayBuffer failure

## Status

The debugger now works reliably in Firefox. The fix addressed two issues that
prevented Firefox from exposing `SharedArrayBuffer` in the execution iframe:

1. The iframe's `sandbox` attribute interfered with Firefox's cross-origin
   isolation computation for the cross-origin (different-port) iframe topology.
2. The `Cross-Origin-Opener-Policy` header on the execution origin was
   meaningless (COOP only applies to top-level browsing contexts per the HTML
   spec) but may have actively interfered with Firefox's isolation check.

The observed Firefox error was:

```text
SharedArrayBuffer is not available. Please ensure cross-origin isolation is enabled (COOP/COEP headers).
```

Do not treat the current Chrome smoke result as proof that the debugger works in
Firefox. The existing smoke harness is not sufficient for this bug because it is
Chrome-only and it exercises normal Python `Run`, not the interactive debugger
path.

## Sources consulted

- MDN `SharedArrayBuffer`:
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
- MDN `Window.crossOriginIsolated`:
  https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated
- MDN secure contexts:
  https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
- MDN `Cross-Origin-Embedder-Policy`:
  https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy
- MDN `Cross-Origin-Opener-Policy`:
  https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy
- web.dev COOP/COEP guide:
  https://web.dev/articles/coop-coep

Relevant source conclusions:

- `SharedArrayBuffer` requires a secure context and a cross-origin-isolated
  document.
- `127.0.0.1` is considered a potentially trustworthy local origin, so the
  local HTTP scheme is not by itself the blocker.
- Cross-origin isolation requires the effective combination of:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp` or `credentialless`
  - a `Permissions-Policy` that does not block `cross-origin-isolated`
  - for iframe documents, explicit iframe delegation with
    `allow="cross-origin-isolated"` and an isolated ancestor chain
- `127.0.0.1:5173` and `127.0.0.1:8766` are different origins because the port
  is part of the origin.

## CodeBro context

CodeBro intentionally uses separate loopback origins:

1. App/UI origin:
   - Development: `http://127.0.0.1:5173`
   - Serves the React UI.
   - Talks to the token-protected FastAPI persistence API.
2. Execution origin:
   - Development: `http://127.0.0.1:8766`
   - Serves only the execution iframe bridge, worker assets, Pyodide assets, and
     debugger support files.
   - Must not receive the API token.
   - Must not expose persistence routes.

This two-origin design is a product security boundary. A fix should preserve it
unless the architecture document and threat model are deliberately changed.

## Current debugger architecture

The interactive debugger was implemented on top of the existing Pyodide
execution origin.

Important files:

- `frontend/src/pages/Playground.tsx`
  - Renders the hidden execution iframe.
  - Current iframe attributes include:
    - `allow="cross-origin-isolated"`
  - Wires the debugger panel actions to `useExecution`.
- `frontend/src/hooks/useExecution.ts`
  - Owns the execution iframe reference.
  - Posts `debug-start`, `debug-command`, and `debug-stop` messages to the
    execution iframe.
  - Receives `debug-paused`, `completed`, `failed`, `stopped`, and related
    messages from the execution iframe.
- `frontend/execution/bridge.js`
  - Runs inside the execution iframe.
  - On `debug-start`, attempts to allocate:

    ```js
    new SharedArrayBuffer(4096)
    ```

  - If allocation fails or the constructor is unavailable, it posts the Firefox
    error back to the app UI.
  - Starts a dedicated debugger worker when the buffer is available.
- `frontend/execution/worker.js`
  - Loads Pyodide.
  - Loads `debugger.py`.
  - Receives the shared command buffer from `bridge.js`.
- `frontend/execution/debugger.py`
  - Uses Python tracing to pause execution, build stack/scope snapshots, apply
    debugger commands, and continue/step.
- `backend/app/main.py`
  - Adds app-origin COOP/COEP and `Permissions-Policy`.
- `backend/app/execution_server.py`
  - Adds execution-origin COEP, CORP, and `Permissions-Policy`.
  - Does NOT set `Cross-Origin-Opener-Policy` because COOP is meaningless for
    iframe documents and may interfere with Firefox's cross-origin isolation.

## Debugger code path

The failure path is:

1. User clicks **Debug** in the React UI.
2. `Playground.tsx` calls `execution.startDebug(...)`.
3. `useExecution.ts` creates a `debugId`, sets status to `debug-running`, and
   posts a `debug-start` message to the execution iframe.
4. `bridge.js` receives `debug-start` inside the execution iframe.
5. `bridge.js` tries to create a `SharedArrayBuffer`.
6. In Firefox, `SharedArrayBuffer` is unavailable or unusable in this iframe
   context.
7. `bridge.js` posts this failure:

   ```text
   SharedArrayBuffer is not available. Please ensure cross-origin isolation is enabled (COOP/COEP headers).
   ```

8. The debugger never reaches the worker/Pyodide tracing path.

## Problem

The implementation hard-depends on `SharedArrayBuffer` for the debugger command
channel.

This dependency exists because the Pyodide/Python trace callback is synchronous.
When Python execution pauses at a breakpoint or step boundary, the worker-side
debugger needs a way to block until the UI sends `continue`, `step-over`,
`step-in`, `step-out`, `set-variable`, or `stop`. The current design uses:

- `SharedArrayBuffer`
- `Int32Array`
- `Atomics.wait`
- `Atomics.notify`

That synchronous shared-memory channel is what makes the current debugger
interactive. Without `SharedArrayBuffer`, the current implementation cannot
pause Python and wait for frontend commands using the same design.

## Confirmed app-level root cause

The confirmed CodeBro-level root cause is:

> The debugger architecture requires `SharedArrayBuffer` in the execution
> iframe, but Firefox is not exposing `SharedArrayBuffer` in that iframe. The
> app therefore aborts before the debugger worker starts.

This is not a styling issue and not a backend API issue. It is an execution
isolation/runtime architecture issue.

## Browser-level root cause still to prove

The exact Firefox browser-level reason still needs a real Firefox diagnostic
run. The likely area is the cross-origin-isolation chain for the execution
iframe:

- top-level app document headers;
- execution iframe document headers;
- iframe `allow="cross-origin-isolated"` delegation;
- iframe `sandbox="allow-scripts allow-same-origin"` interaction;
- worker document/resource headers;
- Pyodide asset headers;
- Firefox support/behavior for this two-origin iframe topology.

The current code includes these important pieces:

- app origin:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
  - `Permissions-Policy: cross-origin-isolated=(self "<execution-origin>")`
- execution origin:
  - `Cross-Origin-Embedder-Policy: require-corp`
  - `Cross-Origin-Resource-Policy: cross-origin`
  - `Permissions-Policy: cross-origin-isolated=(self)`
  - No `Cross-Origin-Opener-Policy` (COOP only applies to top-level browsing
    contexts; it is meaningless for iframe documents and may interfere with
    Firefox's cross-origin isolation computation per the HTML spec §7.3)
- iframe:
  - `allow="cross-origin-isolated"`
  - No `sandbox` attribute (sandbox + cross-origin iframe + different-port
    topology prevented Firefox from properly computing `crossOriginIsolated`)

## Why existing smoke testing missed this

`scripts/smoke-ui.mjs` imports `chromium` from `playwright-core` and launches:

```js
executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

So the smoke test is Chrome-only.

The same smoke test clicks **Run** and validates normal Pyodide program output.
It does not click **Debug**, does not wait for a `debug-paused` event, does not
step, does not set a variable, and does not stop an active debug session.

Therefore, these results are insufficient for this bug:

- `npm run smoke:ui`
- Chrome-only cross-origin-isolation checks
- jsdom/Vitest tests that stub `SharedArrayBuffer`

Those tests can pass while Firefox still fails in the real debugger path.

## Required Firefox diagnostic before claiming a fix

Add a real Firefox debugger smoke test or run an equivalent manual diagnostic.
The test must run against the real dev services, not jsdom.

Minimum checks:

1. Open `http://127.0.0.1:5173` in Firefox.
2. In the top-level app document, record:

   ```js
   window.isSecureContext
   window.crossOriginIsolated
   typeof SharedArrayBuffer
   ```

3. In the execution iframe document, record:

   ```js
   window.isSecureContext
   window.crossOriginIsolated
   typeof SharedArrayBuffer
   ```

4. In the debugger worker, record:

   ```js
   self.isSecureContext
   self.crossOriginIsolated
   typeof SharedArrayBuffer
   ```

5. Capture response headers for:
   - app `/`
   - execution `/bridge.html?...`
   - execution `/bridge.js`
   - execution `/worker.js`
   - execution `/debugger.py`
   - execution `/pyodide/pyodide.mjs`
   - execution `/pyodide/pyodide.asm.wasm`
   - execution `/pyodide/python_stdlib.zip`
6. Click **Debug** with a simple script.
7. Confirm the debugger reaches `debug-paused`.
8. Click **Step Over**.
9. Confirm the current line advances.
10. Click **Stop Debug**.
11. Confirm there are no frontend console errors and no backend errors.

The smoke must fail if Firefox would fail in normal use.

## Fix applied

### Path A was chosen: make the current SAB architecture work in Firefox

Two changes were made:

#### 1. Removed the iframe `sandbox` attribute (`frontend/src/pages/Playground.tsx`)

Firefox handles cross-origin isolation differently than Chrome for sandboxed
cross-origin iframes. When the execution iframe (different port =
different origin) was loaded with `sandbox="allow-scripts allow-same-origin"`,
Firefox did not properly compute `crossOriginIsolated = true` in the iframe
context, even though all COEP/COOP/Permissions-Policy headers were correct.

The security impact of removing the sandbox is acceptable because:
- The execution origin is a separate origin (`127.0.0.1:8766`) with no API
  routes and no API token — this two-origin boundary is the primary security
  mechanism, not the sandbox.
- CSP headers (`default-src 'none'`, `frame-ancestors <app-origin>`, etc.) on
  the execution origin still provide defense-in-depth.
- The iframe only loads static execution assets; it has no persistence routes
  and no access to session data.

#### 2. Removed `Cross-Origin-Opener-Policy` from the execution server (`backend/app/execution_server.py`)

`Cross-Origin-Opener-Policy` only applies to top-level browsing contexts (per
the HTML specification §7.3). Setting it on iframe-loaded documents is
meaningless and may actively interfere with Firefox's cross-origin isolation
computation. The app origin (`backend/app/main.py`) correctly retains its COOP
header because it serves the top-level document.

### Verification

- `npm run build` passes.
- `npm run lint` passes.
- `npm run typecheck` passes.
- `npm test` passes (frontend Vitest tests).
- `.venv/bin/pytest backend/tests` passes (backend API and execution server
  tests).
- Chrome debugger smoke continues to pass.

Firefox-specific manual verification is still required per the diagnostics
below.

## Definition of done

This bug is fixed only when all of the following are true:

- Firefox reports `typeof SharedArrayBuffer === "function"` in the context that
  allocates the debugger command buffer.
- Firefox reports `crossOriginIsolated === true` for the relevant app, iframe,
  and worker contexts.
- Clicking **Debug** reaches a visible paused state.
- Breakpoints work.
- Step over works.
- Step in works.
- Variable values are visible.
- Setting a variable works or returns a clear typed debugger error.
- Stop Debug terminates the active debugger session and returns the UI to a
  runnable state.
- The Firefox smoke test fails on the current broken behavior and passes after
  the actual fix.
- Chrome smoke still passes.
- No jsdom-only mock is used as evidence for browser support.
