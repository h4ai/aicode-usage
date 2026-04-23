#!/usr/bin/env python3
"""
AI Code Usage Query Script
Usage: python3 query.py <command> [options]

Commands:
  summary          Personal usage summary
  quota            Personal quota status
  detail           Personal usage detail records
  leaderboard      Admin: usage leaderboard
  users            Admin: user list
  department-summary  Admin: department summary

Configuration (in order of precedence):
  1. AICODE_PAT / AICODE_BASE_URL environment variables
  2. ~/.aicode-usage.conf  (PAT=... / BASE_URL=...)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


# ── Config loading ────────────────────────────────────────────────────────────

def _load_conf() -> dict[str, str]:
    conf_path = os.path.expanduser("~/.aicode-usage.conf")
    conf: dict[str, str] = {}
    if os.path.exists(conf_path):
        with open(conf_path) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    conf[k.strip()] = v.strip()
    return conf


def _get_config() -> tuple[str, str]:
    conf = _load_conf()
    pat = os.environ.get("AICODE_PAT") or conf.get("PAT", "")
    base = os.environ.get("AICODE_BASE_URL") or conf.get("BASE_URL", "http://localhost:8002")
    if not pat:
        print(
            "ERROR: AICODE_PAT not set.\n"
            "Set via: export AICODE_PAT=pat_xxx\n"
            "Or create ~/.aicode-usage.conf with: PAT=pat_xxx",
            file=sys.stderr,
        )
        sys.exit(1)
    return pat, base.rstrip("/")


# ── HTTP helper ───────────────────────────────────────────────────────────────

def _call(path: str, params: dict | None = None) -> dict | list:
    pat, base = _get_config()
    url = f"{base}{path}"
    if params:
        filtered = {k: v for k, v in params.items() if v is not None}
        if filtered:
            url += "?" + urlencode(filtered)

    req = Request(url, headers={"Authorization": f"Bearer {pat}", "Accept": "application/json"})
    try:
        with urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        body = e.read().decode()
        try:
            err = json.loads(body)
            msg = err.get("message") or err.get("detail") or body
            code = err.get("code") or e.code
        except Exception:
            msg, code = body, e.code
        print(f"ERROR {code}: {msg}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


def _out(data: dict | list) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


# ── Commands ──────────────────────────────────────────────────────────────────

def cmd_summary(args: argparse.Namespace) -> None:
    params = {"scope": args.scope, "time_filter": args.time_filter}
    _out(_call("/api/v1/usage/summary", params))


def cmd_quota(_: argparse.Namespace) -> None:
    _out(_call("/api/v1/usage/quota"))


def cmd_detail(args: argparse.Namespace) -> None:
    params = {
        "start": args.start,
        "end": args.end,
        "days": args.days,
        "model": args.model,
        "ide_type": args.ide_type,
        "sort_by": args.sort_by,
        "sort_order": args.sort_order,
    }
    _out(_call("/api/v1/usage/detail", params))


def cmd_leaderboard(args: argparse.Namespace) -> None:
    params = {
        "top": args.top,
        "time_filter": args.time_filter,
        "start": args.start,
        "end": args.end,
        "page": args.page,
        "page_size": args.page_size,
    }
    _out(_call("/api/v1/admin/leaderboard", params))


def cmd_users(args: argparse.Namespace) -> None:
    params = {
        "page": args.page,
        "page_size": args.page_size,
        "year": args.year,
        "month": args.month,
    }
    _out(_call("/api/v1/admin/users", params))


def cmd_department_summary(args: argparse.Namespace) -> None:
    params = {
        "time_filter": args.time_filter,
        "start": args.start,
        "end": args.end,
    }
    _out(_call("/api/v1/admin/department-summary", params))


# ── Argument parser ───────────────────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="AI Code Usage Query CLI")
    sub = p.add_subparsers(dest="command", required=True)

    # summary
    s = sub.add_parser("summary", help="Personal usage summary")
    s.add_argument("--scope", default="month", choices=["month", "week", "today"])
    s.add_argument("--time-filter", dest="time_filter", default="all",
                   choices=["all", "work", "non_work"])

    # quota
    sub.add_parser("quota", help="Personal quota status")

    # detail
    d = sub.add_parser("detail", help="Personal usage detail records")
    d.add_argument("--start", help="Start date YYYY-MM-DD")
    d.add_argument("--end", help="End date YYYY-MM-DD")
    d.add_argument("--days", type=int, default=30, help="Lookback days (if no start/end)")
    d.add_argument("--model", help="Filter by model name")
    d.add_argument("--ide-type", dest="ide_type", help="Filter by IDE type")
    d.add_argument("--sort-by", dest="sort_by",
                   choices=["date", "model", "request_count",
                            "input_token", "output_token", "total_token"])
    d.add_argument("--sort-order", dest="sort_order", default="desc",
                   choices=["asc", "desc"])

    # leaderboard (admin)
    lb = sub.add_parser("leaderboard", help="Admin: usage leaderboard")
    lb.add_argument("--top", type=int, help="Top N users")
    lb.add_argument("--time-filter", dest="time_filter", default="all",
                    choices=["all", "work", "non_work"])
    lb.add_argument("--start")
    lb.add_argument("--end")
    lb.add_argument("--page", type=int, default=1)
    lb.add_argument("--page-size", dest="page_size", type=int, default=50)

    # users (admin)
    u = sub.add_parser("users", help="Admin: user list")
    u.add_argument("--page", type=int, default=1)
    u.add_argument("--page-size", dest="page_size", type=int, default=50)
    u.add_argument("--year", type=int)
    u.add_argument("--month", type=int)

    # department-summary (admin)
    ds = sub.add_parser("department-summary", help="Admin: department usage summary")
    ds.add_argument("--time-filter", dest="time_filter", default="all",
                    choices=["all", "work", "non_work"])
    ds.add_argument("--start")
    ds.add_argument("--end")

    return p


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    dispatch = {
        "summary": cmd_summary,
        "quota": cmd_quota,
        "detail": cmd_detail,
        "leaderboard": cmd_leaderboard,
        "users": cmd_users,
        "department-summary": cmd_department_summary,
    }
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
