# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""FastAPI application entry-point."""

from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_config
from app.routers import admin, auth, health, metrics, quota
from app.services.database import init_db
from app.services.notification_v2 import check_quota_alerts

logger = logging.getLogger(__name__)

app = FastAPI(title="AI Code Usage API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(quota.router)
app.include_router(metrics.router)
app.include_router(admin.router)

_scheduler = BackgroundScheduler()


@app.on_event("startup")
def _startup() -> None:
    init_db()
    cfg = get_config()
    notif_cfg = cfg.get("notification", {})
    if notif_cfg.get("enabled", True) is False:
        logger.info("Notification disabled, skipping scheduler")
        return
    interval = notif_cfg.get("check_interval_minutes", 60)
    _scheduler.add_job(check_quota_alerts, "interval", minutes=interval, id="quota_alerts")
    _scheduler.start()
    logger.info("APScheduler started: quota_alerts job scheduled every %d min", interval)


@app.on_event("shutdown")
def _shutdown() -> None:
    _scheduler.shutdown(wait=False)
