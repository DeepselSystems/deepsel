"""Thread-safe build status tracking for theme rebuilds."""

import threading
import time

_lock = threading.Lock()
_state = {
    "status": "idle",
    "started_at": None,
    "finished_at": None,
    "error": None,
    "theme": None,
}


def get_build_status() -> dict:
    with _lock:
        return dict(_state)


def set_building(theme: str):
    with _lock:
        _state.update(
            status="building",
            started_at=time.time(),
            finished_at=None,
            error=None,
            theme=theme,
        )


def set_idle():
    with _lock:
        _state.update(status="idle", finished_at=time.time(), error=None)


def set_error(error: str):
    with _lock:
        _state.update(status="error", finished_at=time.time(), error=error)
