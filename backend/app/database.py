from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Iterator


SCHEMA_VERSION = 3


class DatabaseMigrationError(RuntimeError):
    pass


class UnsupportedSchemaVersionError(DatabaseMigrationError):
    def __init__(self, database_version: int):
        super().__init__(
            f"Database schema version {database_version} is newer than "
            f"supported version {SCHEMA_VERSION}."
        )
        self.database_version = database_version


def code_preview(code: str) -> str:
    return next(
        (line.strip() for line in code.splitlines() if line.strip()),
        "",
    )[:160]


def _migrate_to_version_1(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_meta (
            version INTEGER NOT NULL
        )
        """
    )
    connection.execute(
        """
        INSERT INTO schema_meta(version)
        SELECT 0
        WHERE NOT EXISTS (SELECT 1 FROM schema_meta)
        """
    )
    connection.execute(
        """
        CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
            name_search TEXT NOT NULL,
            code TEXT NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE mutations (
            mutation_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES sessions(id),
            operation TEXT NOT NULL
                CHECK(operation IN ('create', 'patch', 'delete')),
            request_hash TEXT NOT NULL,
            applied_revision INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE INDEX idx_sessions_updated
        ON sessions(updated_at DESC, id ASC)
        """
    )
    connection.execute(
        """
        CREATE INDEX idx_sessions_name_search
        ON sessions(name_search)
        """
    )
    connection.execute(
        """
        CREATE INDEX idx_mutations_session_created
        ON mutations(session_id, created_at DESC)
        """
    )


def _migrate_to_version_2(connection: sqlite3.Connection) -> None:
    connection.execute(
        "ALTER TABLE sessions ADD COLUMN code_preview TEXT NOT NULL DEFAULT ''"
    )
    rows = connection.execute("SELECT id, code FROM sessions").fetchall()
    connection.executemany(
        "UPDATE sessions SET code_preview = ? WHERE id = ?",
        [(code_preview(row["code"]), row["id"]) for row in rows],
    )


def _migrate_to_version_3(connection: sqlite3.Connection) -> None:
    connection.execute(
        "ALTER TABLE sessions ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'"
    )
    connection.execute(
        "ALTER TABLE sessions ADD COLUMN tags_search TEXT NOT NULL DEFAULT ''"
    )


MIGRATIONS: dict[int, Callable[[sqlite3.Connection], None]] = {
    1: _migrate_to_version_1,
    2: _migrate_to_version_2,
    3: _migrate_to_version_3,
}


class Database:
    def __init__(self, path: Path):
        self.path = path
        self._migration_lock = threading.Lock()

    def connect(self, *, enable_wal: bool = True) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(
            self.path,
            timeout=5,
            isolation_level=None,
            check_same_thread=False,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        if enable_wal:
            connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        connection = self.connect()
        transaction_started = False
        try:
            connection.execute("BEGIN IMMEDIATE")
            transaction_started = True
            yield connection
            connection.execute("COMMIT")
        except Exception:
            if transaction_started and connection.in_transaction:
                connection.execute("ROLLBACK")
            raise
        finally:
            connection.close()

    def migrate(self) -> None:
        with self._migration_lock:
            connection = self.connect(enable_wal=False)
            transaction_started = False
            try:
                version = self._schema_version(connection)
                if version > SCHEMA_VERSION:
                    raise UnsupportedSchemaVersionError(version)
                connection.execute("BEGIN IMMEDIATE")
                transaction_started = True
                version = self._schema_version(connection)
                if version > SCHEMA_VERSION:
                    raise UnsupportedSchemaVersionError(version)
                for target_version in range(version + 1, SCHEMA_VERSION + 1):
                    MIGRATIONS[target_version](connection)
                    connection.execute(
                        "UPDATE schema_meta SET version = ?",
                        (target_version,),
                    )
                connection.execute("COMMIT")
            except Exception:
                if transaction_started and connection.in_transaction:
                    connection.execute("ROLLBACK")
                raise
            finally:
                connection.close()

    @staticmethod
    def _schema_version(connection: sqlite3.Connection) -> int:
        schema_meta_exists = connection.execute(
            """
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table' AND name = 'schema_meta'
            """
        ).fetchone()
        if schema_meta_exists is None:
            return 0
        rows = connection.execute("SELECT version FROM schema_meta").fetchall()
        if len(rows) != 1 or not isinstance(rows[0]["version"], int):
            raise DatabaseMigrationError(
                "The database schema version metadata is invalid."
            )
        version = rows[0]["version"]
        if version < 0:
            raise DatabaseMigrationError(
                "The database schema version metadata is invalid."
            )
        return version
