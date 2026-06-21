from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.execution_server import create_execution_app


def test_pyodide_assets_must_exist_and_be_regular_files(tmp_path: Path) -> None:
    execution_dist = tmp_path / "execution"
    execution_dist.mkdir()
    pyodide_dir = tmp_path / "pyodide"
    pyodide_dir.mkdir()
    (pyodide_dir / "pyodide.js").write_text("globalThis.loadPyodide = true;")
    (pyodide_dir / "package").mkdir()
    settings = Settings(
        database_path=tmp_path / "codebro.sqlite3",
        api_token="test-token",
        app_origin="http://127.0.0.1:8765",
        execution_origin="http://testserver",
        frontend_dist=None,
        execution_dist=execution_dist,
        pyodide_dir=pyodide_dir,
    )

    with TestClient(create_execution_app(settings)) as client:
        present = client.get("/pyodide/pyodide.js")
        missing = client.get("/pyodide/missing.js")
        directory = client.get("/pyodide/package")

    assert present.status_code == 200
    assert present.text == "globalThis.loadPyodide = true;"
    for response in (missing, directory):
        assert response.status_code == 404
        assert response.json() == {"error": "not_found"}
