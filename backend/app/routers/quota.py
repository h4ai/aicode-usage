# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""Quota usage router — GET /api/quota/usage."""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.deps import get_current_user
from app.services.clickhouse import (
    get_daily_request_count,
    get_monthly_token_usage,
)
from app.services.clickhouse_user import get_today_token_usage
from app.services.database import get_quota_limits, get_user, upsert_user

router = APIRouter(prefix="/api/quota")

_SHANGHAI_TZ = timezone(timedelta(hours=8))


class QuotaBar(BaseModel):
    used: int
    limit: int
    percent: float
    color: str
    message: str


class QuotaUsageResponse(BaseModel):
    monthly_token: QuotaBar
    daily_token: QuotaBar
    daily_requests: QuotaBar
    is_quota_period: bool = True


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


def _daily_token_color(pct: float) -> tuple[str, str]:
    if pct >= 100:
        return "red", "当日Token已超出限额"
    if pct >= 80:
        return "orange", f"当日Token已使用 {pct:.0f}%，即将达到上限"
    return "green", "当日Token使用正常"


def _is_quota_period() -> bool:
    """Check if current time is within quota enforcement period (workday + work hours)."""
    now = datetime.now(tz=_SHANGHAI_TZ)
    # Monday=0 ... Friday=4
    if now.weekday() > 4:
        return False
    hour_minute = now.hour * 60 + now.minute
    # 09:00-12:00 or 13:00-18:00
    if (540 <= hour_minute < 720) or (780 <= hour_minute < 1080):
        return True
    return False


@router.get("/usage", response_model=QuotaUsageResponse)
def quota_usage(
    user_id: Optional[str] = Query(None),
    user: dict[str, Any] = Depends(get_current_user),
) -> QuotaUsageResponse:
    if user.get("role") == "admin" and user_id:
        effective_user: dict[str, Any] = {"sam": user_id, "cn": user_id, "sub": user_id, "nickname": user_id}
    else:
        effective_user = user  # JWT payload 含 nickname/cn/sam

    # Get user's quota level from PostgreSQL
    uid = effective_user.get("sub", "")
    db_user = get_user(uid)
    if not db_user and uid:
        db_user = upsert_user(user_id=uid)
    level = db_user["quota_level"] if db_user else "L1"
    limits = get_quota_limits(level)

    monthly_limit = int(limits["monthly_token"])
    daily_token_limit = int(limits.get("daily_token_limit", 0))
    daily_limit = int(limits["daily_requests"])

    # Query ClickHouse for current usage
    monthly_used = get_monthly_token_usage(effective_user, time_filter="auto")
    # daily_token uses work-hours filter to match quota enforcement period
    daily_token_used = get_today_token_usage(effective_user, time_filter="work")
    daily_used = get_daily_request_count(effective_user)

    monthly_pct = (monthly_used / monthly_limit * 100) if monthly_limit else 0
    dt_pct = (daily_token_used / daily_token_limit * 100) if daily_token_limit else 0
    daily_pct = (daily_used / daily_limit * 100) if daily_limit else 0

    m_color, m_msg = _monthly_color(monthly_pct)
    dt_color, dt_msg = _daily_token_color(dt_pct)
    d_color, d_msg = _daily_color(daily_pct)

    return QuotaUsageResponse(
        monthly_token=QuotaBar(
            used=monthly_used,
            limit=monthly_limit,
            percent=round(monthly_pct, 1),
            color=m_color,
            message=m_msg,
        ),
        daily_token=QuotaBar(
            used=daily_token_used,
            limit=daily_token_limit,
            percent=round(dt_pct, 1),
            color=dt_color,
            message=dt_msg,
        ),
        daily_requests=QuotaBar(
            used=daily_used,
            limit=daily_limit,
            percent=round(daily_pct, 1),
            color=d_color,
            message=d_msg,
        ),
        is_quota_period=_is_quota_period(),
    )
