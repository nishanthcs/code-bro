from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from urllib.parse import urlsplit

from .config import Settings


def create_execution_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(
        title="CodeBro execution origin",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    @app.middleware("http")
    async def execution_security(request: Request, call_next):
        if request.headers.get("host", "") != urlsplit(
            settings.execution_origin
        ).netloc:
            return JSONResponse({"error": "invalid_host"}, status_code=400)
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; "
            "script-src 'self' 'wasm-unsafe-eval'; "
            "worker-src 'self'; "
            "connect-src 'self'; "
            "style-src 'self'; "
            f"frame-ancestors {settings.app_origin}"
        )
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.get("/bridge.html")
    async def bridge_html() -> FileResponse:
        return FileResponse(settings.execution_dist / "bridge.html")

    @app.get("/bridge.js")
    async def bridge_js() -> FileResponse:
        return FileResponse(
            settings.execution_dist / "bridge.js", media_type="text/javascript"
        )

    @app.get("/worker.js")
    async def worker_js() -> FileResponse:
        return FileResponse(
            settings.execution_dist / "worker.js", media_type="text/javascript"
        )

    @app.get("/pyodide/{asset:path}")
    async def pyodide_asset(asset: str) -> FileResponse:
        try:
            pyodide_root = settings.pyodide_dir.resolve()
            safe_path = (pyodide_root / asset).resolve()
            is_asset_file = (
                pyodide_root in safe_path.parents and safe_path.is_file()
            )
        except (OSError, RuntimeError):
            return JSONResponse({"error": "not_found"}, status_code=404)
        if not is_asset_file:
            return JSONResponse({"error": "not_found"}, status_code=404)
        return FileResponse(safe_path)

    return app


app = create_execution_app()
