# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""Metrics router — summary + trend endpoints."""

from __future__ import annotations

import csv
import io
from datetime import date, timedelta
from enum import Enum
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.deps import get_current_user
from app.services.clickhouse import (
    get_chat_session_count,
    get_daily_request_count,
    get_daily_trend,
    get_detail_records,
    get_model_distribution,
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
    chat_count: Optional[int] = None


@router.get("/summary", response_model=MetricsSummaryResponse)
def metrics_summary(
    scope: Scope = Query(Scope.month),
    time_filter: str = Query("all", description="all|work|non_work"),
    user_id: Optional[str] = Query(None, description="Admin can specify any user_id"),
    user: dict[str, Any] = Depends(get_current_user),
) -> MetricsSummaryResponse:
    # Admin可指定user_id；普通用户只能查自己
    effective_user_id: str = user_id if (user.get("role") == "admin" and user_id) else (user.get("sub", ""))

    if scope == Scope.today:
        return MetricsSummaryResponse(
            total_token=get_today_token_usage(effective_user_id, time_filter),
            request_count=get_daily_request_count(effective_user_id, time_filter),
            chat_count=get_chat_session_count(effective_user_id, "today", time_filter),
        )

    # month scope
    monthly_token = get_monthly_token_usage(effective_user_id)
    active_days = get_monthly_active_days(effective_user_id)
    daily_avg = monthly_token // active_days if active_days else 0

    return MetricsSummaryResponse(
        total_token=monthly_token,
        request_count=get_monthly_request_count(effective_user_id),
        active_days=active_days,
        daily_avg_token=daily_avg,
        chat_count=get_chat_session_count(effective_user_id, "month", time_filter),
    )


class TrendItem(BaseModel):
    date: str
    input_token: int
    output_token: int
    total_token: int


@router.get("/trend", response_model=list[TrendItem])
def metrics_trend(
    days: int = Query(7),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    time_filter: str = Query("all", description="all|work|non_work"),
    user_id: Optional[str] = Query(None),
    user: dict[str, Any] = Depends(get_current_user),
) -> list[TrendItem]:
    effective_user_id: str = user_id if (user.get("role") == "admin" and user_id) else user.get("sub", "")

    if start and end:
        start_date = start
        end_date = end
    else:
        today = date.today()
        end_date = today.isoformat()
        start_date = (today - timedelta(days=days - 1)).isoformat()

    rows = get_daily_trend(effective_user_id, start_date, end_date, time_filter)
    return [TrendItem(**row) for row in rows]


class ModelDistributionItem(BaseModel):
    model: str
    total_token: int
    percent: float


@router.get("/model-distribution", response_model=list[ModelDistributionItem])
def metrics_model_distribution(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    days: int = Query(30),
    user_id: Optional[str] = Query(None),
    user: dict[str, Any] = Depends(get_current_user),
) -> list[ModelDistributionItem]:
    effective_user_id: str = user_id if (user.get("role") == "admin" and user_id) else user.get("sub", "")
    start_date, end_date = _resolve_date_range(start, end, days)
    rows = get_model_distribution(effective_user_id, start_date, end_date)
    grand_total = sum(r["total_token"] for r in rows)
    return [
        ModelDistributionItem(
            model=r["model"],
            total_token=r["total_token"],
            percent=round(r["total_token"] / grand_total * 100, 1) if grand_total else 0,
        )
        for r in rows
    ]


class DetailItem(BaseModel):
    date: str
    model: str
    request_count: int
    input_token: int
    output_token: int
    total_token: int


def _resolve_date_range(
    start: str | None,
    end: str | None,
    days: int,
) -> tuple[str, str]:
    """Return (start_date, end_date) strings from query params."""
    if start and end:
        return start, end
    today = date.today()
    return (today - timedelta(days=days - 1)).isoformat(), today.isoformat()


def _validate_export_range(start_date: str, end_date: str) -> None:
    """Raise 400 if the range exceeds 3 months (~92 days)."""
    s = date.fromisoformat(start_date)
    e = date.fromisoformat(end_date)
    if (e - s).days > 92:
        raise HTTPException(
            status_code=400,
            detail="导出时间范围不能超过3个月",
        )


@router.get("/detail", response_model=list[DetailItem])
def metrics_detail(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    days: int = Query(30),
    model: Optional[str] = Query(None),
    ide_type: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query("desc"),
    user_id: Optional[str] = Query(None),
    user: dict[str, Any] = Depends(get_current_user),
) -> list[DetailItem]:
    effective_user_id: str = user_id if (user.get("role") == "admin" and user_id) else user.get("sub", "")
    start_date, end_date = _resolve_date_range(start, end, days)
    rows = get_detail_records(effective_user_id, start_date, end_date, model, ide_type)

    # Client-side sorting
    if sort_by and sort_by in {
        "date", "model", "request_count", "input_token", "output_token", "total_token",
    }:
        reverse = sort_order != "asc"
        rows.sort(key=lambda r: r.get(sort_by, 0), reverse=reverse)

    return [DetailItem(**row) for row in rows]


@router.get("/export.csv")
def metrics_export_csv(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    days: int = Query(30),
    model: Optional[str] = Query(None),
    ide_type: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    user: dict[str, Any] = Depends(get_current_user),
) -> StreamingResponse:
    effective_user_id: str = user_id if (user.get("role") == "admin" and user_id) else user.get("sub", "")
    start_date, end_date = _resolve_date_range(start, end, days)
    _validate_export_range(start_date, end_date)

    rows = get_detail_records(effective_user_id, start_date, end_date, model, ide_type)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["日期", "模型", "请求次数", "输入Token", "输出Token", "总Token"])
    for r in rows:
        writer.writerow([
            r["date"], r["model"], r["request_count"],
            r["input_token"], r["output_token"], r["total_token"],
        ])

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=usage_detail.csv"},
    )
