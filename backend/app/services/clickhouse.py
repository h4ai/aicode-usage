# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""ClickHouse query helpers with TTL caching.

Uses clickhouse_connect (HTTP protocol, port 8123) for broad compatibility
and to avoid native protocol issues in air-gapped environments.

This module re-exports all public symbols from the split sub-modules
to preserve backward compatibility for existing imports.
"""

# Client & utilities
# Admin/batch queries
from app.services.clickhouse_admin import (  # noqa: F401
    AdminUserStats,
    get_all_users_batch,
    get_all_users_chats_in_month,
    get_all_users_chats_in_range,
    get_all_users_daily_requests,
    get_all_users_from_clickhouse,
    get_all_users_monthly_chats,
    get_all_users_monthly_requests,
    get_all_users_monthly_tokens,
    get_all_users_requests_in_month,
    get_all_users_requests_in_range,
    get_all_users_today_chats,
    get_all_users_today_tokens,
    get_all_users_tokens_in_month,
    get_all_users_tokens_in_range,
    get_global_trend,
    get_global_trend_by_dept,
    get_global_trend_by_model,
    get_leaderboard_batch,
)
from app.services.clickhouse_client import (  # noqa: F401
    _cache,
    _ch_client,
    _get_client,
    _reset_client,
    _safe_float,
    _safe_int,
    logger,
)

# Filters
from app.services.clickhouse_filters import (  # noqa: F401
    _BASE_FILTER,
    _month_range,
    _today_shanghai,
    _user_filter,
    _working_hours_filter,
)

# Single-user queries
from app.services.clickhouse_user import (  # noqa: F401
    get_chat_session_count,
    get_daily_request_count,
    get_daily_trend,
    get_detail_records,
    get_model_distribution,
    get_monthly_active_days,
    get_monthly_request_count,
    get_monthly_token_usage,
    get_today_token_usage,
    get_weekly_request_count,
    get_weekly_token_usage,
)
