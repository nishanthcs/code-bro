#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYINSTALLER="$ROOT/.venv/bin/pyinstaller"
export PYINSTALLER_CONFIG_DIR="$ROOT/.pyinstaller-cache"
DIST="$ROOT/release"
WORK="$ROOT/build/pyinstaller"
APP="$DIST/CodeBro.app"
DMG="$DIST/CodeBro.dmg"
APP_ZIP="$DIST/CodeBro-notarization.zip"

node "$ROOT/scripts/check-node-version.mjs"

npm --prefix "$ROOT" run build
"$PYINSTALLER" \
  --noconfirm \
  --distpath "$DIST" \
  --workpath "$WORK" \
  "$ROOT/backend/CodeBro.spec"

if [[ -n "${CODEBRO_SIGNING_IDENTITY:-}" ]]; then
  codesign \
    --force \
    --deep \
    --options runtime \
    --timestamp \
    --sign "$CODEBRO_SIGNING_IDENTITY" \
    "$APP"
fi

if [[ -n "${CODEBRO_NOTARY_PROFILE:-}" ]]; then
  if [[ -z "${CODEBRO_SIGNING_IDENTITY:-}" ]]; then
    echo "CODEBRO_NOTARY_PROFILE requires CODEBRO_SIGNING_IDENTITY." >&2
    exit 1
  fi
  rm -f "$APP_ZIP"
  ditto -c -k --keepParent "$APP" "$APP_ZIP"
  xcrun notarytool submit "$APP_ZIP" \
    --keychain-profile "$CODEBRO_NOTARY_PROFILE" \
    --wait
  xcrun stapler staple "$APP"
  rm -f "$APP_ZIP"
fi

hdiutil create \
  -volname CodeBro \
  -srcfolder "$APP" \
  -ov \
  -format UDZO \
  "$DMG"

if [[ -n "${CODEBRO_SIGNING_IDENTITY:-}" ]]; then
  codesign \
    --force \
    --timestamp \
    --sign "$CODEBRO_SIGNING_IDENTITY" \
    "$DMG"
fi

if [[ -n "${CODEBRO_NOTARY_PROFILE:-}" ]]; then
  xcrun notarytool submit "$DMG" \
    --keychain-profile "$CODEBRO_NOTARY_PROFILE" \
    --wait
  xcrun stapler staple "$DMG"
  spctl --assess --type execute --verbose=2 "$APP"
fi

echo "Created $DMG"
