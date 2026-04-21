# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""Admin router — quota level & user management."""

from __future__ import annotations

import csv
import io
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.deps import require_admin
from app.services.clickhouse import (
    get_all_users_batch,
    get_leaderboard_batch,
    get_all_users_chats_in_range,
    get_all_users_chats_in_month,
    get_all_users_daily_requests,
    get_all_users_from_clickhouse,
    get_all_users_monthly_chats,
    get_all_users_monthly_requests,
    get_all_users_monthly_tokens,
    get_all_users_requests_in_range,
    get_all_users_requests_in_month,
    get_all_users_today_chats,
    get_all_users_today_tokens,
    get_all_users_tokens_in_range,
    get_all_users_tokens_in_month,
    get_global_trend,
    get_global_trend_by_dept,
    get_global_trend_by_model,
)
from app.services.database import (
    get_all_quota_levels,
    get_all_users,
    get_quota_limits,
    update_quota_level,
    update_user_level,
)

router = APIRouter(prefix="/api/admin")


class QuotaLevelItem(BaseModel):
    level: str
    monthly_token: int
    daily_chats: int
    daily_requests: int
    user_count: int


@router.get("/quota-levels", response_model=list[QuotaLevelItem])
def list_quota_levels(
    _user: dict[str, Any] = Depends(require_admin),
) -> list[QuotaLevelItem]:
    rows = get_all_quota_levels()
    # user_count 只统计了 PG 里已登录的用户，需补齐 CH 里有数据但不在 PG 的（默认 L1）
    ch_users = get_all_users_from_clickhouse()
    pg_users = get_all_users()
    pg_ids = {u["user_id"] for u in pg_users}
    # CH 里有但 PG 里没有的用户 → 默认 L1
    ch_only_count = sum(1 for u in ch_users if u["username"] not in pg_ids)
    result = []
    for row in rows:
        d = dict(row)
        if d["level"] == "L1":
            d["user_count"] = d["user_count"] + ch_only_count
        result.append(QuotaLevelItem(**d))
    return result


class QuotaLevelUpdate(BaseModel):
    monthly_token: int
    daily_chats: int
    daily_requests: int


@router.put("/quota-levels/{level}", response_model=QuotaLevelItem)
def edit_quota_level(
    level: str,
    body: QuotaLevelUpdate,
    _user: dict[str, Any] = Depends(require_admin),
) -> QuotaLevelItem:
    if level not in ("L1", "L2", "L3"):
        raise HTTPException(status_code=400, detail="仅支持 L1/L2/L3 级别")
    row = update_quota_level(level, body.monthly_token, body.daily_chats, body.daily_requests)
    if row is None:
        raise HTTPException(status_code=404, detail="级别不存在")
    # Fetch user count separately since UPDATE RETURNING doesn't include it
    all_levels = get_all_quota_levels()
    for lv in all_levels:
        if lv["level"] == level:
            return QuotaLevelItem(**lv)
    return QuotaLevelItem(
        level=level,
        monthly_token=body.monthly_token,
        daily_chats=body.daily_chats,
        daily_requests=body.daily_requests,
        user_count=0,
    )


# ---- User management --------------------------------------------------------


class UserItem(BaseModel):
    user_id: str
    display_name: str
    enterprise: str
    quota_level: str
    monthly_token: int
    today_token: int = 0
    today_chats: int = 0
    monthly_chats: int = 0
    monthly_token_all: int = 0  # 全天本月Token（不受time_filter影响）
    today_chats_all: int = 0  # 全天今日对话（不受time_filter影响）
    daily_requests: int
    status_token: str = "gray"  # green/yellow/red/gray
    status_chat: str = "gray"


def _token_status(used: int, limit: int) -> str:
    if limit == 0:
        return "gray"
    pct = used / limit * 100
    if pct >= 100:
        return "red"
    if pct >= 80:
        return "yellow"
    if pct > 0:
        return "green"
    return "gray"


