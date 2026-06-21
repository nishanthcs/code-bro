from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_requires_api_token(client: TestClient) -> None:
    response = client.get("/api/v1/health", headers={"X-CodeBro-Token": "wrong"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_token"


def test_application_csp_disallows_framing(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]


def test_settings_returns_resolved_read_only_data_path(client: TestClient) -> None:
    response = client.get("/api/v1/settings")

    assert response.status_code == 200
    assert response.json()["data_path"] == str(
        client.app.state.settings.database_path.resolve()
    )


def test_create_read_patch_and_delete(client: TestClient, create_session) -> None:
    created = create_session(
        name="Warmup",
        code="print(1)\n",
        tags=["Algorithms", "Practice"],
    )
    session = created["session"]
    session_id = session["id"]

    fetched = client.get(f"/api/v1/sessions/{session_id}")
    assert fetched.status_code == 200
    assert fetched.json()["name"] == "Warmup"
    assert fetched.json()["tags"] == ["Algorithms", "Practice"]

    patched = client.patch(
        f"/api/v1/sessions/{session_id}",
        json={
            "name": "Warmup revised",
            "tags": ["Interview"],
            "expected_revision": 1,
            "mutation_id": "patch-1",
        },
    )
    assert patched.status_code == 200
    assert patched.json()["session"]["revision"] == 2
    assert patched.json()["session"]["code"] == "print(1)\n"
    assert patched.json()["session"]["tags"] == ["Interview"]

    deleted = client.request(
        "DELETE",
        f"/api/v1/sessions/{session_id}",
        json={"expected_revision": 2, "mutation_id": "delete-1"},
    )
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/sessions/{session_id}").status_code == 404


def test_duplicate_create_returns_existing_receipt(client: TestClient) -> None:
    payload = {
        "name": "Idempotent",
        "code": "print(1)\n",
        "mutation_id": "create-idempotent",
    }
    first = client.post("/api/v1/sessions", json=payload)
    second = client.post("/api/v1/sessions", json=payload)

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["session"]["id"] == first.json()["session"]["id"]
    assert second.json()["mutation"]["duplicate"] is True


def test_list_search_matches_tags_case_insensitively(
    client: TestClient, create_session
) -> None:
    create_session(
        name="Sorting exercise",
        tags=["Data Structures", "Interview"],
        mutation_id="create-tagged-session",
    )
    create_session(
        name="Unrelated",
        tags=["Scratch"],
        mutation_id="create-unrelated-session",
    )

    response = client.get("/api/v1/sessions", params={"q": "structures"})

    assert response.status_code == 200
    assert [item["name"] for item in response.json()["items"]] == [
        "Sorting exercise"
    ]
    assert response.json()["items"][0]["tags"] == [
        "Data Structures",
        "Interview",
    ]


def test_tags_are_normalized_deduplicated_and_bounded(
    client: TestClient,
) -> None:
    accepted = client.post(
        "/api/v1/sessions",
        json={
            "name": "Tagged",
            "code": "",
            "tags": ["  Python  ", "python", "ＤＰ"],
            "mutation_id": "normalized-tags",
        },
    )

    assert accepted.status_code == 201
    assert accepted.json()["session"]["tags"] == ["Python", "DP"]

    rejected = client.post(
        "/api/v1/sessions",
        json={
            "name": "Too many tags",
            "code": "",
            "tags": [f"tag-{index}" for index in range(11)],
            "mutation_id": "too-many-tags",
        },
    )
    assert rejected.status_code == 422
    assert rejected.json()["error"]["code"] == "validation_error"


def test_rejects_code_larger_than_one_mebibyte_in_utf8(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/v1/sessions",
        json={
            "name": "Too large",
            "code": "🐍" * 300_000,
            "mutation_id": "oversize-code",
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_revision_conflict_includes_server_session(
    client: TestClient, create_session
) -> None:
    session = create_session()["session"]
    response = client.patch(
        f"/api/v1/sessions/{session['id']}",
        json={
            "code": "print(2)\n",
            "expected_revision": 99,
            "mutation_id": "patch-conflict",
        },
    )
    assert response.status_code == 409
    assert response.json()["error"]["details"]["session"]["revision"] == 1


def test_mutation_receipt_survives_later_mutation(
    client: TestClient, create_session
) -> None:
    session = create_session()["session"]
    session_id = session["id"]
    first_payload = {
        "code": "print('first')\n",
        "expected_revision": 1,
        "mutation_id": "patch-first",
    }
    first = client.patch(f"/api/v1/sessions/{session_id}", json=first_payload)
    assert first.status_code == 200
    assert first.json()["session"]["revision"] == 2

    second = client.patch(
        f"/api/v1/sessions/{session_id}",
        json={
            "code": "print('second')\n",
            "expected_revision": 2,
            "mutation_id": "patch-second",
        },
    )
    assert second.status_code == 200
    assert second.json()["session"]["revision"] == 3

    retried = client.patch(
        f"/api/v1/sessions/{session_id}", json=first_payload
    )
    assert retried.status_code == 200
    body = retried.json()
    assert body["session"]["revision"] == 3
    assert body["session"]["code"] == "print('second')\n"
    assert body["mutation"]["duplicate"] is True
    assert body["mutation"]["superseded"] is True
    assert body["mutation"]["applied_revision"] == 2


def test_mutation_id_cannot_be_reused_with_other_content(
    client: TestClient, create_session
) -> None:
    session = create_session()["session"]
    session_id = session["id"]
    client.patch(
        f"/api/v1/sessions/{session_id}",
        json={
            "code": "print(1)\n",
            "expected_revision": 1,
            "mutation_id": "same-id",
        },
    )
    response = client.patch(
        f"/api/v1/sessions/{session_id}",
        json={
            "code": "print(2)\n",
            "expected_revision": 2,
            "mutation_id": "same-id",
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "mutation_id_reused"


def test_duplicate_mutations_return_tombstone_after_soft_delete(
    client: TestClient,
) -> None:
    create_payload = {
        "name": "Deleted",
        "code": "print('created')\n",
        "mutation_id": "create-before-delete",
    }
    created = client.post("/api/v1/sessions", json=create_payload)
    assert created.status_code == 201
    session_id = created.json()["session"]["id"]

    patch_payload = {
        "code": "print('patched')\n",
        "expected_revision": 1,
        "mutation_id": "patch-before-delete",
    }
    patched = client.patch(
        f"/api/v1/sessions/{session_id}", json=patch_payload
    )
    assert patched.status_code == 200

    delete_payload = {
        "expected_revision": 2,
        "mutation_id": "delete-session",
    }
    deleted = client.request(
        "DELETE",
        f"/api/v1/sessions/{session_id}",
        json=delete_payload,
    )
    assert deleted.status_code == 204

    duplicate_create = client.post("/api/v1/sessions", json=create_payload)
    duplicate_patch = client.patch(
        f"/api/v1/sessions/{session_id}", json=patch_payload
    )
    duplicate_delete = client.request(
        "DELETE",
        f"/api/v1/sessions/{session_id}",
        json=delete_payload,
    )

    for response in (duplicate_create, duplicate_patch):
        assert response.status_code == 410
        assert response.json()["error"]["code"] == "session_deleted"
        assert response.json()["error"]["details"]["session_id"] == session_id
    assert duplicate_delete.status_code == 204


def test_mutation_ids_are_bounded_but_accept_client_uuids(
    client: TestClient, create_session
) -> None:
    valid_uuid = str(uuid4())
    accepted = client.post(
        "/api/v1/sessions",
        json={
            "name": "UUID",
            "code": "",
            "mutation_id": valid_uuid,
        },
    )
    assert accepted.status_code == 201
    session = create_session(mutation_id="mutation-validation-session")["session"]

    invalid_requests = [
        client.post(
            "/api/v1/sessions",
            json={"name": "Empty", "code": "", "mutation_id": ""},
        ),
        client.patch(
            f"/api/v1/sessions/{session['id']}",
            json={
                "name": "Whitespace",
                "expected_revision": 1,
                "mutation_id": "has whitespace",
            },
        ),
        client.request(
            "DELETE",
            f"/api/v1/sessions/{session['id']}",
            json={"expected_revision": 1, "mutation_id": "x" * 129},
        ),
    ]

    for response in invalid_requests:
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"


def test_search_is_unicode_normalized_and_case_folded(
    client: TestClient, create_session
) -> None:
    create_session(name="Straße", mutation_id="unicode-create")
    response = client.get("/api/v1/sessions", params={"q": "STRASSE"})
    assert response.status_code == 200
    assert [item["name"] for item in response.json()["items"]] == ["Straße"]


def test_cursor_pagination_is_stable(client: TestClient, create_session) -> None:
    for index in range(3):
        create_session(name=f"Session {index}", mutation_id=f"create-{index + 10}")

    first = client.get("/api/v1/sessions", params={"limit": 2}).json()
    assert len(first["items"]) == 2
    assert first["next_cursor"]

    second = client.get(
        "/api/v1/sessions",
        params={"limit": 2, "cursor": first["next_cursor"]},
    ).json()
    assert len(second["items"]) == 1
    assert set(item["id"] for item in first["items"]).isdisjoint(
        item["id"] for item in second["items"]
    )


def test_session_list_accepts_sort_and_updated_date_filter(
    client: TestClient, create_session
) -> None:
    alpha = create_session(name="Alpha", mutation_id="sort-alpha")["session"]
    bravo = create_session(name="Bravo", mutation_id="sort-bravo")["session"]
    with client.app.state.repository.database.transaction() as connection:
        connection.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            ("2026-06-01T00:00:00.000Z", alpha["id"]),
        )
        connection.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            ("2026-06-20T00:00:00.000Z", bravo["id"]),
        )

    response = client.get(
        "/api/v1/sessions",
        params={
            "sort": "name_asc",
            "updated_after": "2026-06-10T00:00:00.000Z",
        },
    )

    assert response.status_code == 200
    assert [item["name"] for item in response.json()["items"]] == ["Bravo"]


def test_mutations_require_json(client: TestClient) -> None:
    response = client.post(
        "/api/v1/sessions",
        content="not json",
        headers={"Content-Type": "text/plain"},
    )
    assert response.status_code == 415


def test_spa_fallback_rejects_encoded_path_traversal(tmp_path: Path) -> None:
    frontend_dist = tmp_path / "dist"
    frontend_dist.mkdir()
    (frontend_dist / "index.html").write_text("<main>CodeBro</main>")
    (frontend_dist / "inside.txt").write_text("inside")
    (tmp_path / "secret.txt").write_text("outside secret")
    settings = Settings(
        database_path=tmp_path / "codebro.sqlite3",
        api_token="test-token",
        app_origin="http://testserver",
        execution_origin="http://127.0.0.1:8766",
        frontend_dist=frontend_dist,
        execution_dist=tmp_path,
        pyodide_dir=tmp_path,
    )

    with TestClient(create_app(settings)) as spa_client:
        normal_file = spa_client.get("/inside.txt")
        encoded_traversal = spa_client.get("/%2e%2e%2fsecret.txt")

    assert normal_file.status_code == 200
    assert normal_file.text == "inside"
    assert encoded_traversal.status_code == 404
    assert "outside secret" not in encoded_traversal.text


def test_direct_index_receives_runtime_bootstrap(tmp_path: Path) -> None:
    frontend_dist = tmp_path / "dist"
    frontend_dist.mkdir()
    (frontend_dist / "index.html").write_text(
        "<script>"
        "token=__CODEBRO_API_TOKEN__;"
        "origin=__CODEBRO_EXECUTION_ORIGIN__"
        "</script>"
    )
    settings = Settings(
        database_path=tmp_path / "codebro.sqlite3",
        api_token="injected-token",
        app_origin="http://testserver",
        execution_origin="http://127.0.0.1:8766",
        frontend_dist=frontend_dist,
        execution_dist=tmp_path,
        pyodide_dir=tmp_path,
    )

    with TestClient(create_app(settings)) as spa_client:
        direct = spa_client.get("/index.html")
        fallback = spa_client.get("/missing-route")

    for response in (direct, fallback):
        assert response.status_code == 200
        assert "injected-token" in response.text
        assert "http://127.0.0.1:8766" in response.text
        assert "__CODEBRO_" not in response.text


def test_tag_suggestions_returns_all_unique_tags(
    client: TestClient, create_session
) -> None:
    create_session(
        name="Session A",
        tags=["Python", "Data Structures"],
        mutation_id="tag-suggest-a",
    )
    create_session(
        name="Session B",
        tags=["Python", "Algorithms"],
        mutation_id="tag-suggest-b",
    )

    response = client.get("/api/v1/tags/suggestions")
    assert response.status_code == 200
    assert response.json() == ["Algorithms", "Data Structures", "Python"]


def test_tag_suggestions_empty_when_no_sessions(
    client: TestClient,
) -> None:
    response = client.get("/api/v1/tags/suggestions")
    assert response.status_code == 200
    assert response.json() == []


def test_unknown_api_route_returns_json_404_with_spa_enabled(
    tmp_path: Path,
) -> None:
    frontend_dist = tmp_path / "dist"
    frontend_dist.mkdir()
    (frontend_dist / "index.html").write_text("<main>CodeBro SPA</main>")
    settings = Settings(
        database_path=tmp_path / "codebro.sqlite3",
        api_token="test-token",
        app_origin="http://testserver",
        execution_origin="http://127.0.0.1:8766",
        frontend_dist=frontend_dist,
        execution_dist=tmp_path,
        pyodide_dir=tmp_path,
    )

    with TestClient(
        create_app(settings),
        headers={"X-CodeBro-Token": "test-token"},
    ) as spa_client:
        response = spa_client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["error"]["code"] == "api_not_found"
    assert "CodeBro SPA" not in response.text
