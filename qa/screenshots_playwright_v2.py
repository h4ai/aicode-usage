#!/usr/bin/env python3
"""Playwright screenshot script v2 - PM reviewed & fixed.

Key fixes vs v1:
1. Use admin token for ALL pages (test-login is disabled/404)
2. Only 2 real routes: /dashboard and /admin (no /metrics/*, /quota)
3. Dashboard is single page with all metrics - scroll to capture sections
4. Admin is single page with tabs - click each tab
5. Health probe as browser screenshot (not txt)
"""

import json
import os
import sys
import time
from pathlib import Path

import requests


FRONTEND = "http://127.0.0.1:3002"
BACKEND = "http://127.0.0.1:8002"
OUT_DIR = Path("/data/workspaces/ai-code-usage/qa/screenshots/full-e2e/")
OUT_DIR.mkdir(parents=True, exist_ok=True)

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}")

# Step 1: Get admin token
log("Getting admin token...")
r = requests.post(f"{BACKEND}/api/auth/login", json={"username": "admin", "password": "admin123"}, timeout=15)
assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text[:300]}"
data = r.json()
ADMIN_TOKEN = data["token"]
ADMIN_ROLE = data.get("role", "admin")
log(f"Admin token OK, role={ADMIN_ROLE}")

# Try test-login for user token (may be 404)
USER_TOKEN = None
USER_ROLE = "user"
try:
    r2 = requests.post(f"{BACKEND}/api/auth/test-login", json={"username": "uid_001", "password": "test123"}, timeout=15)
    if r2.status_code == 200:
        d2 = r2.json()
        USER_TOKEN = d2["token"]
        USER_ROLE = d2.get("role", "user")
        log("User token OK")
    else:
        log(f"test-login returned {r2.status_code}, will use admin token for dashboard")
except Exception as e:
    log(f"test-login failed: {e}, will use admin token for dashboard")

# Use user token if available, else admin
DASH_TOKEN = USER_TOKEN or ADMIN_TOKEN
DASH_ROLE = USER_ROLE if USER_TOKEN else ADMIN_ROLE
DASH_USER = "uid_001" if USER_TOKEN else "admin"

from playwright.sync_api import sync_playwright

INIT_SCRIPT_TEMPLATE = """
(() => {{
  localStorage.setItem('token', {token});
  localStorage.setItem('role', {role});
  localStorage.setItem('username', {username});
}})();
"""

def make_init_script(token, role, username):
    return INIT_SCRIPT_TEMPLATE.format(
        token=json.dumps(token),
        role=json.dumps(role),
        username=json.dumps(username),
    )

