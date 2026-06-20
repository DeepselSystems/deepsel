"""State management utilities for theme setup."""

import os
import json
import logging

logger = logging.getLogger(__name__)


def load_setup_state(state_path):
    """Load the theme setup state from a JSON file."""
    if not os.path.exists(state_path):
        return {}
    try:
        with open(state_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                return data
    except Exception:
        logger.info("Unable to read theme state file")
    return {}


def save_setup_state(state_path, state):
    """Save the theme setup state to a JSON file."""
    os.makedirs(os.path.dirname(state_path), exist_ok=True)
    with open(state_path, "w", encoding="utf-8") as f:
        json.dump(state, f)
