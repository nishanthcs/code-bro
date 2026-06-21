from __future__ import annotations

import os
import secrets
import sys
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = (
    Path(getattr(sys, "_MEIPASS"))
    if getattr(sys, "frozen", False)
    else Path(__file__).resolve().parents[2]
)
DEFAULT_DATA_DIR = Path.home() / "Library" / "Application Support" / "CodeBro"


@dataclass(frozen=True)
class Settings:
    database_path: Path
    api_token: str
    app_origin: str
    execution_origin: str
    frontend_dist: Path | None
    execution_dist: Path
    pyodide_dir: Path

    @classmethod
    def from_env(cls) -> "Settings":
        data_dir = Path(os.getenv("CODEBRO_DATA_DIR", DEFAULT_DATA_DIR))
        database_path = Path(
            os.getenv("CODEBRO_DATABASE_PATH", data_dir / "codebro.sqlite3")
        )
        frontend_value = os.getenv("CODEBRO_FRONTEND_DIST")
        frontend_dist = Path(frontend_value) if frontend_value else None
        return cls(
            database_path=database_path,
            api_token=os.getenv("CODEBRO_API_TOKEN", "dev-token"),
            app_origin=os.getenv("CODEBRO_APP_ORIGIN", "http://127.0.0.1:5173"),
            execution_origin=os.getenv(
                "CODEBRO_EXECUTION_ORIGIN", "http://127.0.0.1:8766"
            ),
            frontend_dist=frontend_dist,
            execution_dist=Path(
                os.getenv(
                    "CODEBRO_EXECUTION_DIST",
                    REPO_ROOT / "frontend" / "execution",
                )
            ),
            pyodide_dir=Path(
                os.getenv(
                    "CODEBRO_PYODIDE_DIR",
                    REPO_ROOT / "node_modules" / "pyodide",
                )
            ),
        )


def generate_api_token() -> str:
    return secrets.token_urlsafe(32)