def shot(page, path, filename, wait_net=True, scroll_bottom=False):
    url = f"{FRONTEND}{path}"
    out = OUT_DIR / filename
    log(f"  {filename}: {url}")
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        if wait_net:
            page.wait_for_load_state("networkidle", timeout=30000)
        page.wait_for_timeout(1500)  # extra settle for charts
        if scroll_bottom:
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(800)
        page.screenshot(path=str(out), full_page=True)
    except Exception as e:
        log(f"  ERROR: {e}")
        try:
            page.screenshot(path=str(out), full_page=True)
        except:
            pass

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    vp = {"width": 1920, "height": 1080}

    # === Public pages (no auth) ===
    log("=== Public pages ===")
    ctx = browser.new_context(viewport=vp)
    pg = ctx.new_page()
    shot(pg, "/login", "02-login.png")
    ctx.close()

    # === Dashboard (user or admin) ===
    log("=== Dashboard pages ===")
    ctx = browser.new_context(viewport=vp)
    ctx.add_init_script(make_init_script(DASH_TOKEN, DASH_ROLE, DASH_USER))
    pg = ctx.new_page()

    # 01 - home (redirects to dashboard)
    shot(pg, "/", "01-home.png")

    # 03 - dashboard top
    shot(pg, "/dashboard", "03-dashboard.png")

    # 04~08: scroll dashboard to capture different sections
    # Dashboard is one long page with: summary cards, trend chart, model dist, quota, detail table
    log("  Scrolling dashboard for section shots...")
    pg.goto(f"{FRONTEND}/dashboard", wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_load_state("networkidle", timeout=30000)
    pg.wait_for_timeout(2000)

    # 04 - metrics summary (top cards area)
    pg.screenshot(path=str(OUT_DIR / "04-metrics-summary.png"), clip={"x": 0, "y": 0, "width": 1920, "height": 400})

    # Scroll down and capture sections
    pg.evaluate("window.scrollTo(0, 400)")
    pg.wait_for_timeout(800)
    pg.screenshot(path=str(OUT_DIR / "05-metrics-detail.png"), full_page=False)

    pg.evaluate("window.scrollTo(0, 800)")
    pg.wait_for_timeout(800)
    pg.screenshot(path=str(OUT_DIR / "06-metrics-trend.png"), full_page=False)

    pg.evaluate("window.scrollTo(0, 1200)")
    pg.wait_for_timeout(800)
    pg.screenshot(path=str(OUT_DIR / "07-model-distribution.png"), full_page=False)

    pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    pg.wait_for_timeout(800)
    pg.screenshot(path=str(OUT_DIR / "08-quota.png"), full_page=False)

    ctx.close()

    # === Admin pages (tabs) ===
    log("=== Admin pages ===")
    ctx = browser.new_context(viewport=vp)
    ctx.add_init_script(make_init_script(ADMIN_TOKEN, "admin", "admin"))
    pg = ctx.new_page()

    pg.goto(f"{FRONTEND}/admin", wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_load_state("networkidle", timeout=30000)
    pg.wait_for_timeout(2000)

    # 09 - Users tab (default)
    pg.screenshot(path=str(OUT_DIR / "09-admin-users.png"), full_page=True)
    log("  09-admin-users.png")

    def click_tab(label, filename):
        try:
            tab = pg.locator(".el-tabs__item", has_text=label).first
            tab.click(timeout=5000)
            pg.wait_for_load_state("networkidle", timeout=15000)
            pg.wait_for_timeout(1500)
        except Exception as e:
            log(f"  Tab '{label}' click failed: {e}")
        pg.screenshot(path=str(OUT_DIR / filename), full_page=True)
        log(f"  {filename} (tab: {label})")

    click_tab("分组汇总", "10-admin-departments.png")
    click_tab("配额级别", "11-admin-quota-levels.png")
    click_tab("通知设置", "12-admin-notification-config.png")
    click_tab("工作时段", "13-admin-working-hours.png")

    click_tab("用量排行", "16-admin-leaderboard.png")
    click_tab("全局趋势", "17-admin-trend.png")

    # 14 - email template (inside 通知设置 tab)
    try:
        pg.locator(".el-tabs__item", has_text="通知设置").first.click(timeout=5000)
        pg.wait_for_timeout(1000)
        pg.get_by_text("邮件模板", exact=False).first.click(timeout=5000)
        pg.wait_for_timeout(1000)
    except:
        pass
    pg.screenshot(path=str(OUT_DIR / "14-admin-email-template.png"), full_page=True)
    log("  14-admin-email-template.png")

    # 15 - email preview (opens modal; keep it last to avoid blocking other tabs)
    try:
        pg.get_by_role("button", name="预览").first.click(timeout=5000)
        pg.wait_for_timeout(1000)
    except:
        pass
    pg.screenshot(path=str(OUT_DIR / "15-admin-email-template-preview.png"), full_page=True)
    log("  15-admin-email-template-preview.png")

    ctx.close()

    # === Probe pages ===
    log("=== Probe pages ===")
    ctx = browser.new_context(viewport=vp)
    ctx.add_init_script(make_init_script(DASH_TOKEN, DASH_ROLE, DASH_USER))
    pg = ctx.new_page()
    shot(pg, "/nonexistent-page", "18-404-probe.png", wait_net=False)

    # 19 - health (backend endpoint rendered in browser)
    pg.goto(f"{BACKEND}/health", wait_until="domcontentloaded", timeout=15000)
    pg.wait_for_timeout(500)
    pg.screenshot(path=str(OUT_DIR / "19-health-probe.png"))
    log("  19-health-probe.png")
    ctx.close()

    browser.close()

# Validate
files = sorted(OUT_DIR.glob("*.png"))
sizes = {f.name: f.stat().st_size for f in files}
log(f"\n=== Results: {len(files)} screenshots ===")
for name, size in sizes.items():
    log(f"  {name}: {size:,} bytes")

unique_sizes = len(set(sizes.values()))
log(f"Unique sizes: {unique_sizes}/{len(files)}")
if unique_sizes < len(files) * 0.5:
    log("⚠️ WARNING: Many screenshots have same size - possible login failure!")
else:
    log("✅ Screenshots look diverse")
