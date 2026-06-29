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
from .tag_inference import infer_tags


class _Unset:
    pass


UNSET = _Unset()


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
    result = {
        "id": row["id"],
        "name": row["name"],
        "code": row["code"],
        "tags": row_tags(row),
        "revision": row["revision"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "ref_url": None,
        "notes_markdown": "",
    }
    try:
        result["ref_url"] = row["ref_url"] or None
    except (IndexError, KeyError):
        pass
    try:
        result["notes_markdown"] = row["notes_markdown"] or ""
    except (IndexError, KeyError):
        pass
    return result


class SessionRepository:
    def __init__(self, database: Database):
        self.database = database

    @staticmethod
    def _upsert_ref_url(
        connection: sqlite3.Connection, session_id: str, url: str, now: str
    ) -> None:
        connection.execute(
            """
            INSERT INTO session_reference_urls(session_id, url, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(session_id)
            DO UPDATE SET url = excluded.url, updated_at = excluded.updated_at
            """,
            (session_id, url, now),
        )

    @staticmethod
    def _delete_ref_url(
        connection: sqlite3.Connection, session_id: str
    ) -> None:
        connection.execute(
            "DELETE FROM session_reference_urls WHERE session_id = ?",
            (session_id,),
        )

    @staticmethod
    def _upsert_notes(
        connection: sqlite3.Connection, session_id: str, markdown: str, now: str
    ) -> None:
        connection.execute(
            """
            INSERT INTO session_notes(session_id, markdown, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(session_id)
            DO UPDATE SET markdown = excluded.markdown,
                          updated_at = excluded.updated_at
            """,
            (session_id, markdown, now),
        )

    @staticmethod
    def _delete_notes(
        connection: sqlite3.Connection, session_id: str
    ) -> None:
        connection.execute(
            "DELETE FROM session_notes WHERE session_id = ?",
            (session_id,),
        )

    def list_sessions(
        self,
        query: str,
        limit: int,
        cursor: str | None,
        *,
        sort: str = "updated_desc",
        updated_after: str | None = None,
        updated_before: str | None = None,
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
            where.append("s.updated_at >= ?")
            params.append(updated_after)
        if updated_before:
            where.append("s.updated_at <= ?")
            params.append(updated_before)
        if cursor:
            sort_value, session_id = decode_cursor(cursor, sort)
            where.append(
                f"(s.{sort_column} {cursor_operator} ? "
                f"OR (s.{sort_column} = ? AND s.id > ?))"
            )
            params.extend([sort_value, sort_value, session_id])
        params.append(limit + 1)
        sort_expr = f"s.{sort_column}"
        sql = f"""
            SELECT s.id, s.name, s.name_search, s.code_preview, s.tags_json,
                   s.revision, s.created_at, s.updated_at,
                   r.url AS ref_url
            FROM sessions s
            LEFT JOIN session_reference_urls r ON r.session_id = s.id
            WHERE {' AND '.join(where)}
            ORDER BY {sort_expr} {sort_direction}, s.id ASC
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
                "ref_url": row["ref_url"] or None,
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
                SELECT s.id, s.name, s.code, s.tags_json, s.revision,
                       s.created_at, s.updated_at,
                       r.url AS ref_url, n.markdown AS notes_markdown
                FROM sessions s
                LEFT JOIN session_reference_urls r ON r.session_id = s.id
                LEFT JOIN session_notes n ON n.session_id = s.id
                WHERE s.id = ? AND s.deleted_at IS NULL
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
        ref_url: str | None | _Unset = UNSET,
        notes_markdown: str | None | _Unset = UNSET,
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
        if ref_url is not UNSET:
            hash_payload["ref_url"] = ref_url
        if notes_markdown is not UNSET:
            hash_payload["notes_markdown"] = notes_markdown
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
            if ref_url is not UNSET:
                if ref_url:
                    self._upsert_ref_url(connection, session_id, ref_url, now)
                else:
                    self._delete_ref_url(connection, session_id)
            if notes_markdown is not UNSET:
                if notes_markdown:
                    self._upsert_notes(connection, session_id, notes_markdown, now)
                else:
                    self._delete_notes(connection, session_id)
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
                mutation_id, 1, False, False, []
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
        ref_url: str | None | _Unset = UNSET,
        notes_markdown: str | None | _Unset = UNSET,
        auto_tag_if_empty: bool | _Unset = UNSET,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        clean_name = name_search = None
        if name is not None:
            clean_name, name_search = normalize_name(name)
        clean_tags = tags_search = None
        if tags is not None:
            clean_tags, tags_search = normalize_tags(tags)
        hash_payload: dict[str, Any] = {
            "session_id": session_id,
            "name": clean_name,
            "code": code,
            "expected_revision": expected_revision,
            "mutation_id": mutation_id,
        }
        if tags is not None:
            hash_payload["tags"] = clean_tags
        if ref_url is not UNSET:
            hash_payload["ref_url"] = ref_url
        if notes_markdown is not UNSET:
            hash_payload["notes_markdown"] = notes_markdown
        if auto_tag_if_empty is not UNSET:
            hash_payload["auto_tag_if_empty"] = auto_tag_if_empty
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
            auto_tags_added: list[str] = []
            if auto_tag_if_empty is True and not next_tags and next_code.strip():
                existing = self._collect_existing_tags(connection)
                auto_tags_added, _ = normalize_tags(
                    infer_tags(next_code, existing, max_results=2)
                )
                if auto_tags_added:
                    next_tags = auto_tags_added
                    next_tags_search = "\n".join(
                        tag.casefold() for tag in auto_tags_added
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
            if ref_url is not UNSET:
                if ref_url:
                    self._upsert_ref_url(connection, session_id, ref_url, now)
                else:
                    self._delete_ref_url(connection, session_id)
            if notes_markdown is not UNSET:
                if notes_markdown:
                    self._upsert_notes(connection, session_id, notes_markdown, now)
                else:
                    self._delete_notes(connection, session_id)
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
                mutation_id, next_revision, False, False, auto_tags_added
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
            SELECT s.id, s.name, s.name_search, s.code, s.code_preview,
                   s.tags_json, s.tags_search, s.revision, s.created_at,
                   s.updated_at, s.deleted_at,
                   r.url AS ref_url,
                   n.markdown AS notes_markdown
            FROM sessions s
            LEFT JOIN session_reference_urls r ON r.session_id = s.id
            LEFT JOIN session_notes n ON n.session_id = s.id
            WHERE s.id = ? {deleted_clause}
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
            [],
        )

    def get_unique_tags(self) -> list[str]:
        unique_tags: dict[str, str] = {}  # normalized_tag -> original_spelling
        with self.database.connect() as connection:
            rows = connection.execute(
                """
                SELECT DISTINCT tags_json
                FROM sessions
                WHERE deleted_at IS NULL
                """
            ).fetchall()
            for row in rows:
                tags_json = row["tags_json"]
                if not tags_json:
                    continue
                try:
                    tags = json.loads(tags_json)
                except (json.JSONDecodeError, TypeError):
                    continue
                if not isinstance(tags, list):
                    continue
                for tag in tags:
                    if isinstance(tag, str) and tag.strip():
                        # Use NFKC + casefold() for deduplication while preserving display spelling
                        normalized_tag = unicodedata.normalize("NFKC", tag).casefold()
                        if normalized_tag not in unique_tags:
                            unique_tags[normalized_tag] = tag
        # Return sorted list with original display spelling (using first occurrence)
        return sorted(unique_tags.values(), key=lambda x: x.casefold())

    @staticmethod
    def _collect_existing_tags(
        connection: sqlite3.Connection,
    ) -> list[tuple[str, int]]:
        counts: dict[str, int] = {}
        display: dict[str, str] = {}
        rows = connection.execute(
            """
            SELECT tags_json
            FROM sessions
            WHERE deleted_at IS NULL AND tags_json != '[]'
            """
        ).fetchall()
        spellings: dict[str, dict[str, int]] = {}
        for row in rows:
            try:
                tags = json.loads(row["tags_json"])
            except (json.JSONDecodeError, TypeError):
                continue
            if not isinstance(tags, list):
                continue
            for tag in tags:
                if isinstance(tag, str) and tag.strip():
                    key = unicodedata.normalize("NFKC", tag).casefold()
                    counts[key] = counts.get(key, 0) + 1
                    spelling_counts = spellings.setdefault(key, {})
                    spelling_counts[tag] = spelling_counts.get(tag, 0) + 1
        for key, spelling_counts in spellings.items():
            display[key] = sorted(
                spelling_counts,
                key=lambda spelling: (
                    -spelling_counts[spelling],
                    spelling.casefold(),
                    spelling,
                ),
            )[0]
        return [(display[key], counts[key]) for key in display]

    @staticmethod
    def _mutation_meta(
        mutation_id: str,
        applied_revision: int,
        duplicate: bool,
        superseded: bool,
        auto_tags_added: list[str] | None = None,
    ) -> dict[str, Any]:
        return {
            "mutation_id": mutation_id,
            "applied_revision": applied_revision,
            "duplicate": duplicate,
            "superseded": superseded,
            "auto_tags_added": auto_tags_added or [],
        }
