# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""Quota usage router — GET /api/quota/usage."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.deps import get_current_user
from app.services.clickhouse import (
    get_chat_session_count,
    get_daily_request_count,
    get_monthly_token_usage,
)
from app.services.database import get_quota_limits, get_user

router = APIRouter(prefix="/api/quota")


class QuotaBar(BaseModel):
    used: int
    limit: int
    percent: float
    color: str
    message: str


class QuotaUsageResponse(BaseModel):
    monthly_token: QuotaBar
    daily_chats: QuotaBar
    daily_requests: QuotaBar


def _monthly_color(pct: float) -> tuple[str, str]:
    if pct >= 100:
        return "red", "已超出月度限额，请联系管理员"
    if pct >= 80:
        return "orange", f"已使用 {pct:.0f}%，即将达到上限"
    if pct >= 50:
        return "yellow", f"已使用 {pct:.0f}%，请注意控制用量"
    return "green", "使用正常"


def _daily_color(pct: float) -> tuple[str, str]:
    if pct >= 100:
        return "red", "今日请求次数已超出限额"
    if pct >= 80:
        return "orange", "今日请求次数即将达到上限"
    return "green", "今日使用正常"


def _chat_color(pct: float) -> tuple[str, str]:
    if pct >= 100:
        return "red", "今日对话轮次已超出限额"
    if pct >= 80:
        return "orange", f"今日对话轮次已使用 {pct:.0f}%，即将达到上限"
    return "green", "今日对话使用正常"


@router.get("/usage", response_model=QuotaUsageResponse)
def quota_usage(
    user_id: Optional[str] = Query(None),
    user: dict[str, Any] = Depends(get_current_user),
) -> QuotaUsageResponse:
    effective_user_id: str = user_id if (user.get("role") == "admin" and user_id) else user.get("sub", "")

    # Get user's quota level from PostgreSQL
    db_user = get_user(effective_user_id)
    level = db_user["quota_level"] if db_user else "L1"
    limits = get_quota_limits(level)

    monthly_limit = int(limits["monthly_token"])
    chats_limit = int(limits.get("daily_chats", 0))
    daily_limit = int(limits["daily_requests"])

    # Query ClickHouse for current usage
    monthly_used = get_monthly_token_usage(effective_user_id)
    chats_used = get_chat_session_count(effective_user_id, "today")
    daily_used = get_daily_request_count(effective_user_id)

    monthly_pct = (monthly_used / monthly_limit * 100) if monthly_limit else 0
    chats_pct = (chats_used / chats_limit * 100) if chats_limit else 0
    daily_pct = (daily_used / daily_limit * 100) if daily_limit else 0

    m_color, m_msg = _monthly_color(monthly_pct)
    c_color, c_msg = _chat_color(chats_pct)
    d_color, d_msg = _daily_color(daily_pct)

    return QuotaUsageResponse(
        monthly_token=QuotaBar(
            used=monthly_used,
            limit=monthly_limit,
            percent=round(monthly_pct, 1),
            color=m_color,
            message=m_msg,
        ),
        daily_chats=QuotaBar(
            used=chats_used,
            limit=chats_limit,
            percent=round(chats_pct, 1),
            color=c_color,
            message=c_msg,
        ),
        daily_requests=QuotaBar(
            used=daily_used,
            limit=daily_limit,
            percent=round(daily_pct, 1),
            color=d_color,
            message=d_msg,
        ),
    )
