from __future__ import annotations

import base64
import hashlib
import json
import sqlite3
import unicodedata
import uuid
from datetime import UTC, datetime
from typing import Any

from .database import Database, code_preview


class RepositoryError(Exception):
    code = "repository_error"
    status_code = 500

    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class NotFoundError(RepositoryError):
    code = "session_not_found"
    status_code = 404


class ConflictError(RepositoryError):
    code = "revision_conflict"
    status_code = 409


class MutationReuseError(RepositoryError):
    code = "mutation_id_reused"
    status_code = 422


class DeletedSessionMutationError(RepositoryError):
    code = "session_deleted"
    status_code = 410


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def normalize_name(name: str) -> tuple[str, str]:
    normalized = unicodedata.normalize("NFKC", name.strip())
    if not normalized:
        normalized = "Untitled Session"
    if len(normalized) > 120:
        raise ValueError("Session name must be 120 characters or fewer")
    return normalized, normalized.casefold()


def normalize_tags(tags: list[str]) -> tuple[list[str], str]:
    normalized_tags: list[str] = []
    seen: set[str] = set()
    for value in tags:
        normalized = unicodedata.normalize("NFKC", value.strip())
        if not normalized:
            continue
        if len(normalized) > 32:
            raise ValueError("Tags must be 32 characters or fewer")
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        normalized_tags.append(normalized)
    if len(normalized_tags) > 10:
        raise ValueError("A session can have at most 10 tags")
    return normalized_tags, "\n".join(tag.casefold() for tag in normalized_tags)


def row_tags(row: sqlite3.Row) -> list[str]:
    try:
        value = json.loads(row["tags_json"])
    except (json.JSONDecodeError, TypeError):
        return []
    return [str(tag) for tag in value] if isinstance(value, list) else []


def canonical_hash(operation: str, payload: dict[str, Any]) -> str:
    body = json.dumps(
        {"operation": operation, **payload},
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


SESSION_SORTS = {
    "updated_desc": ("updated_at", "DESC", "<"),
    "updated_asc": ("updated_at", "ASC", ">"),
    "created_desc": ("created_at", "DESC", "<"),
    "name_asc": ("name_search", "ASC", ">"),
}


def encode_cursor(sort: str, sort_value: str, session_id: str) -> str:
    raw = json.dumps(
        [sort, sort_value, session_id],
        separators=(",", ":"),
    ).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str, expected_sort: str) -> tuple[str, str]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        value = json.loads(base64.urlsafe_b64decode(padded).decode())
        if (
            not isinstance(value, list)
            or len(value) != 3
            or value[0] != expected_sort
        ):
            raise ValueError
        return str(value[1]), str(value[2])
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ValueError("Invalid cursor") from error


