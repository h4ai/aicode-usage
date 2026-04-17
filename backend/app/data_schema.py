# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""ClickHouse field name constants for the otel.events table.

The ClickHouse DDL uses snake_case column names.  The requirements document
references camelCase aliases (e.g. ``userId``).  This module defines both
forms so that the rest of the application can import a single source of truth.
"""

# -- User / identity ----------------------------------------------------------
USER_ID = "user_id"
USERNAME = "username"
USER_NICKNAME = "user_nickname"
ENTERPRISE_ID = "enterprise_id"
ENTERPRISE = "enterprise"

# -- Timing / date ------------------------------------------------------------
EVENT_DATE = "event_date"
TIMESTAMP = "timestamp"

# -- Product / version --------------------------------------------------------
PRODUCT = "product"
EVENT_CODE = "event_code"

# -- Client environment -------------------------------------------------------
IDE_TYPE = "ide_type"
IDE_NAME = "ide_name"
EXT_NAME = "ext_name"

# -- Model --------------------------------------------------------------------
REQUEST_MODEL_NAME = "request_model_name"
REQUEST_MODEL_ID = "request_model_id"

# -- Token metrics ------------------------------------------------------------
INPUT_TOKEN = "input_token"
OUTPUT_TOKEN = "output_token"
TOTAL_TOKEN = "total_token"

# -- Request success ----------------------------------------------------------
IS_SUCCESSFUL = "is_successful"

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
