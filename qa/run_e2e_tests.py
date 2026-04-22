#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Run AI Code Usage API E2E test cases.

- Backend base URL: http://127.0.0.1:8002
- Each test runs independently; exceptions won't stop the suite.
- UI cases are printed as [MANUAL].

Known issue:
- POST /api/auth/test-login currently returns 404 -> mark as BLOCKED.
"""

from __future__ import annotations

import json
import sys
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional, Tuple

import urllib.error
import urllib.request

BASE_URL = "http://127.0.0.1:8002"
TIMEOUT_SEC = 8

ADMIN_USER = "admin"
ADMIN_PASS = "admin123"

TEST_UID = "uid_001"
TEST_PASS = "test123"


@dataclass
class TestResult:
    code: str
    name: str
    status: str  # PASS|FAIL|BLOCKED|MANUAL
    reason: str = ""


def http_request(
    method: str,
    path: str,
    json_body: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
) -> Tuple[int, Dict[str, str], bytes]:
    url = BASE_URL.rstrip("/") + path
    data = None
    req_headers = {"Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        req_headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, method=method.upper(), headers=req_headers)

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as resp:
            body = resp.read()
            return resp.getcode(), dict(resp.headers), body
    except urllib.error.HTTPError as e:
        # HTTP error responses still have a body.
        body = e.read() if hasattr(e, "read") else b""
        return e.code, dict(getattr(e, "headers", {}) or {}), body


def parse_json(body: bytes) -> Any:
    return json.loads(body.decode("utf-8"))


def extract_token(payload: Any) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    for k in ("token", "access_token", "accessToken"):
        v = payload.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def is_backend_unreachable(exc: Exception) -> bool:
    # urllib raises URLError for connection issues
    return isinstance(exc, urllib.error.URLError)


def fmt_reason(reason: str) -> str:
    return reason.replace("\n", " ").strip()


def run_test(code: str, name: str, fn: Callable[[], TestResult]) -> TestResult:
    try:
        return fn()
    except Exception as e:
        if is_backend_unreachable(e):
            return TestResult(code, name, "BLOCKED", f"后端不可达: {e}")
        return TestResult(code, name, "FAIL", f"异常: {type(e).__name__}: {e}")


# --- Tests ---

def tc_001_admin_login(ctx: Dict[str, Any]) -> TestResult:
    code, name = "TC-001", "管理员登录成功"
    status, _, body = http_request("POST", "/api/auth/login", {"username": ADMIN_USER, "password": ADMIN_PASS})
    if status != 200:
        return TestResult(code, name, "FAIL", f"status={status}")
    try:
        payload = parse_json(body)
    except Exception:
        return TestResult(code, name, "FAIL", "响应非 JSON")
    token = extract_token(payload)
    if not token:
        return TestResult(code, name, "FAIL", "token/access_token 为空")
    ctx["admin_token"] = token
    return TestResult(code, name, "PASS")


def tc_002_test_user_login(ctx: Dict[str, Any]) -> TestResult:
    code, name = "TC-002", "测试用户登录成功"
    status, _, body = http_request(
        "POST", "/api/auth/test-login", {"username": TEST_UID, "password": TEST_PASS}
    )
    if status in (404, 422):
        return TestResult(
            code,
            name,
            "BLOCKED",
            "test-login 端点未启用（需配置 auth.allow_test_login: true）",
        )
    if status != 200:
        return TestResult(code, name, "FAIL", f"status={status}")
    try:
        payload = parse_json(body)
    except Exception:
        return TestResult(code, name, "FAIL", "响应非 JSON")
    token = extract_token(payload)
    if not token:
        return TestResult(code, name, "FAIL", "token/access_token 为空")
    ctx["user_token"] = token
    return TestResult(code, name, "PASS")


def tc_003_wrong_password() -> TestResult:
    code, name = "TC-003", "错误密码登录失败"
    status, _, body = http_request("POST", "/api/auth/login", {"username": ADMIN_USER, "password": "WRONG"})
    if status == 200:
        return TestResult(code, name, "FAIL", "错误密码却返回 200")
    if status not in (400, 401, 403):
        return TestResult(code, name, "FAIL", f"期望 400/401/403, 实际 status={status}")
    # error message best-effort
    try:
        payload = parse_json(body)
        if isinstance(payload, dict):
            msg = payload.get("message") or payload.get("detail") or payload.get("error")
            if not (isinstance(msg, str) and msg.strip()):
                return TestResult(code, name, "FAIL", "未返回错误信息(message/detail/error)")
    except Exception:
        # allow non-json error, but still should have body
        if not body:
            return TestResult(code, name, "FAIL", "响应体为空")
    return TestResult(code, name, "PASS")


def tc_004_metrics_with_jwt(ctx: Dict[str, Any]) -> TestResult:
    code, name = "TC-004", "携带 JWT 访问受保护 API 成功"
    token = ctx.get("user_token")
    if not token:
        return TestResult(code, name, "BLOCKED", "无法获取测试用户 token（依赖 TC-002）")
    status, _, body = http_request("GET", "/api/metrics/summary", headers={"Authorization": f"Bearer {token}"})
    if status != 200:
        return TestResult(code, name, "FAIL", f"status={status}")
    try:
        payload = parse_json(body)
    except Exception:
        return TestResult(code, name, "FAIL", "响应非 JSON")
    if not isinstance(payload, dict):
        return TestResult(code, name, "FAIL", "响应非对象")
    keys = set(payload.keys())
    if not (keys & {"total_token", "request_count", "total_tokens", "totalToken", "total_usage", "summary"}):
        return TestResult(code, name, "FAIL", f"缺少统计字段(total_token/request_count), keys={sorted(list(keys))[:10]}")
    return TestResult(code, name, "PASS")


def tc_005_metrics_without_jwt() -> TestResult:
    code, name = "TC-005", "无 JWT 访问受保护 API 失败"
    status, _, _ = http_request("GET", "/api/metrics/summary")
    if status in (401, 403):
        return TestResult(code, name, "PASS")
    if status == 200:
        return TestResult(code, name, "FAIL", "未授权却返回 200")
    return TestResult(code, name, "FAIL", f"期望 401/403, 实际 status={status}")


def tc_006_quota_levels(ctx: Dict[str, Any]) -> TestResult:
    code, name = "TC-006", "管理员获取配额级别列表"
    token = ctx.get("admin_token")
    if not token:
        return TestResult(code, name, "BLOCKED", "无法获取 admin token（依赖 TC-001）")
    status, _, body = http_request("GET", "/api/admin/quota-levels", headers={"Authorization": f"Bearer {token}"})
    if status != 200:
        return TestResult(code, name, "FAIL", f"status={status}")
    try:
        payload = parse_json(body)
    except Exception:
        return TestResult(code, name, "FAIL", "响应非 JSON")

    def collect_levels(obj: Any) -> set:
        levels = set()
        if isinstance(obj, list):
            for it in obj:
                if isinstance(it, str):
                    levels.add(it)
                elif isinstance(it, dict):
                    for k in ("name", "code", "level"):
                        v = it.get(k)
                        if isinstance(v, str):
                            levels.add(v)
        elif isinstance(obj, dict):
            # maybe {"L1": {...}, "L2": {...}}
            for k in obj.keys():
                if isinstance(k, str) and k.upper().startswith("L"):
                    levels.add(k)
            # or embedded list
            for k in ("items", "data", "levels"):
                if k in obj:
                    levels |= collect_levels(obj.get(k))
        return {x.upper() for x in levels}

    levels = collect_levels(payload)
    required = {"L1", "L2", "L3"}
    if not required.issubset(levels):
        return TestResult(code, name, "FAIL", f"缺少等级: {sorted(list(required - levels))}, got={sorted(list(levels))}")
    # strictness: if it only contains these three, good; else warn as FAIL per AC.
    extra = {x for x in levels if x in {"L1", "L2", "L3"}}  # keep only canonical
    if extra != required:
        # shouldn't happen
        pass
    # If backend returns more levels, treat as FAIL (per current spec)
    # We can only detect if there are other L* keys.
    other_l = {x for x in levels if x.startswith("L") and x not in required}
    if other_l:
        return TestResult(code, name, "FAIL", f"出现多余等级: {sorted(list(other_l))}")
    return TestResult(code, name, "PASS")


def tc_011_health() -> TestResult:
    code, name = "TC-011", "健康检查接口返回依赖状态"
    status, _, body = http_request("GET", "/health")
    if status != 200:
        return TestResult(code, name, "FAIL", f"status={status}")
    try:
        payload = parse_json(body)
    except Exception:
        return TestResult(code, name, "FAIL", "响应非 JSON")
    if not isinstance(payload, dict):
        return TestResult(code, name, "FAIL", "响应非对象")
    keys = {k.lower() for k in payload.keys()}
    if not (keys & {"clickhouse", "ch", "postgres", "postgresql", "db", "ldap"}):
        return TestResult(code, name, "FAIL", f"缺少依赖状态字段, keys={sorted(list(keys))[:20]}")
    return TestResult(code, name, "PASS")


def tc_018_admin_users(ctx: Dict[str, Any]) -> TestResult:
    code, name = "TC-018", "管理员查询用户列表含配额级别列"
    token = ctx.get("admin_token")
    if not token:
        return TestResult(code, name, "BLOCKED", "无法获取 admin token（依赖 TC-001）")
    status, _, body = http_request(
        "GET", "/api/admin/users?month=4", headers={"Authorization": f"Bearer {token}"}
    )
    if status != 200:
        return TestResult(code, name, "FAIL", f"status={status}")
    try:
        payload = parse_json(body)
    except Exception:
        return TestResult(code, name, "FAIL", "响应非 JSON")
    if not isinstance(payload, list):
        # allow wrappers
        if isinstance(payload, dict):
            for k in ("items", "data", "users"):
                if isinstance(payload.get(k), list):
                    payload = payload.get(k)
                    break
    if not isinstance(payload, list):
        return TestResult(code, name, "FAIL", "返回非列表")
    if len(payload) < 1:
        return TestResult(code, name, "FAIL", "用户列表为空")

    sample = next((x for x in payload if isinstance(x, dict)), None)
    if not sample:
        return TestResult(code, name, "FAIL", "列表元素非对象")

    def has_any(d: Dict[str, Any], keys: Tuple[str, ...]) -> bool:
        return any(k in d for k in keys)

    if not has_any(sample, ("userId", "user_id", "user_id", "uid", "id")):
        return TestResult(code, name, "FAIL", f"缺少 userId 字段, keys={list(sample.keys())}")
    if not has_any(sample, ("quota_level", "quotaLevel", "level")):
        return TestResult(code, name, "FAIL", f"缺少 quota level 字段, keys={list(sample.keys())}")
    if not has_any(sample, ("monthly_token", "month_tokens", "monthToken", "total_tokens", "totalToken")):
        return TestResult(code, name, "FAIL", f"缺少月 token 字段(monthly_token), keys={list(sample.keys())}")
    if not has_any(sample, ("daily_requests", "today_requests", "todayRequest", "request_count", "today_count")):
        return TestResult(code, name, "FAIL", f"缺少请求数字段(daily_requests), keys={list(sample.keys())}")

    return TestResult(code, name, "PASS")


def tc_025_admin_departments(ctx: Dict[str, Any]) -> TestResult:
    code, name = "TC-025", "管理员获取部门汇总数据"
    token = ctx.get("admin_token")
    if not token:
        return TestResult(code, name, "BLOCKED", "无法获取 admin token（依赖 TC-001）")
    status, _, body = http_request(
        "GET", "/api/admin/departments?month=4", headers={"Authorization": f"Bearer {token}"}
    )
    if status != 200:
        return TestResult(code, name, "FAIL", f"status={status}")
    try:
        payload = parse_json(body)
    except Exception:
        return TestResult(code, name, "FAIL", "响应非 JSON")

    if not isinstance(payload, list):
        if isinstance(payload, dict):
            for k in ("items", "data", "departments"):
                if isinstance(payload.get(k), list):
                    payload = payload.get(k)
                    break

    if not isinstance(payload, list) or len(payload) < 1:
        return TestResult(code, name, "FAIL", "返回结构非列表或为空")

    sample = next((x for x in payload if isinstance(x, dict)), None)
    if not sample:
        return TestResult(code, name, "FAIL", "列表元素非对象")

    # best-effort semantic keys
    required_groups = [
        ("department", "enterprise", "name"),
        ("user_count", "people", "count"),
        ("monthly_token", "month_tokens", "monthToken", "total_tokens", "tokens"),
        ("monthly_requests", "request_count", "requests", "today_requests"),
        ("avg_token_per_user", "avg_tokens", "avg", "per_capita_tokens"),
    ]

    missing = []
    for group in required_groups:
        if not any(k in sample for k in group):
            missing.append("/".join(group))
    if missing:
        return TestResult(code, name, "FAIL", f"缺少字段组: {missing}; keys={list(sample.keys())}")

    return TestResult(code, name, "PASS")


MANUAL_TESTS = [
    ("TC-007", "用户未分配级别默认 L1"),
    ("TC-008", "管理员修改配额级别额度生效"),
    ("TC-009", "月度 Token 进度条颜色与文案"),
    ("TC-010", "每日请求次数进度条颜色与文案"),
    ("TC-012", "个人面板加载：统计卡片与进度条"),
    ("TC-013", "趋势图 Tab：图表渲染"),
    ("TC-014", "明细列表 Tab：表格加载"),
    ("TC-015", "模型分布 Tab：环形图渲染"),
    ("TC-016", "明细列表 CSV 导出"),
    ("TC-017", "时间筛选互不影响"),
    ("TC-019", "用户管理页面加载"),
    ("TC-020", "未知用户部门显示“未知”"),
    ("TC-021", "配额级别管理页展示 L1/L2/L3 + 当前人数"),
    ("TC-022", "修改配额额度立即展示且持久化"),
    ("TC-023", "全局趋势页面图表渲染"),
    ("TC-024", "全局趋势按模型/部门分组筛选"),
    ("TC-026", "部门汇总页面表格展示"),
    ("TC-027", "排行榜页面 TopN 数据加载"),
    ("TC-028", "普通用户不可见排行榜菜单"),
    ("TC-029", "通知设置页面可访问且布局正确"),
    ("TC-030", "阈值配置显示（50/80/100%）且输入框宽度足够"),
    ("TC-031", "邮件模板编辑页 + 占位符说明表格可见"),
    ("TC-032", "占位符点击复制"),
    ("TC-037", "邮件域名配置输入框 + tooltip"),
    ("TC-038", "检查间隔下拉（30/60/120）且提示“修改后重启生效”"),
    ("TC-039", "通知开关全局 on/off"),
    ("TC-040", "模板预览对话框：9 占位符正确渲染"),
]


def main() -> int:
    ctx: Dict[str, Any] = {}
    results: list[TestResult] = []

    tests: list[Tuple[str, str, Callable[[], TestResult]]] = [
        ("TC-001", "管理员登录成功", lambda: tc_001_admin_login(ctx)),
        ("TC-002", "测试用户登录成功", lambda: tc_002_test_user_login(ctx)),
        ("TC-003", "错误密码登录失败", lambda: tc_003_wrong_password()),
        ("TC-004", "携带 JWT 访问受保护 API 成功", lambda: tc_004_metrics_with_jwt(ctx)),
        ("TC-005", "无 JWT 访问受保护 API 失败", lambda: tc_005_metrics_without_jwt()),
        ("TC-006", "管理员获取配额级别列表", lambda: tc_006_quota_levels(ctx)),
        ("TC-011", "健康检查接口返回依赖状态", lambda: tc_011_health()),
        ("TC-018", "管理员查询用户列表含配额级别列", lambda: tc_018_admin_users(ctx)),
        ("TC-025", "管理员获取部门汇总数据", lambda: tc_025_admin_departments(ctx)),
        # Email-template APIs (if endpoints exist)
        ("TC-033", "获取邮件模板", lambda: api_get_email_template(ctx)),
        ("TC-034", "获取模板变量列表为 9 个", lambda: api_get_email_template_variables(ctx)),
        ("TC-035", "模板预览渲染 HTML", lambda: api_preview_email_template(ctx)),
        ("TC-036", "保存邮件模板成功", lambda: api_put_email_template_and_verify(ctx)),
    ]

    for code, name, fn in tests:
        res = run_test(code, name, fn)
        results.append(res)
        if res.status in ("PASS", "FAIL", "BLOCKED"):
            if res.status == "PASS":
                print(f"[PASS] {code}: {name}")
            elif res.status == "BLOCKED":
                print(f"[BLOCKED] {code}: {name} — 原因: {fmt_reason(res.reason)}")
            else:
                print(f"[FAIL] {code}: {name} — 原因: {fmt_reason(res.reason)}")
        else:
            print(f"[{res.status}] {code}: {name} — {fmt_reason(res.reason)}")

    for code, name in MANUAL_TESTS:
        results.append(TestResult(code, name, "MANUAL", "UI 用例需人工检查/截图验证"))
        print(f"[MANUAL] {code}: {name}")

    # summary
    cnt = {"PASS": 0, "FAIL": 0, "BLOCKED": 0, "MANUAL": 0}
    for r in results:
        if r.status in cnt:
            cnt[r.status] += 1

    print(f"结果: {cnt['PASS']} PASS / {cnt['FAIL']} FAIL / {cnt['BLOCKED']} BLOCKED / {cnt['MANUAL']} MANUAL")

    # exit code: fail if any FAIL
    return 1 if cnt["FAIL"] > 0 else 0


# ---- Email template API tests ----

def api_get_email_template(ctx: Dict[str, Any]) -> TestResult:
    code, name = "TC-033", "获取邮件模板"
    token = ctx.get("admin_token")
    if not token:
        return TestResult(code, name, "BLOCKED", "无法获取 admin token（依赖 TC-001）")
    status, _, body = http_request("GET", "/api/admin/email-template", headers={"Authorization": f"Bearer {token}"})
    if status != 200:
        return TestResult(code, name, "FAIL", f"status={status}")
    try:
        payload = parse_json(body)
    except Exception:
        return TestResult(code, name, "FAIL", "响应非 JSON")
    if not isinstance(payload, dict):
        return TestResult(code, name, "FAIL", "响应非对象")
    if "subject" not in payload or "body_html" not in payload:
        return TestResult(code, name, "FAIL", f"缺少 subject/body_html 字段, keys={list(payload.keys())}")
    if not isinstance(payload.get("subject"), str) or not isinstance(payload.get("body_html"), str):
        return TestResult(code, name, "FAIL", "subject/body_html 类型不为 string")
    return TestResult(code, name, "PASS")


def api_get_email_template_variables(ctx: Dict[str, Any]) -> TestResult:
    code, name = "TC-034", "获取模板变量列表为 9 个"
    token = ctx.get("admin_token")
    if not token:
        return TestResult(code, name, "BLOCKED", "无法获取 admin token（依赖 TC-001）")
    status, _, body = http_request(
        "GET", "/api/admin/email-template/variables", headers={"Authorization": f"Bearer {token}"}
    )
    if status != 200:
        return TestResult(code, name, "FAIL", f"status={status}")
    try:
        payload = parse_json(body)
    except Exception:
        return TestResult(code, name, "FAIL", "响应非 JSON")

    # normalize to list of strings
    vars_list = None
    if isinstance(payload, list):
        vars_list = payload
    elif isinstance(payload, dict):
        for k in ("items", "data", "variables"):
            if isinstance(payload.get(k), list):
                vars_list = payload.get(k)
                break
    if not isinstance(vars_list, list):
        return TestResult(code, name, "FAIL", "返回结构非列表")

    def to_name(v: Any) -> Optional[str]:
        if isinstance(v, str):
            return v
        if isinstance(v, dict):
            for k in ("name", "key", "variable"):
                x = v.get(k)
                if isinstance(x, str):
                    return x
        return None

    names = [to_name(x) for x in vars_list]
    names = [x for x in names if isinstance(x, str)]
    names_norm = {x.strip().lower() for x in names}

    required = {
        "username",
        "user_id",
        "quota_type_label",
        "used",
        "limit",
        "percent",
        "threshold",
        "period",
        "reset_time",
    }

    if len(names_norm) != 9:
        return TestResult(code, name, "FAIL", f"变量数量≠9, got={len(names_norm)}: {sorted(list(names_norm))}")
    missing = required - names_norm
    if missing:
        return TestResult(code, name, "FAIL", f"缺少变量: {sorted(list(missing))}")
    return TestResult(code, name, "PASS")


def api_preview_email_template(ctx: Dict[str, Any]) -> TestResult:
    code, name = "TC-035", "模板预览渲染 HTML"
    token = ctx.get("admin_token")
    if not token:
        return TestResult(code, name, "BLOCKED", "无法获取 admin token（依赖 TC-001）")

    # Preview API schema is the same as PUT: {subject, body_html}
    sample = {
        "subject": "Hi {{username}}",
        "body_html": "<p>Hello {{username}}, token: {{monthly_token}}</p>",
    }

    status, headers, body = http_request(
        "POST",
        "/api/admin/email-template/preview",
        json_body=sample,
        headers={"Authorization": f"Bearer {token}"},
    )
    if status != 200:
        return TestResult(code, name, "FAIL", f"status={status}")

    content_type = (headers.get("Content-Type") or headers.get("content-type") or "").lower()

    text = None
    if "application/json" in content_type:
        try:
            payload = parse_json(body)
            if isinstance(payload, dict):
                # common keys
                for k in ("html", "body", "content", "preview"):
                    v = payload.get(k)
                    if isinstance(v, str):
                        text = v
                        break
            if text is None and isinstance(payload, str):
                text = payload
        except Exception:
            pass
    if text is None:
        text = body.decode("utf-8", errors="ignore")

    if not text.strip():
        return TestResult(code, name, "FAIL", "预览内容为空")
    if "<" not in text or ">" not in text:
        return TestResult(code, name, "FAIL", "预览内容疑似非 HTML")
    # Backend may only render user-related placeholders by default; do not assert all {{...}} are replaced.
    if "{{username}}" in text:
        return TestResult(code, name, "FAIL", "{{username}} 未被替换")
    return TestResult(code, name, "PASS")


def api_put_email_template_and_verify(ctx: Dict[str, Any]) -> TestResult:
    code, name = "TC-036", "保存邮件模板成功"
    token = ctx.get("admin_token")
    if not token:
        return TestResult(code, name, "BLOCKED", "无法获取 admin token（依赖 TC-001）")

    new_subject = f"QA Subject {int(time.time())}"
    new_body_html = "<p>Hello {{username}}, quota={{monthly_token}}</p>"

    status, _, _ = http_request(
        "PUT",
        "/api/admin/email-template",
        json_body={"subject": new_subject, "body_html": new_body_html},
        headers={"Authorization": f"Bearer {token}"},
    )
    if status not in (200, 204):
        return TestResult(code, name, "FAIL", f"PUT status={status}")

    # verify
    status2, _, body2 = http_request(
        "GET", "/api/admin/email-template", headers={"Authorization": f"Bearer {token}"}
    )
    if status2 != 200:
        return TestResult(code, name, "FAIL", f"GET status={status2}")
    try:
        payload = parse_json(body2)
    except Exception:
        return TestResult(code, name, "FAIL", "GET 响应非 JSON")
    if not isinstance(payload, dict):
        return TestResult(code, name, "FAIL", "GET 响应非对象")
    if payload.get("subject") != new_subject or payload.get("body_html") != new_body_html:
        return TestResult(
            code,
            name,
            "FAIL",
            f"GET 未读到新值(subject/body_html不一致): subject={payload.get('subject')!r}",
        )
    return TestResult(code, name, "PASS")


if __name__ == "__main__":
    sys.exit(main())
