# SPDX-License-Identifier: Apache-2.0
"""v1 external API — PAT or JWT authenticated, read-only endpoints."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from app.auth_pat import require_pat_or_jwt
from app.services.clickhouse import (
    get_chat_session_count,
    get_daily_request_count,
    get_detail_records,
    get_monthly_active_days,
    get_monthly_request_count,
    get_monthly_token_usage,
    get_today_token_usage,
    get_weekly_request_count,
    get_weekly_token_usage,
)
from app.services.database import get_quota_limits, get_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["v1"])


def _security_headers(response: Response) -> None:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"


def _effective_user(auth: dict[str, Any]) -> dict[str, Any]:
    """Build a user dict suitable for ClickHouse queries from PAT/JWT auth info."""
    uid = auth.get("sub") or auth.get("user_id", "")
    return {"sam": uid, "cn": uid, "sub": uid, "username": uid}


def _resolve_dates(
    start: str | None, end: str | None, days: int = 30
) -> tuple[str, str]:
    if start and end:
        return start, end
    today = date.today()
    return (today - timedelta(days=days - 1)).isoformat(), today.isoformat()


# ── User endpoints ──────────────────────────────────────────────────────────


@router.get("/usage/summary")
def usage_summary(
    request: Request,
    response: Response,
    scope: str = Query("month", description="month|week|today"),
    time_filter: str = Query("all", description="all|work|non_work"),
    auth: dict[str, Any] = Depends(require_pat_or_jwt),
) -> dict[str, Any]:
    _security_headers(response)
    eu = _effective_user(auth)

    if scope == "today":
        return {
            "total_token": get_today_token_usage(eu, time_filter),
            "request_count": get_daily_request_count(eu, time_filter),
            "chat_count": get_chat_session_count(eu, "today", time_filter),
        }

    if scope == "week":
        wt = get_weekly_token_usage(eu, time_filter)
        return {
            "total_token": wt,
            "request_count": get_weekly_request_count(eu, time_filter),
            "daily_avg_token": wt // 5 if wt else 0,
            "chat_count": get_chat_session_count(eu, "week", time_filter),
        }

    # month
    mt = get_monthly_token_usage(eu, time_filter)
    ad = get_monthly_active_days(eu)
    return {
        "total_token": mt,
        "request_count": get_monthly_request_count(eu, time_filter),
        "active_days": ad,
        "daily_avg_token": mt // ad if ad else 0,
        "chat_count": get_chat_session_count(eu, "month", time_filter),
    }


@router.get("/usage/detail")
def usage_detail(
    request: Request,
    response: Response,
    start: str | None = Query(None),
    end: str | None = Query(None),
    days: int = Query(30),
    model: str | None = Query(None),
    ide_type: str | None = Query(None),
    sort_by: str | None = Query(None),
    sort_order: str = Query("desc"),
    auth: dict[str, Any] = Depends(require_pat_or_jwt),
) -> list[dict[str, Any]]:
    _security_headers(response)
    eu = _effective_user(auth)
    s, e = _resolve_dates(start, end, days)
    rows = get_detail_records(eu, s, e, model, ide_type)

    if sort_by and sort_by in {
        "date", "model", "request_count", "input_token", "output_token", "total_token",
    }:
        rows.sort(key=lambda r: r.get(sort_by, 0), reverse=(sort_order != "asc"))

    return rows


@router.get("/usage/quota")
def usage_quota(
    request: Request,
    response: Response,
    auth: dict[str, Any] = Depends(require_pat_or_jwt),
) -> dict[str, Any]:
    _security_headers(response)
    uid = auth.get("sub") or auth.get("user_id", "")
    eu = _effective_user(auth)

    pg_user = get_user(uid)
    level = pg_user.get("quota_level", "L1") if pg_user else "L1"
    limits = get_quota_limits(level)

    mt = get_monthly_token_usage(eu)
    dr = get_daily_request_count(eu)

    monthly_limit = limits.get("monthly_token", 0)
    daily_limit = limits.get("daily_requests", 0)

    return {
        "quota_level": level,
        "monthly_token_used": mt,
        "monthly_token_limit": monthly_limit,
        "monthly_token_pct": round(mt / monthly_limit * 100, 1) if monthly_limit else 0,
        "daily_requests_used": dr,
        "daily_requests_limit": daily_limit,
        "daily_requests_pct": round(dr / daily_limit * 100, 1) if daily_limit else 0,
    }


# ── Admin endpoints ─────────────────────────────────────────────────────────


def _require_admin(auth: dict[str, Any] = Depends(require_pat_or_jwt)) -> dict[str, Any]:
    if auth.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return auth


@router.get("/admin/leaderboard")
def admin_leaderboard(
    request: Request,
    response: Response,
    start: str | None = Query(None),
    end: str | None = Query(None),
    time_filter: str = Query("all"),
    top: int | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    auth: dict[str, Any] = Depends(_require_admin),
) -> dict[str, Any]:
    _security_headers(response)
    from app.routers.admin import get_leaderboard
    rows = get_leaderboard(top=top, time_filter=time_filter, start=start, end=end)
    total = len(rows)
    offset = (page - 1) * page_size
    return {"total": total, "page": page, "page_size": page_size, "items": rows[offset:offset + page_size]}


@router.get("/admin/users")
def admin_users(
    request: Request,
    response: Response,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    year: int | None = Query(None),
    month: int | None = Query(None),
    auth: dict[str, Any] = Depends(_require_admin),
) -> dict[str, Any]:
    _security_headers(response)
    from app.routers.admin import list_users
    result = list_users(time_filter="all", year=year, month=month, page=page, page_size=page_size, _user=auth)
    return result.model_dump()


@router.get("/admin/department-summary")
def admin_department_summary(
    request: Request,
    response: Response,
    start: str | None = Query(None),
    end: str | None = Query(None),
    time_filter: str = Query("all"),
    group_by: str | None = Query(None),
    auth: dict[str, Any] = Depends(_require_admin),
) -> list[dict[str, Any]]:
    _security_headers(response)
    from app.routers.admin import get_department_summary
    return get_department_summary(time_filter=time_filter, start=start, end=end)
