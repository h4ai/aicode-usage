#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Playwright screenshot script (NO UI login).

Why:
- Frontend route guard only checks localStorage keys: token/role/username.
- LDAP may be unavailable; do NOT rely on UI login.

What this script does:
1) Call backend API to get JWT token(s)
2) Inject token/role/username into localStorage via page.add_init_script
3) Navigate to target pages and take screenshots

Notes:
- This script ONLY writes files. PM will decide whether to execute.
- Requires: playwright (python) and browsers installed.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

import requests
from playwright.sync_api import Browser, Error, Page, TimeoutError, sync_playwright


# ----------------------------
# Configuration
# ----------------------------

FRONTEND_BASE = os.getenv("FRONTEND_BASE", "http://127.0.0.1:3002")
BACKEND_BASE = os.getenv("BACKEND_BASE", "http://127.0.0.1:8002")

# Output directory for 19 screenshots
OUT_DIR = Path(
    os.getenv("SCREENSHOT_DIR", "/data/workspaces/ai-code-usage/qa/screenshots/full-e2e/")
)

# Credentials
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

TEST_USERNAME = os.getenv("TEST_USERNAME", "uid_001")
TEST_PASSWORD = os.getenv("TEST_PASSWORD", "test123")

# localStorage keys (confirmed in frontend/src/stores/auth.ts)
LS_TOKEN_KEY = "token"
LS_ROLE_KEY = "role"
LS_USERNAME_KEY = "username"

# Viewport
VIEWPORT = {"width": 1920, "height": 1080}

# Timeouts
NAV_TIMEOUT_MS = int(os.getenv("NAV_TIMEOUT_MS", "45000"))
WAIT_AFTER_NAV_MS = int(os.getenv("WAIT_AFTER_NAV_MS", "800"))


@dataclass
class AuthBundle:
    token: str
    role: str
    username: str


def _now_ts() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def _print(msg: str) -> None:
    print(f"[{_now_ts()}] {msg}")


def get_admin_token() -> AuthBundle:
    """Admin token via /api/auth/login (works even when LDAP is down)."""
    url = f"{BACKEND_BASE}/api/auth/login"
    payload = {"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
    _print(f"POST {url}  (admin)")
    r = requests.post(url, json=payload, timeout=15)
    # Expected: {"token": "...", "role": "admin"}
    try:
        data = r.json()
    except Exception:
        raise RuntimeError(f"Admin login non-JSON response: status={r.status_code}, body={r.text[:500]}")
    if r.status_code != 200:
        raise RuntimeError(f"Admin login failed: status={r.status_code}, body={json.dumps(data, ensure_ascii=False)[:500]}")
    token = data.get("token")
    role = data.get("role")
    if not token or not role:
        raise RuntimeError(f"Admin login response missing token/role: {json.dumps(data, ensure_ascii=False)}")
    return AuthBundle(token=token, role=role, username=ADMIN_USERNAME)


def get_test_user_token() -> AuthBundle:
    """Test user token via /api/auth/test-login.

    IMPORTANT:
    - backend/app/routers/auth.py gates this endpoint with config.yaml:
      auth.allow_test_login must be true; otherwise it returns 404.

    If 404 occurs, we raise a clear error (do not fall back to UI login).
    """
    url = f"{BACKEND_BASE}/api/auth/test-login"
    payload = {"username": TEST_USERNAME, "password": TEST_PASSWORD}
    _print(f"POST {url}  (test user)")
    r = requests.post(url, json=payload, timeout=15)
    try:
        data = r.json()
    except Exception:
        raise RuntimeError(f"Test-login non-JSON response: status={r.status_code}, body={r.text[:500]}")

    if r.status_code == 404:
        raise RuntimeError(
            "Test-login endpoint is disabled (404). "
            "Set backend config.yaml: auth.allow_test_login: true, then restart backend. "
            f"body={json.dumps(data, ensure_ascii=False)}"
        )

    if r.status_code != 200:
        raise RuntimeError(f"Test-login failed: status={r.status_code}, body={json.dumps(data, ensure_ascii=False)[:800]}")

    token = data.get("token")
    role = data.get("role")
    if not token or not role:
        raise RuntimeError(f"Test-login response missing token/role: {json.dumps(data, ensure_ascii=False)}")
    return AuthBundle(token=token, role=role, username=TEST_USERNAME)


def build_storage_init_script(auth: AuthBundle) -> str:
    """Inject auth into localStorage before any page scripts run."""
    # Use json.dumps to safely escape characters
    token_js = json.dumps(auth.token)
    role_js = json.dumps(auth.role)
    username_js = json.dumps(auth.username)

    return f"""
(() => {{
  try {{
    localStorage.setItem({json.dumps(LS_TOKEN_KEY)}, {token_js});
    localStorage.setItem({json.dumps(LS_ROLE_KEY)}, {role_js});
    localStorage.setItem({json.dumps(LS_USERNAME_KEY)}, {username_js});
  }} catch (e) {{
    console.error('Failed to set auth localStorage', e);
  }}
}})();
""".strip()


def ensure_out_dir() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)


