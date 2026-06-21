# CodeBro 0.1.0 Release Manifest

Generated: 2026-06-20 21:00 EDT

## Target

- Product: CodeBro
- Platform: macOS 14 or newer, Apple silicon
- Build host: macOS 26.5.1 arm64
- Node pin: 24.16.0
- Python: 3.12.11
- SQLite schema: 2
- Source provenance: local pre-commit working tree; this unsigned development
  build is not an auditable production release.

## Browser verification

- Google Chrome 147.0.7727.56

The full browser smoke passed against both development services and the rebuilt
packaged application in Chrome:

- Create a session.
- Edit Python in CodeMirror.
- Confirm no completion UI appears.
- Toggle comments for a line selection.
- Fold and unfold a Python function.
- Save immediately with `Cmd+S`.
- Close and restore the stdin panel.
- Autosave to SQLite.
- Supply stdin.
- Execute Python with bundled Pyodide.
- Verify stdout.
- Switch from light to dark mode.
- Verify selected editor text remains legible in dark mode.
- Verify proactive API-unavailable and recovered states.
- Navigate back to the searchable session library.

## Primary dependencies

- React 19.2.7
- Vite 8.0.16
- TypeScript 6.0.3
- Pyodide 314.0.0
- FastAPI 0.137.2
- Pydantic 2.13.4
- Uvicorn 0.49.0
- PyInstaller 6.21.0
- Playwright Core 1.61.0

## Verification

- Backend: 28 Pytest tests passed.
- Frontend: 47 Vitest tests passed.
- ESLint: passed.
- TypeScript: passed.
- Production frontend build: passed.
- Pyodide Node smoke: `main.py` returned `42`.
- Packaged application browser smoke: passed.
- npm audit: zero reported vulnerabilities.

## Artifacts

- `release/CodeBro.app`: 46 MiB
- `release/CodeBro.dmg`: 26,009,067 bytes
- DMG SHA-256:
  `f8d53c280b439e31ca67148060982710ff41a95d1486771989d86a6108d5836d`

The generated artifacts are unsigned unless `CODEBRO_SIGNING_IDENTITY` is
provided to `scripts/package-macos.sh`. Set `CODEBRO_NOTARY_PROFILE` to sign,
notarize, and staple both artifacts. This credentialed release step and Safari
verification remain outstanding.

## Bundled Pyodide asset hashes

- `pyodide.mjs`:
  `3abfa8bfc2d1dc9d733f4b0b5c3b35bb469295e455abf13f5c0fac70a1c2e961`
- `pyodide.asm.mjs`:
  `7808c4d7a9fee23a02b0c8b7bbd51b1358e8d41bbe89e5c0ee9c0c4db7b9328f`
- `pyodide.asm.wasm`:
  `4d23bd074cc536a96660c9168e223e3aaf01944096ad829737a9c87fec4b28eb`
- `python_stdlib.zip`:
  `1215cd239a270c13a3ecb1a84c84b7b3241baf7ea7f54615f00d79ff69c82787`
- `pyodide-lock.json`:
  `f545248ab161ead36adf7110a358334974e97b08f40c7219e97077d380f7247b`
