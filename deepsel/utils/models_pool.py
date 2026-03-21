from typing import Any

models_pool: dict[str, Any] = {}


def set_models_pool(pool: dict[str, Any]) -> None:
    """Set the global models pool. Call this at app startup after scanning models."""
    models_pool.clear()
    models_pool.update(pool)
