# SPDX-License-Identifier: Apache-2.0
"""
US-020: 定时任务间隔可配置
AC 验收标准测试
"""
from __future__ import annotations

import pytest
from unittest.mock import patch, MagicMock
import importlib


def _reload_and_startup(mock_cfg):
    """Helper to reload app.main and call _startup with mocked deps."""
    with patch("app.main.get_config", return_value=mock_cfg), \
         patch("app.main.init_db"):
        import app.main as main_mod
        # Reset scheduler
        main_mod._scheduler = MagicMock()
        main_mod._startup()
        return main_mod._scheduler


def test_scheduler_uses_config_interval():
    """AC-1: APScheduler uses check_interval_minutes from config."""
    mock_cfg = {
        "notification": {"enabled": True, "check_interval_minutes": 30, "thresholds": [80]},
        "database": {"url": "postgresql://localhost/test"},
    }
    sched = _reload_and_startup(mock_cfg)
    assert sched.add_job.call_count >= 1  # quota_alerts + optional cleanup_notifications
    first_call = sched.add_job.call_args_list[0]
    kwargs = first_call[1] if first_call[1] else {}
    args = first_call[0] if first_call[0] else ()
    # minutes=30 should be in kwargs
    assert kwargs.get("minutes") == 30 or (len(args) > 2 and args[2] == 30)


def test_scheduler_default_interval_60():
    """AC-4: Missing check_interval_minutes defaults to 60."""
    mock_cfg = {
        "notification": {"enabled": True, "thresholds": [80]},
        "database": {"url": "postgresql://localhost/test"},
    }
    sched = _reload_and_startup(mock_cfg)
    assert sched.add_job.call_count >= 1  # quota_alerts + optional cleanup_notifications
    first_call = sched.add_job.call_args_list[0]
    kwargs = first_call[1] if first_call[1] else {}
    assert kwargs.get("minutes") == 60


def test_scheduler_not_started_when_disabled():
    """AC-3: notification.enabled=false means no scheduler job."""
    mock_cfg = {
        "notification": {"enabled": False, "check_interval_minutes": 60},
        "database": {"url": "postgresql://localhost/test"},
    }
    sched = _reload_and_startup(mock_cfg)
    sched.add_job.assert_not_called()
    sched.start.assert_not_called()
