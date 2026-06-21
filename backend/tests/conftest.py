from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    settings = Settings(
        database_path=tmp_path / "codebro.sqlite3",
        api_token="test-token",
        app_origin="http://testserver",
        execution_origin="http://127.0.0.1:8766",
        frontend_dist=None,
        execution_dist=tmp_path,
        pyodide_dir=tmp_path,
    )
    with TestClient(create_app(settings), headers={"X-CodeBro-Token": "test-token"}) as test_client:
        yield test_client


@pytest.fixture()
def create_session(client: TestClient):
    def create(
        *,
        name: str = "Untitled Session",
        code: str = 'print("Hello")\n',
        tags: list[str] | None = None,
        ref_url: str | None = None,
        notes_markdown: str | None = None,
        mutation_id: str = "create-1",
    ) -> dict:
        payload = {
            "name": name,
            "code": code,
            "tags": tags or [],
            "mutation_id": mutation_id,
        }
        if ref_url is not None:
            payload["ref_url"] = ref_url
        if notes_markdown is not None:
            payload["notes_markdown"] = notes_markdown
        response = client.post(
            "/api/v1/sessions",
            json=payload,
        )
        assert response.status_code == 201
        return response.json()

    return create
