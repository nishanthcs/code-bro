from __future__ import annotations

import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .config import Settings
from .database import Database
from .models import (
    AppSettingsResponse,
    CreateSessionRequest,
    DeleteSessionRequest,
    MutationResponse,
    PatchSessionRequest,
    SessionListResponse,
    SessionResource,
)
from .repository import UNSET, RepositoryError, SessionRepository


def is_api_path(path: str) -> bool:
    return path == "/api" or path.startswith("/api/")


def error_response(
    code: str, message: str, status_code: int, details: dict[str, Any] | None = None
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "details": details or {},
            }
        },
    )


def sanitized_validation_errors(
    error: RequestValidationError,
) -> list[dict[str, Any]]:
    return [
        {
            "type": item.get("type", "validation_error"),
            "loc": list(item.get("loc", [])),
            "msg": item.get("msg", "Invalid value"),
        }
        for item in error.errors()
    ]


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    database = Database(settings.database_path)
    repository = SessionRepository(database)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        database.migrate()
        yield

    app = FastAPI(title="CodeBro API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.repository = repository
    @app.middleware("http")
    async def secure_local_api(request: Request, call_next):
        expected_host = urlsplit(settings.app_origin).netloc
        host = request.headers.get("host", "")
        if host != expected_host:
            return error_response("invalid_host", "Invalid Host header.", 400)
        if is_api_path(request.url.path):
            if request.headers.get("x-codebro-token") != settings.api_token:
                return error_response("invalid_token", "Invalid API token.", 401)
            if request.method in {"POST", "PATCH", "DELETE"}:
                media_type = request.headers.get("content-type", "").split(";")[0]
                if media_type != "application/json":
                    return error_response(
                        "json_required", "Mutations require application/json.", 415
                    )
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Embedder-Policy"] = "require-corp"
        response.headers["Permissions-Policy"] = (
            f'cross-origin-isolated=(self "{settings.execution_origin}")'
        )
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "font-src 'self'; "
            f"frame-src {settings.execution_origin}; "
            "connect-src 'self'; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "frame-ancestors 'none'"
        )
        return response

    @app.exception_handler(RepositoryError)
    async def repository_exception(_: Request, error: RepositoryError):
        return error_response(
            error.code, error.message, error.status_code, error.details
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception(_: Request, error: RequestValidationError):
        return error_response(
            "validation_error",
            "The request was invalid.",
            422,
            {"errors": sanitized_validation_errors(error)},
        )

    @app.exception_handler(404)
    async def not_found_exception(request: Request, _: Exception):
        if is_api_path(request.url.path):
            return error_response(
                "api_not_found", "The API route does not exist.", 404
            )
        return JSONResponse(status_code=404, content={"detail": "Not Found"})

    @app.get("/api/v1/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/v1/settings", response_model=AppSettingsResponse)
    async def app_settings() -> AppSettingsResponse:
        return AppSettingsResponse(data_path=str(settings.database_path.resolve()))

    @app.get("/api/v1/sessions", response_model=SessionListResponse)
    async def list_sessions(
        q: str = "",
        limit: int = Query(default=50, ge=1, le=100),
        cursor: str | None = None,
        sort: str = Query(
            default="updated_desc",
            pattern="^(updated_desc|updated_asc|created_desc|name_asc)$",
        ),
        updated_after: datetime | None = None,
    ) -> SessionListResponse:
        try:
            normalized_updated_after = None
            if updated_after is not None:
                if updated_after.tzinfo is None:
                    updated_after = updated_after.replace(tzinfo=UTC)
                normalized_updated_after = (
                    updated_after.astimezone(UTC)
                    .isoformat(timespec="milliseconds")
                    .replace("+00:00", "Z")
                )
            items, next_cursor = repository.list_sessions(
                q,
                limit,
                cursor,
                sort=sort,
                updated_after=normalized_updated_after,
            )
        except ValueError as error:
            return error_response("invalid_cursor", str(error), 422)
        return SessionListResponse(items=items, next_cursor=next_cursor)

    @app.post(
        "/api/v1/sessions",
        response_model=MutationResponse,
        status_code=201,
    )
    async def create_session(payload: CreateSessionRequest) -> MutationResponse:
        session, mutation = repository.create_session(
            payload.name,
            payload.code,
            payload.mutation_id,
            payload.tags,
            (
                payload.ref_url
                if "ref_url" in payload.model_fields_set
                else UNSET
            ),
            (
                payload.notes_markdown
                if "notes_markdown" in payload.model_fields_set
                else UNSET
            ),
        )
        response = MutationResponse(session=session, mutation=mutation)
        if mutation["duplicate"]:
            return JSONResponse(status_code=200, content=response.model_dump())
        return response

    @app.get("/api/v1/sessions/{session_id}", response_model=SessionResource)
    async def get_session(session_id: str) -> SessionResource:
        return SessionResource(**repository.get_session(session_id))

    @app.patch(
        "/api/v1/sessions/{session_id}",
        response_model=MutationResponse,
    )
    async def patch_session(
        session_id: str, payload: PatchSessionRequest
    ) -> MutationResponse:
        session, mutation = repository.patch_session(
            session_id,
            name=payload.name,
            code=payload.code,
            tags=payload.tags,
            ref_url=(
                payload.ref_url
                if "ref_url" in payload.model_fields_set
                else UNSET
            ),
            notes_markdown=(
                payload.notes_markdown
                if "notes_markdown" in payload.model_fields_set
                else UNSET
            ),
            auto_tag_if_empty=(
                payload.auto_tag_if_empty
                if "auto_tag_if_empty" in payload.model_fields_set
                else UNSET
            ),
            expected_revision=payload.expected_revision,
            mutation_id=payload.mutation_id,
        )
        return MutationResponse(session=session, mutation=mutation)

    @app.delete("/api/v1/sessions/{session_id}", status_code=204)
    async def delete_session(
        session_id: str, payload: DeleteSessionRequest
    ) -> Response:
        repository.delete_session(
            session_id, payload.expected_revision, payload.mutation_id
        )
        return Response(status_code=204)

    @app.get("/api/v1/tags/suggestions")
    async def get_tag_suggestions() -> list[str]:
        return repository.get_unique_tags()

    if settings.frontend_dist and settings.frontend_dist.exists():
        frontend_root = settings.frontend_dist.resolve()
        index_path = (frontend_root / "index.html").resolve()
        assets = frontend_root / "assets"
        if assets.exists():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        def frontend_index() -> HTMLResponse:
            index = index_path.read_text()
            index = index.replace(
                "__CODEBRO_API_TOKEN__", settings.api_token
            ).replace(
                "__CODEBRO_EXECUTION_ORIGIN__", settings.execution_origin
            )
            return HTMLResponse(index)

        @app.get("/{path:path}", response_class=HTMLResponse)
        async def frontend(path: str):
            if is_api_path(f"/{path}"):
                return error_response(
                    "api_not_found", "The API route does not exist.", 404
                )
            if path:
                try:
                    candidate = (frontend_root / path).resolve()
                except (OSError, RuntimeError):
                    return Response(status_code=404)
                if not candidate.is_relative_to(frontend_root):
                    return Response(status_code=404)
                if candidate == index_path:
                    return frontend_index()
                if candidate.is_file():
                    return FileResponse(candidate)
            return frontend_index()

    return app


app = create_app()
