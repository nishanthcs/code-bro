# PyInstaller scaffold for a signed macOS CodeBro application bundle.
import json
from pathlib import Path

from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = collect_all("uvicorn")
backend_root = Path(SPECPATH)
repo_root = backend_root.parent
app_version = json.loads((repo_root / "package.json").read_text())["version"]

a = Analysis(
    [str(backend_root / "codebro_entry.py")],
    pathex=[str(backend_root)],
    binaries=binaries,
    datas=datas + [
        (str(repo_root / "frontend" / "dist"), "frontend/dist"),
        (
            str(repo_root / "frontend" / "dist-execution"),
            "frontend/dist-execution",
        ),
        (str(repo_root / "LICENSE"), "."),
        (str(repo_root / "THIRD_PARTY_NOTICES.md"), "."),
    ],
    hiddenimports=hiddenimports,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="CodeBro",
    console=False,
    target_arch="arm64",
)
collection = COLLECT(
    exe,
    a.binaries,
    a.datas,
    name="CodeBro",
)
app = BUNDLE(
    collection,
    name="CodeBro.app",
    bundle_identifier="local.codebro.app",
    info_plist={
        "CFBundleDisplayName": "CodeBro",
        "CFBundleShortVersionString": app_version,
        "CFBundleVersion": app_version,
        "LSMinimumSystemVersion": "14.0",
        "NSHighResolutionCapable": True,
    },
)
