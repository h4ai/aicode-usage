# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
#
# 无 apt-get 版本：适用于无法访问系统包管理器的金融内网环境
# - python-ldap → ldap3（纯 Python，无需 libldap2-dev/libsasl2-dev）
# - psycopg2-binary（预编译 wheel，无需 libpq-dev/gcc）

FROM python:3.11-slim

WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY . .

EXPOSE 8002
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
