from __future__ import annotations

import json
import socket
import threading
import time
from pathlib import Path
from typing import Any

import pytest

import app.controller as controller


class FakeServer:
    def __init__(
        self,
        release: threading.Event,
        *,
        fail_startup: bool = False,
    ):
        self.release = release
        self.fail_startup = fail_startup
        self.started = False
        self.should_exit = False
        self.received_sockets: list[socket.socket] | None = None
        self.received_addresses: list[tuple[str, int]] = []

    def run(self, sockets: list[socket.socket] | None = None) -> None:
        self.received_sockets = sockets
        self.received_addresses = [
            (str(sock.getsockname()[0]), int(sock.getsockname()[1]))
            for sock in sockets or []
        ]
        if self.fail_startup:
            return
        self.started = True
        while not self.release.is_set() and not self.should_exit:
            time.sleep(0.001)


def test_bind_loopback_socket_reserves_distinct_port() -> None:
    first = controller.bind_loopback_socket()
    second = controller.bind_loopback_socket()
    try:
        first_address = first.getsockname()
        second_address = second.getsockname()
        assert first_address[0] == "127.0.0.1"
        assert second_address[0] == "127.0.0.1"
        assert first_address[1] != second_address[1]

        contender = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            with pytest.raises(OSError):
                contender.bind(first_address)
        finally:
            contender.close()
    finally:
        first.close()
        second.close()


def test_run_hands_prebound_sockets_to_servers_before_publication(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    release = threading.Event()
    api_server = FakeServer(release)
    execution_server = FakeServer(release)
    browser_observation: dict[str, Any] = {}
    monkeypatch.setenv("CODEBRO_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("CODEBRO_NO_BROWSER", raising=False)
    monkeypatch.setattr(
        controller,
        "build_servers",
        lambda settings, app_port, execution_port: (
            api_server,
            execution_server,
        ),
    )

    def open_browser(origin: str) -> bool:
        runtime_file = tmp_path / "runtime.json"
        browser_observation["origin"] = origin
        browser_observation["runtime"] = json.loads(runtime_file.read_text())
        browser_observation["both_started"] = (
            api_server.started and execution_server.started
        )
        release.set()
        return True

    monkeypatch.setattr(controller.webbrowser, "open", open_browser)

    result = controller.run()

    assert result == 1
    assert api_server.received_sockets is not None
    assert execution_server.received_sockets is not None
    assert len(api_server.received_sockets) == 1
    assert len(execution_server.received_sockets) == 1
    assert (
        api_server.received_addresses[0][1]
        != execution_server.received_addresses[0][1]
    )
    assert browser_observation["both_started"] is True
    assert browser_observation["runtime"] == {
        "app_origin": browser_observation["origin"]
    }
    assert not (tmp_path / "runtime.json").exists()


def test_startup_failure_does_not_publish_or_open_browser(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    release = threading.Event()
    api_server = FakeServer(release)
    execution_server = FakeServer(release, fail_startup=True)
    opened: list[str] = []
    monkeypatch.setenv("CODEBRO_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("CODEBRO_NO_BROWSER", raising=False)
    monkeypatch.setattr(
        controller,
        "build_servers",
        lambda settings, app_port, execution_port: (
            api_server,
            execution_server,
        ),
    )
    monkeypatch.setattr(
        controller.webbrowser,
        "open",
        lambda origin: opened.append(origin),
    )

    result = controller.run()
    release.set()

    assert result == 1
    assert opened == []
    assert not (tmp_path / "runtime.json").exists()
