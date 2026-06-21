# CodeBro Release Checklist

- Run backend tests.
- Run frontend tests, type checking, linting, and production build.
- Verify the execution build contains local Pyodide assets.
- Start CodeBro with networking disabled and a clean browser profile.
- Verify all standard-library compatibility imports.
- Verify timeout, stop, output cap, and fresh-worker behavior.
- Verify light and dark themes in current Safari and Chrome.
- Build `CodeBro.app` with `backend/CodeBro.spec`.
- Set `CODEBRO_SIGNING_IDENTITY` and `CODEBRO_NOTARY_PROFILE`.
- Sign, notarize, and staple the application and DMG.
- Verify the bundled `LICENSE` and `THIRD_PARTY_NOTICES.md`.
- Verify `CFBundleShortVersionString` and `CFBundleVersion`.
- Record browser versions, Pyodide version and hashes, schema version, and
  installed/compressed sizes.
