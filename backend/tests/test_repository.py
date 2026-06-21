from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

import app.database as database_module
from app.database import (
    SCHEMA_VERSION,
    Database,
    UnsupportedSchemaVersionError,
)
from app.repository import (
    SessionRepository,
    canonical_hash,
    normalize_name,
    normalize_tags,
)


def create_version_1_database(path: Path, code: str = "") -> None:
    connection = sqlite3.connect(path)
    connection.executescript(
        """
        CREATE TABLE schema_meta (
            version INTEGER NOT NULL
        );
        INSERT INTO schema_meta(version) VALUES (1);

        CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
            name_search TEXT NOT NULL,
            code TEXT NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        );

        CREATE TABLE mutations (
            mutation_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES sessions(id),
            operation TEXT NOT NULL
                CHECK(operation IN ('create', 'patch', 'delete')),
            request_hash TEXT NOT NULL,
            applied_revision INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE INDEX idx_sessions_updated
            ON sessions(updated_at DESC, id ASC);
        CREATE INDEX idx_sessions_name_search
            ON sessions(name_search);
        CREATE INDEX idx_mutations_session_created
            ON mutations(session_id, created_at DESC);
        """
    )
    if code:
        connection.execute(
            """
            INSERT INTO sessions(
                id, name, name_search, code, revision, created_at, updated_at
            ) VALUES ('session-1', 'Migrated', 'migrated', ?, 1, ?, ?)
            """,
            (code, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
        )
    connection.commit()
    connection.close()


def test_blank_name_becomes_untitled() -> None:
    assert normalize_name("   ")[0] == "Untitled Session"


def test_tags_are_normalized_and_deduplicated() -> None:
    tags, search = normalize_tags(["  Python ", "python", "ＤＰ"])

    assert tags == ["Python", "DP"]
    assert search == "python\ndp"


def test_database_migration_is_idempotent(tmp_path: Path) -> None:
    database = Database(tmp_path / "database.sqlite3")
    database.migrate()
    database.migrate()
    repository = SessionRepository(database)
    items, cursor = repository.list_sessions("", 50, None)
    assert items == []
    assert cursor is None
    with database.connect() as connection:
        version = connection.execute(
            "SELECT version FROM schema_meta"
        ).fetchone()[0]
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(sessions)")
        }
    assert version == SCHEMA_VERSION
    assert "code_preview" in columns
    assert "tags_json" in columns
    assert "tags_search" in columns


def test_migration_backfills_persisted_code_preview(tmp_path: Path) -> None:
    database_path = tmp_path / "database.sqlite3"
    code = "\n   \n  print('migrated')  \n" + ("x" * 200)
    create_version_1_database(database_path, code)

    database = Database(database_path)
    database.migrate()

    with database.connect() as connection:
        row = connection.execute(
            "SELECT code_preview FROM sessions WHERE id = 'session-1'"
        ).fetchone()
        version = connection.execute(
            "SELECT version FROM schema_meta"
        ).fetchone()[0]
    assert row["code_preview"] == "print('migrated')"
    assert version == SCHEMA_VERSION


