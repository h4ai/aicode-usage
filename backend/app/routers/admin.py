# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""Admin router — quota level & user management."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.deps import require_admin
from app.services.clickhouse import (
    get_all_users_daily_requests,
    get_all_users_monthly_tokens,
    get_global_trend,
    get_global_trend_by_dept,
    get_global_trend_by_model,
)
from app.services.database import (
    get_all_quota_levels,
    get_all_users,
    update_quota_level,
    update_user_level,
)

router = APIRouter(prefix="/api/admin")


class QuotaLevelItem(BaseModel):
    level: str
    monthly_token: int
    daily_requests: int
    user_count: int


@router.get("/quota-levels", response_model=list[QuotaLevelItem])
def list_quota_levels(
    _user: dict[str, Any] = Depends(require_admin),
) -> list[QuotaLevelItem]:
    rows = get_all_quota_levels()
    return [QuotaLevelItem(**row) for row in rows]


class QuotaLevelUpdate(BaseModel):
    monthly_token: int
    daily_requests: int


@router.put("/quota-levels/{level}", response_model=QuotaLevelItem)
def edit_quota_level(
    level: str,
    body: QuotaLevelUpdate,
    _user: dict[str, Any] = Depends(require_admin),
) -> QuotaLevelItem:
    if level not in ("L1", "L2", "L3"):
        raise HTTPException(status_code=400, detail="仅支持 L1/L2/L3 级别")
    row = update_quota_level(level, body.monthly_token, body.daily_requests)
    if row is None:
        raise HTTPException(status_code=404, detail="级别不存在")
    # Fetch user count separately since UPDATE RETURNING doesn't include it
    all_levels = get_all_quota_levels()
    for lv in all_levels:
        if lv["level"] == level:
            return QuotaLevelItem(**lv)
    return QuotaLevelItem(level=level, monthly_token=body.monthly_token,
                          daily_requests=body.daily_requests, user_count=0)


# ---- User management --------------------------------------------------------


class UserItem(BaseModel):
    user_id: str
    display_name: str
    enterprise: str
    quota_level: str
    monthly_token: int
    daily_requests: int


@router.get("/users", response_model=list[UserItem])
def list_users(
    _user: dict[str, Any] = Depends(require_admin),
) -> list[UserItem]:
    users = get_all_users()
    monthly_tokens = get_all_users_monthly_tokens()
    daily_reqs = get_all_users_daily_requests()
    result: list[UserItem] = []
    for u in users:
        display_name = u.get("nickname") or u.get("username") or u["user_id"]
        result.append(UserItem(
            user_id=u["user_id"],
            display_name=display_name,
            enterprise=u.get("enterprise") or "未知",
            quota_level=u.get("quota_level", "L1"),
            monthly_token=monthly_tokens.get(u["user_id"], 0),
            daily_requests=daily_reqs.get(u["user_id"], 0),
        ))
    return result


class UserLevelUpdate(BaseModel):
    level: str


@router.put("/users/{user_id}/level", response_model=UserItem)
def change_user_level(
    user_id: str,
    body: UserLevelUpdate,
    _user: dict[str, Any] = Depends(require_admin),
) -> UserItem:
    if body.level not in ("L1", "L2", "L3"):
        raise HTTPException(status_code=400, detail="仅支持 L1/L2/L3 级别")
    updated = update_user_level(user_id, body.level)
    if updated is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    monthly_tokens = get_all_users_monthly_tokens()
    daily_reqs = get_all_users_daily_requests()
    display_name = (
        updated.get("nickname") or updated.get("username") or updated["user_id"]
    )
    return UserItem(
        user_id=updated["user_id"],
        display_name=display_name,
        enterprise=updated.get("enterprise") or "未知",
        quota_level=updated["quota_level"],
        monthly_token=monthly_tokens.get(updated["user_id"], 0),
        daily_requests=daily_reqs.get(updated["user_id"], 0),
    )


# ---- Global trend -----------------------------------------------------------

from datetime import date, datetime, timedelta, timezone  # noqa: E402
from typing import Literal  # noqa: E402

from fastapi import Query  # noqa: E402


class TrendItem(BaseModel):
    date: str
    input_token: int
    output_token: int
    total_token: int


class GroupedTrendItem(BaseModel):
    date: str
    group: str
    input_token: int
    output_token: int
    total_token: int


def _default_date_range() -> tuple[str, str]:
    now = datetime.now(tz=timezone.utc).date()
    return (now - timedelta(days=29)).isoformat(), now.isoformat()


@router.get("/trend")
def global_trend(
    start: str | None = Query(None),
    end: str | None = Query(None),
    group_by: str | None = Query(None),
    _user: dict[str, Any] = Depends(require_admin),
) -> list[dict[str, Any]]:
    """Return global daily token trend, optionally grouped by model or department."""
    if not start or not end:
        start, end = _default_date_range()
    if group_by == "model":
        return get_global_trend_by_model(start, end)
    if group_by == "department":
        return get_global_trend_by_dept(start, end)
    return get_global_trend(start, end)