def _chat_status(used: int, limit: int) -> str:
    if limit == 0:
        return "gray"
    pct = used / limit * 100
    if pct >= 100:
        return "red"
    if pct >= 80:
        return "yellow"
    if pct > 0:
        return "green"
    return "gray"


@router.get("/users", response_model=list[UserItem])
def list_users(
    time_filter: str = Query("all", description="all|work|non_work"),
    year: int | None = Query(None, description="年份，不传则当前年"),
    month: int | None = Query(None, description="月份 1-12，不传则当前月"),
    _user: dict[str, Any] = Depends(require_admin),
) -> list[UserItem]:
    from datetime import datetime as _dt
    now = _dt.now()
    q_year = year or now.year
    q_month = month or now.month
    is_current_month = (q_year == now.year and q_month == now.month)

    # 从 ClickHouse 获取完整用户列表（PG 可能不完整）
    ch_users = get_all_users_from_clickhouse()
    # 从 PG 获取配额设置
    pg_users = get_all_users()
    pg_quota_map = {u["user_id"]: u.get("quota_level", "L1") for u in pg_users}

    # 单次批量查询替代 6 次独立查询
    stats = get_all_users_batch(q_year, q_month, time_filter, is_current_month)

    quota_cache: dict[str, dict] = {}
    result: list[UserItem] = []
    for u in ch_users:
        uid = u["username"]   # ClickHouse username 字段（userNickname）
        display_name = u.get("nickname") or uid
        level = pg_quota_map.get(uid, "L1")
        if level not in quota_cache:
            quota_cache[level] = get_quota_limits(level)
        limits = quota_cache[level]
        s = stats.get(uid, {})
        mt = s.get("monthly_token", 0)
        tc = s.get("today_chats", 0)
        result.append(
            UserItem(
                user_id=uid,
                display_name=display_name,
                enterprise=u.get("enterprise") or "未知",
                quota_level=level,
                monthly_token=mt,
                today_token=s.get("today_token", 0),
                today_chats=tc,
                monthly_chats=s.get("monthly_chats", 0),
                monthly_token_all=s.get("monthly_token_all", mt),
                today_chats_all=s.get("today_chats_all", 0),
                daily_requests=s.get("daily_requests", 0),
                status_token=_token_status(mt, int(limits.get("monthly_token", 0))),
                status_chat=_chat_status(tc, int(limits.get("daily_chats", 0))),
            )
        )
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
    display_name = updated.get("nickname") or updated.get("username") or updated["user_id"]
    return UserItem(
        user_id=updated["user_id"],
        display_name=display_name,
        enterprise=updated.get("enterprise") or "未知",
        quota_level=updated["quota_level"],
        monthly_token=monthly_tokens.get(updated["user_id"], 0),
        daily_requests=daily_reqs.get(updated["user_id"], 0),
    )


# ---- Global trend -----------------------------------------------------------

from datetime import datetime, timedelta, timezone  # noqa: E402


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
    time_filter: str = Query("all", description="all|work|non_work"),
    _user: dict[str, Any] = Depends(require_admin),
) -> list[dict[str, Any]]:
    """Return global daily token trend, optionally grouped by model or department."""
    if not start or not end:
        start, end = _default_date_range()
    if group_by == "model":
        return get_global_trend_by_model(start, end, time_filter)
    if group_by == "department":
        return get_global_trend_by_dept(start, end, time_filter)
    return get_global_trend(start, end, time_filter)


# ---- Department summary -----------------------------------------------------


class DeptSummaryItem(BaseModel):
    enterprise: str
    user_count: int
    monthly_token: int
    monthly_requests: int
    monthly_chats: int = 0
    avg_token_per_user: int


