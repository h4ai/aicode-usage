# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""FastAPI application entry-point."""

from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import admin, auth, health, metrics, quota
from app.services.database import init_db
from app.services.notification import check_quota_alerts

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
    _scheduler.add_job(check_quota_alerts, "interval", hours=1, id="quota_alerts")
    _scheduler.start()
    logger.info("APScheduler started: quota_alerts job scheduled every 1h")


@app.on_event("shutdown")
def _shutdown() -> None:
    _scheduler.shutdown(wait=False)
