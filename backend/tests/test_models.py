"""
Unit tests for all Pydantic models used across the application.

Covers:
  - app.routers.auth:    LoginRequest, LoginResponse
  - app.routers.quota:   QuotaBar, QuotaUsageResponse
  - app.routers.metrics: Scope, MetricsSummaryResponse, TrendItem,
                         ModelDistributionItem, DetailItem
  - app.routers.admin:   QuotaLevelItem, QuotaLevelUpdate, UserItem,
                         UserLevelUpdate, TrendItem (admin), GroupedTrendItem,
                         DeptSummaryItem, LeaderboardItem, WorkingHoursConfig
  - app.data_schema:     module-level string constants / CAMEL_MAP
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

# ---------------------------------------------------------------------------
# Import all models (ldap is already stubbed via conftest.py)
# ---------------------------------------------------------------------------
from app.routers.auth import LoginRequest, LoginResponse
from app.routers.quota import QuotaBar, QuotaUsageResponse
from app.routers.metrics import (
    Scope,
    MetricsSummaryResponse,
    TrendItem as MetricsTrendItem,
    ModelDistributionItem,
    DetailItem,
)
from app.routers.admin import (
    QuotaLevelItem,
    QuotaLevelUpdate,
    UserItem,
    UserLevelUpdate,
    TrendItem as AdminTrendItem,
    GroupedTrendItem,
    DeptSummaryItem,
    LeaderboardItem,
    WorkingHoursConfig,
)
import app.data_schema as ds


# ===========================================================================
# auth models
# ===========================================================================

class TestLoginRequest:
    def test_valid(self):
        req = LoginRequest(username="alice", password="secret")
        assert req.username == "alice"
        assert req.password == "secret"

    def test_missing_username_raises(self):
        with pytest.raises(ValidationError):
            LoginRequest(password="secret")  # type: ignore[call-arg]

    def test_missing_password_raises(self):
        with pytest.raises(ValidationError):
            LoginRequest(username="alice")  # type: ignore[call-arg]

    def test_empty_strings_are_valid(self):
        req = LoginRequest(username="", password="")
        assert req.username == ""
        assert req.password == ""

    def test_serialise(self):
        data = LoginRequest(username="bob", password="pw").model_dump()
        assert data == {"username": "bob", "password": "pw"}


class TestLoginResponse:
    def test_valid(self):
        resp = LoginResponse(token="tok123", role="admin")
        assert resp.token == "tok123"
        assert resp.role == "admin"

    def test_missing_token_raises(self):
        with pytest.raises(ValidationError):
            LoginResponse(role="user")  # type: ignore[call-arg]

    def test_missing_role_raises(self):
        with pytest.raises(ValidationError):
            LoginResponse(token="tok")  # type: ignore[call-arg]

    def test_serialise(self):
        data = LoginResponse(token="t", role="user").model_dump()
        assert data == {"token": "t", "role": "user"}


# ===========================================================================
# quota models
# ===========================================================================

_VALID_BAR = dict(used=100, limit=1000, percent=10.0, color="green", message="ok")


class TestQuotaBar:
    def test_valid(self):
        bar = QuotaBar(**_VALID_BAR)
        assert bar.used == 100
        assert bar.limit == 1000
        assert bar.percent == 10.0
        assert bar.color == "green"
        assert bar.message == "ok"

    def test_missing_used_raises(self):
        d = {k: v for k, v in _VALID_BAR.items() if k != "used"}
        with pytest.raises(ValidationError):
            QuotaBar(**d)

    def test_missing_limit_raises(self):
        d = {k: v for k, v in _VALID_BAR.items() if k != "limit"}
        with pytest.raises(ValidationError):
            QuotaBar(**d)

    def test_missing_percent_raises(self):
        d = {k: v for k, v in _VALID_BAR.items() if k != "percent"}
        with pytest.raises(ValidationError):
            QuotaBar(**d)

    def test_percent_coerced_to_float(self):
        bar = QuotaBar(**{**_VALID_BAR, "percent": 50})
        assert isinstance(bar.percent, float)
        assert bar.percent == 50.0

    def test_used_zero(self):
        bar = QuotaBar(**{**_VALID_BAR, "used": 0, "percent": 0.0})
        assert bar.used == 0
        assert bar.percent == 0.0

    def test_serialise(self):
        bar = QuotaBar(**_VALID_BAR)
        data = bar.model_dump()
        assert data["used"] == 100
        assert data["color"] == "green"


class TestQuotaUsageResponse:
    def _bar(self, **kw):
        return QuotaBar(**{**_VALID_BAR, **kw})

    def test_valid(self):
        resp = QuotaUsageResponse(
            monthly_token=self._bar(),
            daily_chats=self._bar(used=5, limit=50),
            daily_requests=self._bar(used=20, limit=200),
        )
        assert resp.monthly_token.used == 100
        assert resp.daily_chats.limit == 50
        assert resp.daily_requests.limit == 200

    def test_missing_monthly_token_raises(self):
        with pytest.raises(ValidationError):
            QuotaUsageResponse(
                daily_chats=self._bar(),
                daily_requests=self._bar(),
            )  # type: ignore[call-arg]

    def test_missing_daily_chats_raises(self):
        with pytest.raises(ValidationError):
            QuotaUsageResponse(
                monthly_token=self._bar(),
                daily_requests=self._bar(),
            )  # type: ignore[call-arg]

    def test_nested_serialise(self):
        resp = QuotaUsageResponse(
            monthly_token=self._bar(),
            daily_chats=self._bar(),
            daily_requests=self._bar(),
        )
        data = resp.model_dump()
        assert "monthly_token" in data
        assert data["monthly_token"]["used"] == 100


# ===========================================================================
# metrics models
# ===========================================================================

class TestScope:
    def test_valid_values(self):
        assert Scope.month == "month"
        assert Scope.week == "week"
        assert Scope.today == "today"

    def test_from_string(self):
        assert Scope("month") == Scope.month
        assert Scope("week") == Scope.week
        assert Scope("today") == Scope.today

    def test_invalid_value_raises(self):
        with pytest.raises(ValueError):
            Scope("quarterly")


class TestMetricsSummaryResponse:
    def test_required_fields_only(self):
        resp = MetricsSummaryResponse(total_token=500, request_count=10)
        assert resp.total_token == 500
        assert resp.request_count == 10
        assert resp.active_days is None
        assert resp.daily_avg_token is None
        assert resp.chat_count is None

    def test_all_fields(self):
        resp = MetricsSummaryResponse(
            total_token=10000,
            request_count=100,
            active_days=20,
            daily_avg_token=500,
            chat_count=50,
        )
        assert resp.active_days == 20
        assert resp.daily_avg_token == 500
        assert resp.chat_count == 50

    def test_missing_total_token_raises(self):
        with pytest.raises(ValidationError):
            MetricsSummaryResponse(request_count=10)  # type: ignore[call-arg]

    def test_missing_request_count_raises(self):
        with pytest.raises(ValidationError):
            MetricsSummaryResponse(total_token=500)  # type: ignore[call-arg]

    def test_optional_fields_accept_zero(self):
        resp = MetricsSummaryResponse(
            total_token=0, request_count=0,
            active_days=0, daily_avg_token=0, chat_count=0,
        )
        assert resp.active_days == 0
        assert resp.daily_avg_token == 0

    def test_serialise(self):
        data = MetricsSummaryResponse(total_token=1, request_count=1).model_dump()
        assert data["active_days"] is None
        assert data["chat_count"] is None


class TestMetricsTrendItem:
    def test_valid(self):
        item = MetricsTrendItem(date="2026-04-01", input_token=100, output_token=200, total_token=300)
        assert item.date == "2026-04-01"
        assert item.total_token == 300

    def test_missing_date_raises(self):
        with pytest.raises(ValidationError):
            MetricsTrendItem(input_token=100, output_token=200, total_token=300)  # type: ignore[call-arg]

    def test_missing_input_token_raises(self):
        with pytest.raises(ValidationError):
            MetricsTrendItem(date="2026-04-01", output_token=200, total_token=300)  # type: ignore[call-arg]

    def test_token_values_can_be_zero(self):
        item = MetricsTrendItem(date="2026-04-01", input_token=0, output_token=0, total_token=0)
        assert item.input_token == 0

    def test_serialise(self):
        data = MetricsTrendItem(date="2026-04-01", input_token=1, output_token=2, total_token=3).model_dump()
        assert data == {"date": "2026-04-01", "input_token": 1, "output_token": 2, "total_token": 3}


class TestModelDistributionItem:
    def test_valid(self):
        item = ModelDistributionItem(model="gpt-4o", total_token=5000, percent=75.5)
        assert item.model == "gpt-4o"
        assert item.total_token == 5000
        assert item.percent == 75.5

    def test_missing_model_raises(self):
        with pytest.raises(ValidationError):
            ModelDistributionItem(total_token=5000, percent=75.5)  # type: ignore[call-arg]

    def test_percent_coerced_to_float(self):
        item = ModelDistributionItem(model="m", total_token=100, percent=50)
        assert isinstance(item.percent, float)

    def test_percent_zero(self):
        item = ModelDistributionItem(model="m", total_token=0, percent=0.0)
        assert item.percent == 0.0

    def test_serialise(self):
        data = ModelDistributionItem(model="gpt-4o", total_token=100, percent=100.0).model_dump()
        assert data["model"] == "gpt-4o"
        assert data["percent"] == 100.0


class TestDetailItem:
    _VALID = dict(
        date="2026-04-01", model="gpt-4o", request_count=5,
        input_token=100, output_token=200, total_token=300,
    )

    def test_valid(self):
        item = DetailItem(**self._VALID)
        assert item.date == "2026-04-01"
        assert item.model == "gpt-4o"
        assert item.request_count == 5

    def test_missing_date_raises(self):
        d = {k: v for k, v in self._VALID.items() if k != "date"}
        with pytest.raises(ValidationError):
            DetailItem(**d)

    def test_missing_model_raises(self):
        d = {k: v for k, v in self._VALID.items() if k != "model"}
        with pytest.raises(ValidationError):
            DetailItem(**d)

    def test_all_fields_in_serialise(self):
        data = DetailItem(**self._VALID).model_dump()
        for field in self._VALID:
            assert field in data


# ===========================================================================
# admin models
# ===========================================================================

class TestQuotaLevelItem:
    _VALID = dict(level="L1", monthly_token=5000000, daily_chats=50, daily_requests=500, user_count=10)

    def test_valid(self):
        item = QuotaLevelItem(**self._VALID)
        assert item.level == "L1"
        assert item.monthly_token == 5000000
        assert item.user_count == 10

    def test_missing_level_raises(self):
        d = {k: v for k, v in self._VALID.items() if k != "level"}
        with pytest.raises(ValidationError):
            QuotaLevelItem(**d)

    def test_missing_user_count_raises(self):
        d = {k: v for k, v in self._VALID.items() if k != "user_count"}
        with pytest.raises(ValidationError):
            QuotaLevelItem(**d)

    def test_serialise(self):
        data = QuotaLevelItem(**self._VALID).model_dump()
        assert data["level"] == "L1"
        assert data["user_count"] == 10


class TestQuotaLevelUpdate:
    _VALID = dict(monthly_token=5000000, daily_chats=50, daily_requests=500)

    def test_valid(self):
        upd = QuotaLevelUpdate(**self._VALID)
        assert upd.monthly_token == 5000000
        assert upd.daily_chats == 50
        assert upd.daily_requests == 500

    def test_missing_monthly_token_raises(self):
        d = {k: v for k, v in self._VALID.items() if k != "monthly_token"}
        with pytest.raises(ValidationError):
            QuotaLevelUpdate(**d)

    def test_missing_daily_chats_raises(self):
        d = {k: v for k, v in self._VALID.items() if k != "daily_chats"}
        with pytest.raises(ValidationError):
            QuotaLevelUpdate(**d)

    def test_serialise(self):
        data = QuotaLevelUpdate(**self._VALID).model_dump()
        assert data == self._VALID


class TestUserItem:
    _REQUIRED = dict(
        user_id="user1", display_name="Alice", enterprise="Engineering",
        quota_level="L1", monthly_token=1000, daily_requests=100,
    )

    def test_valid_required_only(self):
        item = UserItem(**self._REQUIRED)
        assert item.user_id == "user1"
        assert item.display_name == "Alice"
        assert item.enterprise == "Engineering"
        assert item.quota_level == "L1"
        assert item.monthly_token == 1000
        assert item.daily_requests == 100

    def test_default_values(self):
        item = UserItem(**self._REQUIRED)
        assert item.today_token == 0
        assert item.today_chats == 0
        assert item.monthly_chats == 0
        assert item.monthly_token_all == 0
        assert item.today_chats_all == 0
        assert item.status_token == "gray"
        assert item.status_chat == "gray"

    def test_all_fields(self):
        item = UserItem(
            **self._REQUIRED,
            today_token=50,
            today_chats=3,
            monthly_chats=20,
            monthly_token_all=2000,
            today_chats_all=5,
            status_token="green",
            status_chat="yellow",
        )
        assert item.today_token == 50
        assert item.status_token == "green"
        assert item.status_chat == "yellow"

    def test_missing_user_id_raises(self):
        d = {k: v for k, v in self._REQUIRED.items() if k != "user_id"}
        with pytest.raises(ValidationError):
            UserItem(**d)

    def test_missing_daily_requests_raises(self):
        d = {k: v for k, v in self._REQUIRED.items() if k != "daily_requests"}
        with pytest.raises(ValidationError):
            UserItem(**d)

    def test_serialise_contains_all_fields(self):
        data = UserItem(**self._REQUIRED).model_dump()
        assert data["status_token"] == "gray"
        assert data["today_token"] == 0


class TestUserLevelUpdate:
    def test_valid(self):
        upd = UserLevelUpdate(level="L2")
        assert upd.level == "L2"

    def test_missing_level_raises(self):
        with pytest.raises(ValidationError):
            UserLevelUpdate()  # type: ignore[call-arg]

    def test_serialise(self):
        assert UserLevelUpdate(level="L3").model_dump() == {"level": "L3"}


class TestAdminTrendItem:
    def test_valid(self):
        item = AdminTrendItem(date="2026-04-01", input_token=500, output_token=1000, total_token=1500)
        assert item.date == "2026-04-01"
        assert item.total_token == 1500

    def test_missing_date_raises(self):
        with pytest.raises(ValidationError):
            AdminTrendItem(input_token=100, output_token=200, total_token=300)  # type: ignore[call-arg]

    def test_all_token_fields_required(self):
        with pytest.raises(ValidationError):
            AdminTrendItem(date="2026-04-01", input_token=100, total_token=200)  # type: ignore[call-arg]

    def test_serialise(self):
        data = AdminTrendItem(date="2026-04-01", input_token=1, output_token=2, total_token=3).model_dump()
        assert data == {"date": "2026-04-01", "input_token": 1, "output_token": 2, "total_token": 3}


class TestGroupedTrendItem:
    _VALID = dict(date="2026-04-01", group="gpt-4o", input_token=100, output_token=200, total_token=300)

    def test_valid(self):
        item = GroupedTrendItem(**self._VALID)
        assert item.group == "gpt-4o"
        assert item.total_token == 300

    def test_missing_group_raises(self):
        d = {k: v for k, v in self._VALID.items() if k != "group"}
        with pytest.raises(ValidationError):
            GroupedTrendItem(**d)

    def test_missing_date_raises(self):
        d = {k: v for k, v in self._VALID.items() if k != "date"}
        with pytest.raises(ValidationError):
            GroupedTrendItem(**d)

    def test_serialise(self):
        data = GroupedTrendItem(**self._VALID).model_dump()
        assert data["group"] == "gpt-4o"
        assert data["date"] == "2026-04-01"


class TestDeptSummaryItem:
    _VALID = dict(
        enterprise="Engineering", user_count=10,
        monthly_token=50000, monthly_requests=200, avg_token_per_user=5000,
    )

    def test_valid_required_only(self):
        item = DeptSummaryItem(**self._VALID)
        assert item.enterprise == "Engineering"
        assert item.user_count == 10
        assert item.monthly_chats == 0  # default

    def test_monthly_chats_default_zero(self):
        item = DeptSummaryItem(**self._VALID)
        assert item.monthly_chats == 0

    def test_explicit_monthly_chats(self):
        item = DeptSummaryItem(**self._VALID, monthly_chats=50)
        assert item.monthly_chats == 50

    def test_missing_enterprise_raises(self):
        d = {k: v for k, v in self._VALID.items() if k != "enterprise"}
        with pytest.raises(ValidationError):
            DeptSummaryItem(**d)

    def test_missing_avg_token_raises(self):
        d = {k: v for k, v in self._VALID.items() if k != "avg_token_per_user"}
        with pytest.raises(ValidationError):
            DeptSummaryItem(**d)

    def test_serialise(self):
        data = DeptSummaryItem(**self._VALID).model_dump()
        assert data["enterprise"] == "Engineering"
        assert data["monthly_chats"] == 0


class TestLeaderboardItem:
    _VALID = dict(
        rank=1, user_id="user1", display_name="Alice", enterprise="Eng",
        quota_level="L2", monthly_token=80000, monthly_requests=400,
        quota_usage_pct=80.0,
    )

    def test_valid(self):
        item = LeaderboardItem(**self._VALID)
        assert item.rank == 1
        assert item.display_name == "Alice"
        assert item.monthly_chats == 0  # default

    def test_default_monthly_chats(self):
        item = LeaderboardItem(**self._VALID)
        assert item.monthly_chats == 0

    def test_explicit_monthly_chats(self):
        item = LeaderboardItem(**self._VALID, monthly_chats=30)
        assert item.monthly_chats == 30

    def test_missing_rank_raises(self):
        d = {k: v for k, v in self._VALID.items() if k != "rank"}
        with pytest.raises(ValidationError):
            LeaderboardItem(**d)

    def test_missing_quota_usage_pct_raises(self):
        d = {k: v for k, v in self._VALID.items() if k != "quota_usage_pct"}
        with pytest.raises(ValidationError):
            LeaderboardItem(**d)

    def test_quota_usage_pct_coerced_to_float(self):
        item = LeaderboardItem(**{**self._VALID, "quota_usage_pct": 75})
        assert isinstance(item.quota_usage_pct, float)
        assert item.quota_usage_pct == 75.0

    def test_serialise(self):
        data = LeaderboardItem(**self._VALID).model_dump()
        assert data["rank"] == 1
        assert data["quota_usage_pct"] == 80.0
        assert data["monthly_chats"] == 0


class TestWorkingHoursConfig:
    def test_valid_all_fields(self):
        cfg = WorkingHoursConfig(enabled=True, start="09:00", end="18:00", weekday_only=False)
        assert cfg.enabled is True
        assert cfg.start == "09:00"
        assert cfg.end == "18:00"
        assert cfg.weekday_only is False

    def test_weekday_only_defaults_true(self):
        cfg = WorkingHoursConfig(enabled=False, start="08:30", end="17:30")
        assert cfg.weekday_only is True

    def test_missing_enabled_raises(self):
        with pytest.raises(ValidationError):
            WorkingHoursConfig(start="09:00", end="18:00")  # type: ignore[call-arg]

    def test_missing_start_raises(self):
        with pytest.raises(ValidationError):
            WorkingHoursConfig(enabled=True, end="18:00")  # type: ignore[call-arg]

    def test_missing_end_raises(self):
        with pytest.raises(ValidationError):
            WorkingHoursConfig(enabled=True, start="09:00")  # type: ignore[call-arg]

    def test_bool_coercion(self):
        # Pydantic coerces truthy/falsy values to bool
        cfg = WorkingHoursConfig(enabled=1, start="09:00", end="18:00")  # type: ignore[arg-type]
        assert cfg.enabled is True

    def test_serialise(self):
        data = WorkingHoursConfig(enabled=True, start="09:00", end="18:00").model_dump()
        assert data == {"enabled": True, "start": "09:00", "end": "18:00", "weekday_only": True}


# ===========================================================================
# data_schema constants
# ===========================================================================

class TestDataSchema:
    """Verify that data_schema exports the expected string constants."""

    def test_user_identity_constants(self):
        assert ds.USER_ID == "userId"
        assert ds.USERNAME == "userNickname"   # USERNAME now points to userNickname
        assert ds.USER_NICKNAME == "userNickname"
        assert ds.ENTERPRISE_ID == "enterpriseId"
        assert ds.ENTERPRISE == "enterprise"

    def test_timing_constants(self):
        assert ds.EVENT_DATE == "event_date"
        assert ds.TIMESTAMP == "timestamp"

    def test_product_constants(self):
        assert ds.PRODUCT == "product"
        assert ds.EVENT_CODE == "eventCode"

    def test_client_environment_constants(self):
        assert ds.IDE_TYPE == "ideType"
        assert ds.IDE_NAME == "ideName"
        assert ds.EXT_NAME == "extName"

    def test_model_constants(self):
        assert ds.REQUEST_MODEL_NAME == "requestModelName"
        assert ds.REQUEST_MODEL_ID == "requestModelId"

    def test_token_metric_constants(self):
        assert ds.INPUT_TOKEN == "inputToken"
        assert ds.OUTPUT_TOKEN == "outputToken"
        assert ds.TOTAL_TOKEN == "totalToken"

    def test_success_constant(self):
        assert ds.IS_SUCCESSFUL == "isSuccessful"

    def test_camel_map_is_dict(self):
        assert isinstance(ds.CAMEL_MAP, dict)

    def test_camel_map_contains_expected_keys(self):
        for key in (
            ds.USER_ID, ds.USERNAME, ds.USER_NICKNAME, ds.ENTERPRISE_ID,
            ds.ENTERPRISE, ds.EVENT_DATE, ds.REQUEST_MODEL_NAME,
            ds.IDE_TYPE, ds.INPUT_TOKEN, ds.OUTPUT_TOKEN,
            ds.TOTAL_TOKEN, ds.IS_SUCCESSFUL,
        ):
            assert key in ds.CAMEL_MAP

    def test_camel_map_values_are_strings(self):
        for v in ds.CAMEL_MAP.values():
            assert isinstance(v, str)