def get_department_summary(time_filter: str = "all", start: str | None = None, end: str | None = None) -> list[dict[str, Any]]:
    """Compute department summary by merging ClickHouse users with token/request data.

    Uses ClickHouse as the authoritative user source (225 users) instead of PostgreSQL
    (only 27 registered users) to ensure all active users are counted.
    """
    # ClickHouse 是用户主数据源（含 enterprise 字段）
    ch_users = get_all_users_from_clickhouse()

    if start and end:
        monthly_tokens = get_all_users_tokens_in_range(start, end, time_filter)
        monthly_requests = get_all_users_requests_in_range(start, end, time_filter)
        monthly_chats_data = get_all_users_chats_in_range(start, end, time_filter)
    else:
        monthly_tokens = get_all_users_monthly_tokens(time_filter)
        monthly_requests = get_all_users_monthly_requests(time_filter)
        monthly_chats_data = get_all_users_monthly_chats(time_filter)

    # Group users by enterprise
    dept_users: dict[str, list[str]] = {}
    for u in ch_users:
        dept = (u.get("enterprise") or "").strip() or "未知"
        uid = u["username"]  # CH 中 username = userNickname，与 token dict 的 key 一致
        dept_users.setdefault(dept, []).append(uid)

    result: list[dict[str, Any]] = []
    for dept, user_ids in sorted(dept_users.items()):
        total_tokens = sum(monthly_tokens.get(uid, 0) for uid in user_ids)
        total_requests = sum(monthly_requests.get(uid, 0) for uid in user_ids)
        total_chats = sum(monthly_chats_data.get(uid, 0) for uid in user_ids)
        count = len(user_ids)
        result.append(
            {
                "enterprise": dept,
                "user_count": count,
                "monthly_token": total_tokens,
                "monthly_requests": total_requests,
                "monthly_chats": total_chats,
                "avg_token_per_user": total_tokens // count if count > 0 else 0,
            }
        )
    return result


@router.get("/departments", response_model=list[DeptSummaryItem])
def list_departments(
    time_filter: str = Query("all", description="all|work|non_work"),
    start: str | None = Query(None, description="开始日期 YYYY-MM-DD"),
    end: str | None = Query(None, description="结束日期 YYYY-MM-DD"),
    _user: dict[str, Any] = Depends(require_admin),
) -> list[DeptSummaryItem]:
    """Return token usage summary grouped by enterprise/department."""
    rows = get_department_summary(time_filter, start, end)
    return [DeptSummaryItem(**row) for row in rows]


# ---- Leaderboard ------------------------------------------------------------


class LeaderboardItem(BaseModel):
    rank: int
    user_id: str
    display_name: str
    enterprise: str
    quota_level: str
    monthly_token: int
    monthly_requests: int
    monthly_chats: int = 0
    quota_usage_pct: float


def get_leaderboard(top: int | None = None, time_filter: str = "all", start: str | None = None, end: str | None = None) -> list[dict[str, Any]]:
    """Return all users sorted by token consumption in the given range."""
    # 单次批量查询：token + requests + chats（3 次 → 1 次）
    rows = get_leaderboard_batch(time_filter=time_filter, start_date=start, end_date=end)

    # PG 用于获取 quota_level
    pg_users = get_all_users()
    pg_quota_map = {u["user_id"]: u.get("quota_level", "L1") for u in pg_users}
    quota_levels_data = get_all_quota_levels()
    level_limits = {lv["level"]: lv["monthly_token"] for lv in quota_levels_data}

    if top:
        rows = rows[:top]

    result: list[dict[str, Any]] = []
    for i, row in enumerate(rows, start=1):
        uid = row["username"]
        level = pg_quota_map.get(uid, "L1")
        limit = level_limits.get(level, 1) or 1
        mt = row["monthly_token"]
        pct = round(mt / limit * 100, 1)
        result.append(
            {
                "rank": i,
                "user_id": uid,
                "display_name": row.get("nickname") or uid,
                "enterprise": row.get("enterprise") or "未知",
                "quota_level": level,
                "monthly_token": mt,
                "monthly_requests": row.get("monthly_requests", 0),
                "monthly_chats": row.get("monthly_chats", 0),
                "quota_usage_pct": pct,
            }
        )
    return result


