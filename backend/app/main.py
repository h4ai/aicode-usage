# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""FastAPI application entry-point."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import get_config
from app.routers import admin, auth, health, metrics, quota, tokens, v1
from app.services.database import init_db
from app.services.notification_v2 import check_quota_alerts

logger = logging.getLogger(__name__)


def _setup_logging() -> None:
    """Configure unified logging format for the application."""
    from app.auth_pat import PATFilter

    fmt = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"
    logging.basicConfig(level=logging.INFO, format=fmt, datefmt=datefmt, force=True)

    # Add PAT filter to root logger
    logging.getLogger().addFilter(PATFilter())

    # Suppress noisy third-party loggers
    for noisy in ("jwt", "apscheduler", "passlib", "multipart", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    # uvicorn access stays INFO; uvicorn.error goes WARNING
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)
    logging.getLogger("uvicorn.error").setLevel(logging.WARNING)


_setup_logging()


async def _check_smtp() -> None:
    """Non-blocking SMTP connectivity probe. Logs warning on failure, never blocks startup."""
    cfg = get_config().get("smtp", {})
    host = cfg.get("host", "")
    port = int(cfg.get("port", 25))
    if not host or host == "mailrelay.internal.company.com":
        logger.warning("SMTP not configured (host=%s), email notifications disabled", host)
        return
    import aiosmtplib
    try:
        client = aiosmtplib.SMTP(hostname=host, port=port)
        await asyncio.wait_for(client.connect(), timeout=5.0)
        await client.quit()
        logger.info("SMTP connectivity check passed: %s:%d", host, port)
    except Exception as e:
        logger.warning("SMTP connectivity check failed: %s:%d — %s", host, port, e)


def _cleanup_old_notifications() -> None:
    """Run old email notification cleanup at startup."""
    from app.services.database import cleanup_old_email_notifications
    try:
        deleted = cleanup_old_email_notifications(180)
        if deleted > 0:
            logger.info("Cleaned up %d old email notification records (>180 days)", deleted)
    except Exception as e:
        logger.warning("Email notification cleanup failed: %s", e)


_scheduler = BackgroundScheduler()


def _startup() -> None:
    """Synchronous startup logic (DB init, cleanup, scheduler)."""
    init_db()
    _cleanup_old_notifications()
    cfg = get_config()
    notif_cfg = cfg.get("notification", {})
    if notif_cfg.get("enabled", True) is not False:
        interval = notif_cfg.get("check_interval_minutes", 60)
        _scheduler.add_job(check_quota_alerts, "interval", minutes=interval, id="quota_alerts")
        _scheduler.start()
        logger.info("APScheduler started: quota_alerts job scheduled every %d min", interval)
    else:
        logger.info("Notification disabled, skipping scheduler")


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[arg-type]
    _startup()
    asyncio.create_task(_check_smtp())
    yield
    _scheduler.shutdown(wait=False)

# ---------------------------------------------------------------------------
# Rate limiter (shared instance, imported by routers)
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

app = FastAPI(title="AI Code Usage API", version="0.1.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# CORS: read from config.yaml security.cors_origins; default ["*"] for backward-compat
_cors_origins = get_config().get("security", {}).get("cors_origins", ["*"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security headers middleware — applies to ALL responses globally
from starlette.middleware.base import BaseHTTPMiddleware  # noqa: E402
from starlette.requests import Request as StarletteRequest  # noqa: E402


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response

app.add_middleware(SecurityHeadersMiddleware)

@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Custom error format for PAT routes (/api/v1/ and /api/tokens)."""
    if request.url.path.startswith("/api/v1") or request.url.path.startswith("/api/tokens"):
        code_map = {
            401: "unauthorized",
            403: "forbidden",
            429: "too_many_requests",
            400: "bad_request",
            404: "not_found",
        }
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": code_map.get(exc.status_code, "error"),
                "message": str(exc.detail),
                "code": exc.status_code,
            },
            headers=dict(exc.headers) if exc.headers else {},
        )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def _global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled exception: %s %s - %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(quota.router)
app.include_router(metrics.router)
app.include_router(admin.router)
app.include_router(tokens.router, prefix="/api")
app.include_router(v1.router, prefix="/api/v1")