def row_to_session(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "code": row["code"],
        "tags": row_tags(row),
        "revision": row["revision"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


class SessionRepository:
    def __init__(self, database: Database):
        self.database = database

    def list_sessions(
        self,
        query: str,
        limit: int,
        cursor: str | None,
        *,
        sort: str = "updated_desc",
        updated_after: str | None = None,
    ) -> tuple[list[dict[str, Any]], str | None]:
        if sort not in SESSION_SORTS:
            raise ValueError("Invalid session sort")
        sort_column, sort_direction, cursor_operator = SESSION_SORTS[sort]
        normalized_query = unicodedata.normalize("NFKC", query.strip()).casefold()
        params: list[Any] = []
        where = ["deleted_at IS NULL"]
        if normalized_query:
            where.append(
                "(name_search LIKE ? ESCAPE '\\' "
                "OR tags_search LIKE ? ESCAPE '\\')"
            )
            escaped = (
                normalized_query.replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_")
            )
            params.extend([f"%{escaped}%", f"%{escaped}%"])
        if updated_after:
            where.append("updated_at >= ?")
            params.append(updated_after)
        if cursor:
            sort_value, session_id = decode_cursor(cursor, sort)
            where.append(
                f"({sort_column} {cursor_operator} ? "
                f"OR ({sort_column} = ? AND id > ?))"
            )
            params.extend([sort_value, sort_value, session_id])
        params.append(limit + 1)
        sql = f"""
            SELECT id, name, name_search, code_preview, tags_json, revision,
                   created_at, updated_at
            FROM sessions
            WHERE {' AND '.join(where)}
            ORDER BY {sort_column} {sort_direction}, id ASC
            LIMIT ?
        """
        with self.database.connect() as connection:
            rows = connection.execute(sql, params).fetchall()
        has_more = len(rows) > limit
        rows = rows[:limit]
        items = [
            {
                "id": row["id"],
                "name": row["name"],
                "code_preview": row["code_preview"],
                "tags": row_tags(row),
                "revision": row["revision"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
            for row in rows
        ]
        next_cursor = (
            encode_cursor(sort, rows[-1][sort_column], rows[-1]["id"])
            if has_more and rows
            else None
        )
        return items, next_cursor

    def get_session(self, session_id: str) -> dict[str, Any]:
        with self.database.connect() as connection:
            row = connection.execute(
                """
                SELECT id, name, code, tags_json, revision,
                       created_at, updated_at
                FROM sessions
                WHERE id = ? AND deleted_at IS NULL
                """,
                (session_id,),
            ).fetchone()
        if row is None:
            raise NotFoundError("The session does not exist.")
        return row_to_session(row)

    def create_session(
        self,
        name: str,
        code: str,
        mutation_id: str,
        tags: list[str] | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        clean_name, name_search = normalize_name(name)
        clean_tags, tags_search = normalize_tags(tags or [])
        hash_payload: dict[str, Any] = {
            "name": clean_name,
            "code": code,
            "mutation_id": mutation_id,
        }
        if clean_tags:
            hash_payload["tags"] = clean_tags
        request_hash = canonical_hash("create", hash_payload)
        with self.database.transaction() as connection:
            duplicate = self._duplicate_receipt(
                connection, mutation_id, request_hash, "create"
            )
            if duplicate:
                return duplicate
            session_id = str(uuid.uuid4())
            now = utc_now()
            connection.execute(
                """
                INSERT INTO sessions(
                    id, name, name_search, code, code_preview, tags_json,
                    tags_search, revision, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    session_id,
                    clean_name,
                    name_search,
                    code,
                    code_preview(code),
                    json.dumps(clean_tags, ensure_ascii=False),
                    tags_search,
                    now,
                    now,
                ),
            )
            connection.execute(
                """
                INSERT INTO mutations(
                    mutation_id, session_id, operation, request_hash,
                    applied_revision, created_at
                ) VALUES (?, ?, 'create', ?, 1, ?)
                """,
                (mutation_id, session_id, request_hash, now),
            )
            row = self._get_row(connection, session_id, include_deleted=True)
            return row_to_session(row), self._mutation_meta(
                mutation_id, 1, False, False
            )

    def patch_session(
        self,
        session_id: str,
        *,
        name: str | None,
        code: str | None,
        expected_revision: int,
        mutation_id: str,
        tags: list[str] | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        clean_name = name_search = None
        if name is not None:
            clean_name, name_search = normalize_name(name)
        clean_tags = tags_search = None
        if tags is not None:
            clean_tags, tags_search = normalize_tags(tags)
        hash_payload = {
            "session_id": session_id,
            "name": clean_name,
            "code": code,
            "expected_revision": expected_revision,
            "mutation_id": mutation_id,
        }
        if tags is not None:
            hash_payload["tags"] = clean_tags
        request_hash = canonical_hash("patch", hash_payload)
        with self.database.transaction() as connection:
            duplicate = self._duplicate_receipt(
                connection, mutation_id, request_hash, "patch"
            )
            if duplicate:
                return duplicate
            row = self._get_row(connection, session_id)
            if row["revision"] != expected_revision:
                raise ConflictError(
                    "The session was changed by another client.",
                    {"session": row_to_session(row)},
                )
            next_revision = row["revision"] + 1
            next_name = clean_name if clean_name is not None else row["name"]
            next_search = (
                name_search if name_search is not None else row["name_search"]
            )
            next_code = code if code is not None else row["code"]
            next_code_preview = (
                code_preview(code) if code is not None else row["code_preview"]
            )
            next_tags = clean_tags if clean_tags is not None else row_tags(row)
            next_tags_search = (
                tags_search if tags_search is not None else row["tags_search"]
            )
            now = utc_now()
            connection.execute(
                """
                UPDATE sessions
                SET name = ?, name_search = ?, code = ?, code_preview = ?,
                    tags_json = ?, tags_search = ?, revision = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    next_name,
                    next_search,
                    next_code,
                    next_code_preview,
                    json.dumps(next_tags, ensure_ascii=False),
                    next_tags_search,
                    next_revision,
                    now,
                    session_id,
                ),
            )
            connection.execute(
                """
                INSERT INTO mutations(
                    mutation_id, session_id, operation, request_hash,
                    applied_revision, created_at
                ) VALUES (?, ?, 'patch', ?, ?, ?)
                """,
                (mutation_id, session_id, request_hash, next_revision, now),
            )
            updated = self._get_row(connection, session_id)
            return row_to_session(updated), self._mutation_meta(
                mutation_id, next_revision, False, False
            )

    def delete_session(
        self, session_id: str, expected_revision: int, mutation_id: str
    ) -> bool:
        request_hash = canonical_hash(
            "delete",
            {
                "session_id": session_id,
                "expected_revision": expected_revision,
                "mutation_id": mutation_id,
            },
        )
        with self.database.transaction() as connection:
            duplicate = self._duplicate_receipt(
                connection, mutation_id, request_hash, "delete"
            )
            if duplicate:
                return True
            row = self._get_row(connection, session_id)
            if row["revision"] != expected_revision:
                raise ConflictError(
                    "The session was changed by another client.",
                    {"session": row_to_session(row)},
                )
            next_revision = row["revision"] + 1
            now = utc_now()
            connection.execute(
                """
                UPDATE sessions
                SET revision = ?, deleted_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (next_revision, now, now, session_id),
            )
            connection.execute(
                """
                INSERT INTO mutations(
                    mutation_id, session_id, operation, request_hash,
                    applied_revision, created_at
                ) VALUES (?, ?, 'delete', ?, ?, ?)
                """,
                (mutation_id, session_id, request_hash, next_revision, now),
            )
        return True

    def _get_row(
        self,
        connection: sqlite3.Connection,
        session_id: str,
        *,
        include_deleted: bool = False,
    ) -> sqlite3.Row:
        deleted_clause = "" if include_deleted else "AND deleted_at IS NULL"
        row = connection.execute(
            f"""
            SELECT id, name, name_search, code, code_preview, tags_json,
                   tags_search, revision, created_at, updated_at, deleted_at
            FROM sessions
            WHERE id = ? {deleted_clause}
            """,
            (session_id,),
        ).fetchone()
        if row is None:
            raise NotFoundError("The session does not exist.")
        return row

    def _duplicate_receipt(
        self,
        connection: sqlite3.Connection,
        mutation_id: str,
        request_hash: str,
        operation: str,
    ) -> tuple[dict[str, Any], dict[str, Any]] | None:
        receipt = connection.execute(
            """
            SELECT mutation_id, session_id, operation, request_hash,
                   applied_revision
            FROM mutations
            WHERE mutation_id = ?
            """,
            (mutation_id,),
        ).fetchone()
        if receipt is None:
            return None
        if receipt["request_hash"] != request_hash or receipt["operation"] != operation:
            raise MutationReuseError(
                "The mutation ID was already used for another request."
            )
        row = self._get_row(connection, receipt["session_id"], include_deleted=True)
        if row["deleted_at"] is not None and operation != "delete":
            raise DeletedSessionMutationError(
                "The session was deleted after this mutation was applied.",
                {
                    "session_id": receipt["session_id"],
                    "mutation_id": mutation_id,
                    "deleted_revision": row["revision"],
                },
            )
        superseded = row["revision"] > receipt["applied_revision"]
        return row_to_session(row), self._mutation_meta(
            mutation_id,
            receipt["applied_revision"],
            True,
            superseded,
        )

    @staticmethod
    def _mutation_meta(
        mutation_id: str,
        applied_revision: int,
        duplicate: bool,
        superseded: bool,
    ) -> dict[str, Any]:
        return {
            "mutation_id": mutation_id,
            "applied_revision": applied_revision,
            "duplicate": duplicate,
            "superseded": superseded,
        }
