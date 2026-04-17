# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""Application configuration loaded from config.yaml with hot-reload support."""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yaml"
_lock = threading.Lock()
_config: dict[str, Any] = {}


def _load(path: Path | None = None) -> dict[str, Any]:
    p = path or _CONFIG_PATH
    with open(p) as f:
        return yaml.safe_load(f) or {}


def load_config(path: Path | None = None) -> dict[str, Any]:
    """Load (or reload) the YAML config and return a copy."""
    global _config
    with _lock:
        _config = _load(path)
        logger.info("Config (re)loaded from %s", path or _CONFIG_PATH)
    return dict(_config)


def get_config() -> dict[str, Any]:
    """Return the current in-memory config (read-only snapshot)."""
    with _lock:
        if not _config:
            _config.update(_load())
        return dict(_config)