@router.get("/leaderboard", response_model=list[LeaderboardItem])
def list_leaderboard(
    time_filter: str = Query("all", description="all|work|non_work"),
    start: str | None = Query(None, description="开始日期 YYYY-MM-DD"),
    end: str | None = Query(None, description="结束日期 YYYY-MM-DD"),
    _user: dict[str, Any] = Depends(require_admin),
) -> list[LeaderboardItem]:
    """Return all users sorted by token usage (frontend handles pagination)."""
    rows = get_leaderboard(top=None, time_filter=time_filter, start=start, end=end)
    return [LeaderboardItem(**row) for row in rows]


# ---- CSV export -------------------------------------------------------------


@router.get("/users/export-csv")
def export_users_csv(
    time_filter: str = Query("all", description="all|work|non_work"),
    year: int | None = Query(None, description="年份"),
    month: int | None = Query(None, description="月份 1-12"),
    _user: dict[str, Any] = Depends(require_admin),
) -> StreamingResponse:
    """Export user list as CSV."""
    from datetime import datetime as _dt
    now = _dt.now()
    q_year = year or now.year
    q_month = month or now.month
    users_data = list_users(time_filter=time_filter, year=q_year, month=q_month, _user=_user)
    is_current_month = (q_year == now.year and q_month == now.month)
    period_label = f"{q_year}-{q_month:02d}"
    token_col = f"{period_label} Token(全天)" if not is_current_month else "本月总Token(全天)"
    chat_col = f"{period_label} 对话轮次" if not is_current_month else "本月对话轮次"
    filename = f"users_export_{period_label}.csv"

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "userId",
            "显示名",
            "部门",
            "配额级别",
            "本月限额Token",
            token_col,
            "今日Token",
            "今日限额对话",
            "今日总对话(全天)",
            chat_col,
            "今日请求次数",
            "Token状态",
            "对话状态",
        ]
    )
    for u in users_data:
        writer.writerow(
            [
                u.user_id,
                u.display_name,
                u.enterprise,
                u.quota_level,
                u.monthly_token,
                u.monthly_token_all,
                u.today_token,
                u.today_chats,
                u.today_chats_all,
                u.monthly_chats,
                u.daily_requests,
                u.status_token,
                u.status_chat,
            ]
        )
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )



