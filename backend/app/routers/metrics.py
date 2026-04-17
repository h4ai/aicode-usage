# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""Metrics summary router — GET /api/metrics/summary."""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.deps import get_current_user
from app.services.clickhouse import (
    get_daily_request_count,
    get_monthly_active_days,
    get_monthly_request_count,
    get_monthly_token_usage,
    get_today_token_usage,
)

router = APIRouter(prefix="/api/metrics")


class Scope(str, Enum):
    month = "month"
    today = "today"


class MetricsSummaryResponse(BaseModel):
    total_token: int
    request_count: int
    active_days: Optional[int] = None
    daily_avg_token: Optional[int] = None


@router.get("/summary", response_model=MetricsSummaryResponse)
def metrics_summary(
    scope: Scope = Query(Scope.month),
    user: dict[str, Any] = Depends(get_current_user),
) -> MetricsSummaryResponse:
    user_id: str = user.get("userId") or user.get("sub", "")

    if scope == Scope.today:
        return MetricsSummaryResponse(
            total_token=get_today_token_usage(user_id),
            request_count=get_daily_request_count(user_id),
        )

    # month scope
    monthly_token = get_monthly_token_usage(user_id)
    active_days = get_monthly_active_days(user_id)
    daily_avg = monthly_token // active_days if active_days else 0

    return MetricsSummaryResponse(
        total_token=monthly_token,
        request_count=get_monthly_request_count(user_id),
        active_days=active_days,
        daily_avg_token=daily_avg,
    )
