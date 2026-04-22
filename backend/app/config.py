# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""Application configuration loaded from config.yaml with hot-reload support."""

from __future__ import annotations

import fcntl
import logging
import threading
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yaml"
_lock = threading.Lock()
_config: dict[str, Any] = {}


def _flock_write(f: Any, data: dict[str, Any], **kwargs: Any) -> None:
    """Write YAML to file with fcntl file-level exclusive lock."""
    try:
        fcntl.flock(f, fcntl.LOCK_EX)
    except (OSError, ValueError, TypeError):
        pass  # non-real fd (e.g. tests with mock/StringIO)
    yaml.dump(data, f, allow_unicode=True, default_flow_style=False, **kwargs)
    try:
        f.flush()
    except Exception:
        pass
    try:
        fcntl.flock(f, fcntl.LOCK_UN)
    except (OSError, ValueError, TypeError):
        pass


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


def update_notification_config(
    *,
    enabled: bool | None = None,
    check_interval_minutes: int | None = None,
    thresholds: list[int] | None = None,
    email_domain: str | None = None,
) -> dict[str, Any]:
    """Patch the notification section in config.yaml and reload in-memory config.

    Only provided (non-None) fields are updated. Changes persist on disk;
    interval/enabled changes require a manual service restart to take effect.
    """
    global _config
    with _lock:
        cfg = _load()
        notif = cfg.setdefault("notification", {})
        if enabled is not None:
            notif["enabled"] = enabled
        if check_interval_minutes is not None:
            notif["check_interval_minutes"] = check_interval_minutes
        if thresholds is not None:
            notif["thresholds"] = thresholds
        if email_domain is not None:
            notif["email_domain"] = email_domain
        cfg["notification"] = notif
        with open(_CONFIG_PATH, "w") as f:
            _flock_write(f, cfg)
        _config.clear()
        _config.update(cfg)
        logger.info("Notification config updated: %s", notif)
    return dict(cfg.get("notification", {}))