@router.get("/leaderboard/export-csv")
def export_leaderboard_csv(
    top: int = Query(100, ge=1, le=500),
    time_filter: str = Query("all", description="all|work|non_work"),
    start: str | None = Query(None, description="开始日期 YYYY-MM-DD"),
    end: str | None = Query(None, description="结束日期 YYYY-MM-DD"),
    _user: dict[str, Any] = Depends(require_admin),
) -> StreamingResponse:
    """Export leaderboard as CSV."""
    rows = get_leaderboard(top=top, time_filter=time_filter, start=start, end=end)
    has_range = bool(start and end)
    period_label = f"{start}~{end}" if has_range else "本月"
    filename = f"leaderboard_export_{start}_{end}.csv" if has_range else "leaderboard_export.csv"

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["排名", "姓名", "分组", "配额级别",
         f"Token({period_label})", f"请求数({period_label})", f"对话轮次({period_label})", "配额使用%"]
    )
    for r in rows:
        writer.writerow([
            r["rank"], r["display_name"], r["enterprise"], r["quota_level"],
            r["monthly_token"], r["monthly_requests"], r["monthly_chats"], r["quota_usage_pct"],
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ---- Working Hours Config ---------------------------------------------------


class WorkingHoursConfig(BaseModel):
    enabled: bool
    start: str  # "HH:MM"
    end: str  # "HH:MM"
    weekday_only: bool = True  # True=仅周一至周五，False=不限星期


@router.get("/working-hours", response_model=WorkingHoursConfig)
def get_working_hours(
    _user: dict[str, Any] = Depends(require_admin),
) -> WorkingHoursConfig:
    """Return current working hours configuration."""
    from app.config import get_config

    cfg = get_config().get("working_hours", {})
    return WorkingHoursConfig(
        enabled=cfg.get("enabled", False),
        start=cfg.get("start", "08:30"),
        end=cfg.get("end", "18:00"),
    )


@router.put("/working-hours", response_model=WorkingHoursConfig)
def update_working_hours(
    body: WorkingHoursConfig,
    _user: dict[str, Any] = Depends(require_admin),
) -> WorkingHoursConfig:
    """Update working hours config (writes back to config.yaml)."""
    import re
    from pathlib import Path

    import yaml

    from app.config import load_config

    # validate HH:MM format
    pat = re.compile(r"^\d{2}:\d{2}$")
    if not pat.match(body.start) or not pat.match(body.end):
        raise HTTPException(status_code=400, detail="时间格式必须为 HH:MM")

    config_path = Path(__file__).resolve().parent.parent.parent / "config.yaml"
    with open(config_path) as f:
        cfg = yaml.safe_load(f) or {}

    cfg["working_hours"] = {
        "enabled": body.enabled,
        "start": body.start,
        "end": body.end,
        "weekday_only": body.weekday_only,
    }
    with open(config_path, "w") as f:
        yaml.dump(cfg, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    load_config()  # hot-reload
    # 清空 ClickHouse 查询缓存，确保新配置立即生效
    import app.services.clickhouse as _ch_module

    _ch_module._cache.clear()
    return body


# ─── Email Template Management ───

from app.services.database import get_email_template, save_email_template
from app.services.template_renderer import render_template, build_context


class EmailTemplateUpdate(BaseModel):
    subject: str
    body_html: str


@router.get("/email-template")
def get_template(admin: Any = Depends(require_admin)) -> dict[str, Any]:
    """Get the current email template."""
    return get_email_template("default")


@router.put("/email-template")
def update_template(body: EmailTemplateUpdate, admin: Any = Depends(require_admin)) -> dict[str, Any]:
    """Update the email template."""
    save_email_template("default", body.subject, body.body_html)
    return get_email_template("default")


@router.post("/email-template/preview")
def preview_template(body: EmailTemplateUpdate, admin: Any = Depends(require_admin)) -> dict[str, str]:
    """Preview template with sample data."""
    sample_context = build_context(
        username="张三",
        user_id="zhangsan",
        quota_type="monthly_token",
        used=8000000,
        limit=10000000,
        threshold=80,
        period_key="2026-04",
    )
    return {
        "subject": render_template(body.subject, sample_context),
        "body_html": render_template(body.body_html, sample_context),
    }


_TEMPLATE_VARIABLES = [
    {"name": "username", "description": "用户显示名"},
    {"name": "user_id", "description": "用户账号（sAMAccountName）"},
    {"name": "quota_type_label", "description": "配额类型中文名（月度Token/日对话轮次）"},
    {"name": "used", "description": "已用量（千分位格式）"},
    {"name": "limit", "description": "上限值（千分位格式）"},
    {"name": "percent", "description": "当前使用百分比"},
    {"name": "threshold", "description": "触发阈值"},
    {"name": "period", "description": "周期描述"},
    {"name": "reset_time", "description": "重置时间说明"},
]


@router.get("/email-template/variables")
def get_template_variables(admin: Any = Depends(require_admin)) -> list[dict[str, str]]:
    """Return all available template placeholders."""
    return _TEMPLATE_VARIABLES


# ─── Notification Config Management ───

from app.config import update_notification_config
from pydantic import field_validator


class NotificationConfigUpdate(BaseModel):
    enabled: bool | None = None
    check_interval_minutes: int | None = None
    thresholds: list[int] | None = None
    email_domain: str | None = None


@router.get("/notification-config")
def get_notification_config(_user: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    """Get current notification config."""
    from app.config import get_config
    cfg = get_config()
    return cfg.get("notification", {
        "enabled": True,
        "check_interval_minutes": 60,
        "thresholds": [50, 80, 100],
        "email_domain": "",
    })


@router.put("/notification-config")
def update_notif_config(
    body: NotificationConfigUpdate,
    _user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    """Update notification config (persisted to config.yaml; interval/enabled require restart)."""
    result = update_notification_config(
        enabled=body.enabled,
        check_interval_minutes=body.check_interval_minutes,
        thresholds=body.thresholds,
        email_domain=body.email_domain,
    )
    return result
