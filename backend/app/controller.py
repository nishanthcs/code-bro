from __future__ import annotations

import argparse
import fcntl
import json
import os
import socket
import subprocess
import threading
import time
import webbrowser
from pathlib import Path
from typing import TextIO

import uvicorn

from .config import DEFAULT_DATA_DIR, REPO_ROOT, Settings, generate_api_token
from .execution_server import create_execution_app
from .main import create_app


STARTUP_TIMEOUT_SECONDS = 15.0


def bind_loopback_socket() -> socket.socket:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(("127.0.0.1", 0))
    except Exception:
        sock.close()
        raise
    return sock


def data_dir() -> Path:
    return Path(os.getenv("CODEBRO_DATA_DIR", DEFAULT_DATA_DIR))


def open_data_folder() -> None:
    directory = data_dir()
    directory.mkdir(parents=True, exist_ok=True)
    subprocess.run(["open", str(directory)], check=False)


def acquire_instance_lock() -> TextIO | None:
    directory = data_dir()
    directory.mkdir(parents=True, exist_ok=True)
    handle = (directory / "codebro.lock").open("a+")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        return handle
    except BlockingIOError:
        handle.close()
        runtime_file = directory / "runtime.json"
        if runtime_file.exists():
            try:
                origin = json.loads(runtime_file.read_text())["app_origin"]
                webbrowser.open(origin)
            except (OSError, KeyError, json.JSONDecodeError):
                pass
        return None


def build_servers(settings: Settings, app_port: int, execution_port: int):
    api = uvicorn.Server(
        uvicorn.Config(
            create_app(settings),
            host="127.0.0.1",
            port=app_port,
            log_level="warning",
        )
    )
    execution = uvicorn.Server(
        uvicorn.Config(
            create_execution_app(settings),
            host="127.0.0.1",
            port=execution_port,
            log_level="warning",
        )
    )
    return api, execution


def wait_for_startup(
    servers: tuple[uvicorn.Server, uvicorn.Server],
    threads: tuple[threading.Thread, threading.Thread],
    timeout: float = STARTUP_TIMEOUT_SECONDS,
) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if all(server.started for server in servers):
            if all(thread.is_alive() for thread in threads):
                return
            break
        if any(not thread.is_alive() for thread in threads):
            break
        time.sleep(0.01)
    raise RuntimeError("CodeBro servers failed to start.")


def publish_runtime_state(runtime_file: Path, app_origin: str) -> None:
    temporary_file = runtime_file.with_name(
        f".{runtime_file.name}.{os.getpid()}.tmp"
    )
    try:
        with temporary_file.open("w", encoding="utf-8") as handle:
            json.dump({"app_origin": app_origin}, handle)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_file, runtime_file)
    finally:
        temporary_file.unlink(missing_ok=True)


def run() -> int:
    lock_handle = acquire_instance_lock()
    if lock_handle is None:
        return 0

    runtime_file = data_dir() / "runtime.json"
    sockets: tuple[socket.socket, ...] = ()
    servers: tuple[uvicorn.Server, ...] = ()
    threads: tuple[threading.Thread, ...] = ()

    try:
        runtime_file.unlink(missing_ok=True)
        app_socket = bind_loopback_socket()
        try:
            execution_socket = bind_loopback_socket()
        except Exception:
            app_socket.close()
            raise
        sockets = (app_socket, execution_socket)
        app_port = int(app_socket.getsockname()[1])
        execution_port = int(execution_socket.getsockname()[1])
        app_origin = f"http://127.0.0.1:{app_port}"
        execution_origin = f"http://127.0.0.1:{execution_port}"
        os.environ.update(
            {
                "CODEBRO_API_TOKEN": generate_api_token(),
                "CODEBRO_APP_ORIGIN": app_origin,
                "CODEBRO_EXECUTION_ORIGIN": execution_origin,
                "CODEBRO_FRONTEND_DIST": str(REPO_ROOT / "frontend" / "dist"),
                "CODEBRO_EXECUTION_DIST": str(
                    REPO_ROOT / "frontend" / "dist-execution"
                ),
                "CODEBRO_PYODIDE_DIR": str(
                    REPO_ROOT / "frontend" / "dist-execution" / "pyodide"
                ),
            }
        )
        settings = Settings.from_env()
        servers = build_servers(settings, app_port, execution_port)
        threads = (
            threading.Thread(
                target=servers[0].run,
                kwargs={"sockets": [app_socket]},
                daemon=True,
            ),
            threading.Thread(
                target=servers[1].run,
                kwargs={"sockets": [execution_socket]},
                daemon=True,
            ),
        )
        for thread in threads:
            thread.start()
        try:
            wait_for_startup(servers, threads)
        except RuntimeError as error:
            print(error)
            return 1
        publish_runtime_state(runtime_file, app_origin)
        if os.getenv("CODEBRO_NO_BROWSER") != "1":
            webbrowser.open(app_origin)
        print(f"CodeBro is running at {app_origin}")
        print("Press Ctrl+C to quit.")
        while all(thread.is_alive() for thread in threads):
            time.sleep(0.5)
        return 1
    except KeyboardInterrupt:
        return 0
    finally:
        for server in servers:
            server.should_exit = True
        for thread in threads:
            thread.join(timeout=5)
        for sock in sockets:
            sock.close()
        runtime_file.unlink(missing_ok=True)
        fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
        lock_handle.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run CodeBro")
    parser.add_argument(
        "--open-data-folder",
        action="store_true",
        help="Open the CodeBro data folder and exit.",
    )
    args = parser.parse_args()
    if args.open_data_folder:
        open_data_folder()
        raise SystemExit(0)
    raise SystemExit(run())


if __name__ == "__main__":
    main()