def goto_and_shot(page: Page, path: str, filename: str, *, wait_networkidle: bool = True) -> None:
    url = f"{FRONTEND_BASE}{path}"
    out_path = OUT_DIR / filename

    _print(f"goto {url} -> {out_path}")
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
        if wait_networkidle:
            page.wait_for_load_state("networkidle", timeout=NAV_TIMEOUT_MS)
        # small settle time for charts/layout
        page.wait_for_timeout(WAIT_AFTER_NAV_MS)
        page.screenshot(path=str(out_path), full_page=True)
    except TimeoutError as e:
        # still try screenshot for debugging
        _print(f"TIMEOUT on {url}: {e}")
        page.screenshot(path=str(out_path), full_page=True)
    except Error as e:
        _print(f"Playwright error on {url}: {e}")
        page.screenshot(path=str(out_path), full_page=True)


def make_context(browser: Browser, auth: Optional[AuthBundle]) -> Page:
    context = browser.new_context(viewport=VIEWPORT)
    if auth is not None:
        context.add_init_script(build_storage_init_script(auth))
    page = context.new_page()
    return page


def screenshot_admin_tabs(browser: Browser, admin_auth: AuthBundle) -> None:
    """Admin UX is single route /admin with tabs rather than /admin/* routes.

    We navigate to /admin and click each tab label, taking 1 screenshot per tab.
    """
    page = make_context(browser, admin_auth)

    # 09 - Users tab (default)
    goto_and_shot(page, "/admin", "09-admin-users.png")

    # Helper: click Element Plus tab label by visible text
    def click_tab(label: str) -> None:
        # el-tabs renders .el-tabs__item with the label text
        page.locator(".el-tabs__item", has_text=label).first.click(timeout=NAV_TIMEOUT_MS)
        page.wait_for_load_state("networkidle", timeout=NAV_TIMEOUT_MS)
        page.wait_for_timeout(WAIT_AFTER_NAV_MS)

    # 10 - Departments (label: 分组汇总)
    try:
        click_tab("分组汇总")
    finally:
        page.screenshot(path=str(OUT_DIR / "10-admin-departments.png"), full_page=True)

    # 11 - Quota levels (label: 配额级别)
    try:
        click_tab("配额级别")
    finally:
        page.screenshot(path=str(OUT_DIR / "11-admin-quota-levels.png"), full_page=True)

    # 12 - Notification config (label: 通知设置)
    try:
        click_tab("通知设置")
    finally:
        page.screenshot(path=str(OUT_DIR / "12-admin-notification-config.png"), full_page=True)

    # 13 - Working hours (label: 工作时段)
    try:
        click_tab("工作时段")
    finally:
        page.screenshot(path=str(OUT_DIR / "13-admin-working-hours.png"), full_page=True)

    # 14 - Email template is part of 通知设置 page (same tab)
    # We keep in 通知设置 tab and attempt to click the "邮件模板" segment if present.
    # If UI differs, this screenshot will still capture current NotificationSettings.
    try:
        click_tab("通知设置")
        # Best-effort: click button/text that indicates email template section
        page.get_by_text("邮件模板", exact=False).first.click(timeout=5000)
        page.wait_for_timeout(WAIT_AFTER_NAV_MS)
    except Exception:
        pass
    page.screenshot(path=str(OUT_DIR / "14-admin-email-template.png"), full_page=True)

    # 15 - Email template preview: best-effort click "预览" button
    try:
        page.get_by_role("button", name="预览", exact=False).first.click(timeout=5000)
        page.wait_for_timeout(WAIT_AFTER_NAV_MS)
    except Exception:
        pass
    page.screenshot(path=str(OUT_DIR / "15-admin-email-template-preview.png"), full_page=True)

    # 16 - Leaderboard (label: 用量排行)
    try:
        click_tab("用量排行")
    finally:
        page.screenshot(path=str(OUT_DIR / "16-admin-leaderboard.png"), full_page=True)

    # 17 - Admin trend (label: 全局趋势)
    try:
        click_tab("全局趋势")
    finally:
        page.screenshot(path=str(OUT_DIR / "17-admin-trend.png"), full_page=True)

    # close context
    page.context.close()