def test_migrations_roll_back_as_one_transaction(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database_path = tmp_path / "database.sqlite3"
    create_version_1_database(database_path, "print('before')\n")

    def fail_after_schema_change(connection: sqlite3.Connection) -> None:
        connection.execute(
            "ALTER TABLE sessions ADD COLUMN code_preview TEXT NOT NULL DEFAULT ''"
        )
        raise RuntimeError("migration failed")

    monkeypatch.setitem(database_module.MIGRATIONS, 2, fail_after_schema_change)
    with pytest.raises(RuntimeError, match="migration failed"):
        Database(database_path).migrate()

    connection = sqlite3.connect(database_path)
    version = connection.execute("SELECT version FROM schema_meta").fetchone()[0]
    columns = {
        row[1] for row in connection.execute("PRAGMA table_info(sessions)")
    }
    connection.close()
    assert version == 1
    assert "code_preview" not in columns


def test_rejects_newer_schema_without_modifying_it(tmp_path: Path) -> None:
    database_path = tmp_path / "database.sqlite3"
    connection = sqlite3.connect(database_path)
    connection.executescript(
        """
        CREATE TABLE schema_meta (version INTEGER NOT NULL);
        INSERT INTO schema_meta(version) VALUES (999);
        CREATE TABLE future_data (value TEXT NOT NULL);
        INSERT INTO future_data(value) VALUES ('preserve me');
        """
    )
    connection.close()

    with pytest.raises(UnsupportedSchemaVersionError) as error:
        Database(database_path).migrate()

    connection = sqlite3.connect(database_path)
    version = connection.execute("SELECT version FROM schema_meta").fetchone()[0]
    value = connection.execute("SELECT value FROM future_data").fetchone()[0]
    journal_mode = connection.execute("PRAGMA journal_mode").fetchone()[0]
    connection.close()
    assert error.value.database_version == 999
    assert version == 999
    assert value == "preserve me"
    assert journal_mode == "delete"


def test_failed_begin_is_not_masked_by_rollback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FailingBeginConnection:
        in_transaction = True

        def __init__(self) -> None:
            self.statements: list[str] = []
            self.closed = False

        def execute(self, statement: str) -> None:
            self.statements.append(statement)
            if statement == "BEGIN IMMEDIATE":
                raise sqlite3.OperationalError("begin failed")
            if statement == "ROLLBACK":
                raise AssertionError("rollback must not run after failed begin")

        def close(self) -> None:
            self.closed = True

    database = Database(tmp_path / "database.sqlite3")
    connection = FailingBeginConnection()
    monkeypatch.setattr(database, "connect", lambda: connection)

    with pytest.raises(sqlite3.OperationalError, match="begin failed"):
        with database.transaction():
            pass

    assert connection.statements == ["BEGIN IMMEDIATE"]
    assert connection.closed is True


def test_code_preview_is_persisted_and_list_does_not_select_code(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database = Database(tmp_path / "database.sqlite3")
    database.migrate()
    repository = SessionRepository(database)
    session, _ = repository.create_session(
        "Preview", "\n  first line  \nsecond line\n", "create-preview"
    )
    session_id = session["id"]

    repository.patch_session(
        session_id,
        name="Renamed",
        code=None,
        expected_revision=1,
        mutation_id="rename-preview",
    )
    repository.patch_session(
        session_id,
        name=None,
        code="\n" + ("z" * 200),
        expected_revision=2,
        mutation_id="patch-preview",
    )

    statements: list[str] = []
    original_connect = database.connect

    def traced_connect() -> sqlite3.Connection:
        connection = original_connect()
        connection.set_trace_callback(statements.append)
        return connection

    monkeypatch.setattr(database, "connect", traced_connect)
    items, _ = repository.list_sessions("", 50, None)

    assert items[0]["code_preview"] == "z" * 160
    list_select = next(
        statement
        for statement in statements
        if "FROM sessions" in statement and "ORDER BY updated_at" in statement
    )
    selected_columns = list_select.split("FROM sessions", 1)[0]
    assert " code," not in selected_columns
    assert "code_preview" in selected_columns


def test_session_listing_supports_sort_date_filter_and_pagination(
    tmp_path: Path,
) -> None:
    database = Database(tmp_path / "database.sqlite3")
    database.migrate()
    repository = SessionRepository(database)
    sessions = {
        name: repository.create_session(name, "", f"create-{name.lower()}")[0]
        for name in ("Alpha", "Bravo", "Charlie")
    }
    timestamps = {
        "Alpha": ("2026-01-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z"),
        "Bravo": ("2026-02-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
        "Charlie": ("2026-03-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z"),
    }
    with database.transaction() as connection:
        for name, (created_at, updated_at) in timestamps.items():
            connection.execute(
                """
                UPDATE sessions
                SET created_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (created_at, updated_at, sessions[name]["id"]),
            )

    recently_updated, _ = repository.list_sessions(
        "", 50, None, sort="updated_desc"
    )
    oldest_updated, _ = repository.list_sessions(
        "", 50, None, sort="updated_asc"
    )
    newest_created, _ = repository.list_sessions(
        "", 50, None, sort="created_desc"
    )
    filtered, _ = repository.list_sessions(
        "",
        50,
        None,
        sort="name_asc",
        updated_after="2026-02-01T00:00:00.000Z",
    )

    assert [item["name"] for item in recently_updated] == [
        "Alpha",
        "Charlie",
        "Bravo",
    ]
    assert [item["name"] for item in oldest_updated] == [
        "Bravo",
        "Charlie",
        "Alpha",
    ]
    assert [item["name"] for item in newest_created] == [
        "Charlie",
        "Bravo",
        "Alpha",
    ]
    assert [item["name"] for item in filtered] == ["Alpha", "Charlie"]

    first_page, cursor = repository.list_sessions(
        "", 2, None, sort="name_asc"
    )
    second_page, next_cursor = repository.list_sessions(
        "", 2, cursor, sort="name_asc"
    )
    assert [item["name"] for item in first_page] == ["Alpha", "Bravo"]
    assert [item["name"] for item in second_page] == ["Charlie"]
    assert next_cursor is None


def test_session_listing_searches_names_and_tags(tmp_path: Path) -> None:
    database = Database(tmp_path / "database.sqlite3")
    database.migrate()
    repository = SessionRepository(database)
    repository.create_session(
        "Graph traversal",
        "",
        "create-graph",
        ["Algorithms", "Interview Prep"],
    )
    repository.create_session(
        "Scratch pad",
        "",
        "create-scratch",
        ["Notes"],
    )

    by_name, _ = repository.list_sessions("graph", 50, None)
    by_tag, _ = repository.list_sessions("INTERVIEW", 50, None)

    assert [item["name"] for item in by_name] == ["Graph traversal"]
    assert [item["name"] for item in by_tag] == ["Graph traversal"]
    assert by_tag[0]["tags"] == ["Algorithms", "Interview Prep"]


def test_empty_tags_preserve_pre_tag_mutation_hashes(tmp_path: Path) -> None:
    database = Database(tmp_path / "database.sqlite3")
    database.migrate()
    repository = SessionRepository(database)
    session, _ = repository.create_session(
        "Legacy compatible",
        "print(1)\n",
        "legacy-create",
    )
    repository.patch_session(
        session["id"],
        name="Legacy rename",
        code=None,
        expected_revision=1,
        mutation_id="legacy-patch",
    )

    with database.connect() as connection:
        hashes = {
            row["mutation_id"]: row["request_hash"]
            for row in connection.execute(
                """
                SELECT mutation_id, request_hash
                FROM mutations
                WHERE mutation_id IN ('legacy-create', 'legacy-patch')
                """
            )
        }

    assert hashes["legacy-create"] == canonical_hash(
        "create",
        {
            "name": "Legacy compatible",
            "code": "print(1)\n",
            "mutation_id": "legacy-create",
        },
    )
    assert hashes["legacy-patch"] == canonical_hash(
        "patch",
        {
            "session_id": session["id"],
            "name": "Legacy rename",
            "code": None,
            "expected_revision": 1,
            "mutation_id": "legacy-patch",
        },
    )


def test_get_unique_tags_returns_sorted_unique_tags(tmp_path: Path) -> None:
    database = Database(tmp_path / "database.sqlite3")
    database.migrate()
    repository = SessionRepository(database)
    repository.create_session(
        "Session A", "", "create-tags-a", ["Python", "Data Structures"]
    )
    repository.create_session(
        "Session B", "", "create-tags-b", ["Python", "Algorithms"]
    )
    repository.create_session(
        "Session C", "", "create-tags-c", None
    )

    tags = repository.get_unique_tags()
    assert tags == ["Algorithms", "Data Structures", "Python"]


def test_get_unique_tags_empty_when_only_deleted_sessions(
    tmp_path: Path,
) -> None:
    database = Database(tmp_path / "database.sqlite3")
    database.migrate()
    repository = SessionRepository(database)
    session, _ = repository.create_session(
        "Deleted", "", "create-deleted-tags", ["Python"]
    )
    repository.delete_session(
        session["id"], 1, "delete-deleted-tags"
    )

    tags = repository.get_unique_tags()
    assert tags == []


def test_mutation_receipts_are_never_aged_out(tmp_path: Path) -> None:
    database = Database(tmp_path / "database.sqlite3")
    database.migrate()
    repository = SessionRepository(database)
    original, _ = repository.create_session(
        "Original", "print(1)\n", "original-create"
    )
    old_timestamp = "2000-01-01T00:00:00.000Z"
    with database.transaction() as connection:
        connection.execute(
            "UPDATE mutations SET created_at = ? WHERE mutation_id = ?",
            (old_timestamp, "original-create"),
        )
        connection.executemany(
            """
            INSERT INTO mutations(
                mutation_id, session_id, operation, request_hash,
                applied_revision, created_at
            ) VALUES (?, ?, 'patch', ?, 1, ?)
            """,
            [
                (
                    f"historical-{index}",
                    original["id"],
                    f"hash-{index}",
                    old_timestamp,
                )
                for index in range(998)
            ],
        )

    repository.patch_session(
        original["id"],
        name="Current",
        code=None,
        expected_revision=1,
        mutation_id="mutation-1000",
    )
    retried, mutation = repository.create_session(
        "Original", "print(1)\n", "original-create"
    )

    assert retried["id"] == original["id"]
    assert mutation["duplicate"] is True
