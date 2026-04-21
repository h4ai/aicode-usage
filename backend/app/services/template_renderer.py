# SPDX-License-Identifier: Apache-2.0
"""Email template rendering with placeholder substitution."""

from __future__ import annotations

import re


def render_template(template: str, context: dict[str, str]) -> str:
    """Replace {{placeholder}} with values from context. Unknown placeholders preserved."""
    def replacer(match: re.Match) -> str:
        key = match.group(1)
        return context.get(key, match.group(0))
    return re.sub(r"\{\{(\w+)\}\}", replacer, template)


def build_context(
    *,
    username: str,
    user_id: str,
    quota_type: str,
    used: int,
    limit: int,
    threshold: int,
    period_key: str,
) -> dict[str, str]:
    """Build template context dict from notification parameters."""
    pct = round(used / limit * 100, 1) if limit > 0 else 0

    if quota_type == "monthly_token":
        quota_type_label = "月度Token"
        # period_key = "2026-04"
        parts = period_key.split("-")
        period = f"{parts[0]}年{int(parts[1])}月"
        reset_time = "每月1日重置"
    else:  # daily_chats
        quota_type_label = "日对话轮次"
        # period_key = "2026-04-21"
        parts = period_key.split("-")
        period = f"今日（{int(parts[1])}月{int(parts[2])}日）"
        reset_time = "次日00:00重置"

    return {
        "username": username,
        "user_id": user_id,
        "quota_type_label": quota_type_label,
        "used": f"{used:,}",
        "limit": f"{limit:,}",
        "percent": f"{pct}%",
        "threshold": f"{threshold}%",
        "period": period,
        "reset_time": reset_time,
    }