def validate_sizes() -> None:
    """Basic sanity check: ensure files exist and not all same size."""
    files = sorted(OUT_DIR.glob("*.png"))
    if not files:
        _print("No screenshots found to validate")
        return
    sizes = [f.stat().st_size for f in files]
    uniq = len(set(sizes))
    _print(f"Screenshots: {len(files)} files, unique sizes: {uniq}")


def main() -> None:
    ensure_out_dir()

    # Tokens
    admin_auth = get_admin_token()

    # user token (may be disabled in current config)
    user_auth = get_test_user_token()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # Public pages
        page_public = make_context(browser, None)
        goto_and_shot(page_public, "/", "01-home.png")
        goto_and_shot(page_public, "/login", "02-login.png")
        page_public.context.close()

        # User pages (NOTE: metrics pages are components on /dashboard, but we also keep
        # the requested paths as separate shots. If these routes do not exist, screenshots
        # will reflect 404/redirect content and should be adjusted.)
        page_user = make_context(browser, user_auth)
        goto_and_shot(page_user, "/dashboard", "03-dashboard.png")
        goto_and_shot(page_user, "/metrics/summary", "04-metrics-summary.png")
        goto_and_shot(page_user, "/metrics/detail", "05-metrics-detail.png")
        goto_and_shot(page_user, "/metrics/trend", "06-metrics-trend.png")
        goto_and_shot(page_user, "/metrics/model", "07-model-distribution.png")
        goto_and_shot(page_user, "/quota", "08-quota.png")
        page_user.context.close()

        # Admin pages (single /admin with tabs)
        screenshot_admin_tabs(browser, admin_auth)

        # 18 - 404 probe (frontend)
        page_probe = make_context(browser, user_auth)
        goto_and_shot(page_probe, "/nonexistent-page", "18-404-probe.png", wait_networkidle=False)
        page_probe.context.close()

        browser.close()

    # 19 - health probe (backend). Not a browser screenshot; save as a tiny PNG-like?
    # Requirement says screenshot, but endpoint is backend /health. We will save a text
    # artifact alongside. If you REQUIRE png, change to browser rendering of /health.
    health_url = f"{BACKEND_BASE}/health"
    _print(f"GET {health_url} -> 19-health-probe.txt")
    try:
        r = requests.get(health_url, timeout=10)
        (OUT_DIR / "19-health-probe.txt").write_text(
            f"status={r.status_code}\nheaders={dict(r.headers)}\n\n{r.text}\n",
            encoding="utf-8",
        )
    except Exception as e:
        (OUT_DIR / "19-health-probe.txt").write_text(f"health probe failed: {e}\n", encoding="utf-8")

    validate_sizes()


if __name__ == "__main__":
    main()
