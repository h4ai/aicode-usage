# SPDX-License-Identifier: Apache-2.0
"""
US-022: 通知设置前端页面
AC 验收标准测试（文件结构+内容检查）
"""
from __future__ import annotations

import os

_FRONTEND_ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")


def _read_file(rel_path: str) -> str:
    path = os.path.join(_FRONTEND_ROOT, rel_path)
    with open(path) as f:
        return f.read()


def test_ac1_notification_settings_tab_in_admin():
    """AC-1: AdminView has '通知设置' tab, admin only."""
    content = _read_file("src/views/AdminView.vue")
    assert "通知设置" in content
    assert "NotificationSettings" in content


def test_ac2_page_has_notification_switch():
    """AC-2: Page has notification switch."""
    content = _read_file("src/views/admin/NotificationSettings.vue")
    assert "el-switch" in content
    assert "enabled" in content


def test_ac2_page_has_interval_select():
    """AC-2: Page has interval select (30/60/120)."""
    content = _read_file("src/views/admin/NotificationSettings.vue")
    assert "el-select" in content
    assert "30" in content
    assert "60" in content
    assert "120" in content


def test_ac2_page_has_threshold_inputs():
    """AC-2: Page has 3 threshold inputs."""
    content = _read_file("src/views/admin/NotificationSettings.vue")
    assert "thresholds" in content
    assert "el-input-number" in content


def test_ac2_page_has_email_domain():
    """AC-2: Page has email domain input."""
    content = _read_file("src/views/admin/NotificationSettings.vue")
    assert "emailDomain" in content


def test_ac3_template_editor():
    """AC-3: Template editor with subject + body."""
    content = _read_file("src/views/admin/NotificationSettings.vue")
    assert "subject" in content
    assert "bodyHtml" in content or "body_html" in content


def test_ac4_preview_button():
    """AC-4: Preview button calls POST preview."""
    content = _read_file("src/views/admin/NotificationSettings.vue")
    assert "handlePreview" in content
    assert "/admin/email-template/preview" in content


def test_ac5_save_button():
    """AC-5: Save button calls PUT."""
    content = _read_file("src/views/admin/NotificationSettings.vue")
    assert "handleSave" in content
    assert "PUT" in content or "put" in content


def test_ac6_reset_button():
    """AC-6: Reset button restores default."""
    content = _read_file("src/views/admin/NotificationSettings.vue")
    assert "handleReset" in content
    assert "重置" in content


def test_ac7_el_message_feedback():
    """AC-7: ElMessage used for success/failure feedback."""
    content = _read_file("src/views/admin/NotificationSettings.vue")
    assert "ElMessage" in content
    assert "success" in content
    assert "error" in content
