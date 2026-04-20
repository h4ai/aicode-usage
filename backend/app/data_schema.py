# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""ClickHouse field name constants for the otel.events table.

The ClickHouse DDL uses snake_case column names.  The requirements document
references camelCase aliases (e.g. ``userId``).  This module defines both
forms so that the rest of the application can import a single source of truth.
"""

# -- User / identity ----------------------------------------------------------
# NOTE: ClickHouse otel.events table uses camelCase column names
USER_ID = "userId"
USERNAME = "username"
USERNAME = "username"
USER_NICKNAME = "userNickname"
ENTERPRISE_ID = "enterpriseId"
ENTERPRISE = "enterprise"

# -- Timing / date ------------------------------------------------------------
EVENT_DATE = "event_date"
TIMESTAMP = "timestamp"

# -- Product / version --------------------------------------------------------
PRODUCT = "product"
EVENT_CODE = "eventCode"

# -- Client environment -------------------------------------------------------
IDE_TYPE = "ideType"
IDE_NAME = "ideName"
EXT_NAME = "extName"

# -- Model --------------------------------------------------------------------
REQUEST_MODEL_NAME = "requestModelName"
REQUEST_MODEL_ID = "requestModelId"

# -- Token metrics ------------------------------------------------------------
INPUT_TOKEN = "inputToken"
OUTPUT_TOKEN = "outputToken"
TOTAL_TOKEN = "totalToken"

# -- Request success ----------------------------------------------------------
IS_SUCCESSFUL = "isSuccessful"

# -- camelCase aliases (used in requirements / API responses) ------------------
CAMEL_MAP: dict[str, str] = {
    USER_ID: "userId",
    USERNAME: "username",
    USER_NICKNAME: "userNickname",
    ENTERPRISE_ID: "enterpriseId",
    ENTERPRISE: "enterprise",
    EVENT_DATE: "eventDate",
    REQUEST_MODEL_NAME: "requestModelName",
    IDE_TYPE: "ideType",
    INPUT_TOKEN: "inputToken",
    OUTPUT_TOKEN: "outputToken",
    TOTAL_TOKEN: "totalToken",
    IS_SUCCESSFUL: "isSuccessful",
}
