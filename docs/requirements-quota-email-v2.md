# 需求文档：配额邮件通知增强（v0.3）

**版本**：v0.3 | **状态**：已确认，待开发
**分支**：`feature/quota-email-v2`（从 main 拉取）
**更新日期**：2026-04-21

---

## 一、背景与现状

当前系统已有基础邮件通知（`notification.py`）：

- 固定 80% 阈值，每月只发一次
- 仅检查月度 Token
- 邮件内容硬编码，不可配置
- 发送记录存于 PG `email_alerts` 表（字段过少，不支持多阈值）

本次在此基础上全面增强，同时保持向前兼容。

---

## 二、功能需求

### 2.1 配额项自适应

| 配额项 | 周期 | 为 0 时行为 |
|--------|------|------------|
| 月度 Token（`monthly_token`） | 每月 | 跳过，不提醒 |
| 日对话轮次（`daily_chats`） | 每日 | 跳过，不提醒 |

> 日对话轮次在上海时间 00:00 自然日切换时自动清空（`period_key` 按日区分即可）

---

### 2.2 多阈值提醒（3档，可配置）

```yaml
notification:
  thresholds: [50, 80, 100]   # 单项配置为 0 则忽略该档
```

- 每个阈值在同一周期内**只触发一次**（月度按自然月，日度按自然日）
- 阈值 100% = 超限，预留 `on_over_limit(user_id, quota_type)` 钩子
  - 当前：仅记录日志
  - 后续：接入本系统关闭用户模型访问 API（**本系统 API，当前未实现，预留接口位置即可**）

---

### 2.3 定时任务配置

```yaml
notification:
  enabled: true
  check_interval_minutes: 60    # 支持 30 / 60 / 120，默认 60
```

- 运行环境：**OpenShift（内置调度器）**，使用 **APScheduler** 实现定时任务
- APScheduler 已在现有代码中使用，OpenShift 环境下正常工作，无需额外适配

---

### 2.4 邮件地址构成

优先级：
1. AD 属性 `mail` 字段（有值直接使用）— **LDAP 认证已实现，mail 字段已获取**
2. `mail` 为空时：`{sAMAccountName}@{email_domain}` 自动拼接

```yaml
notification:
  email_domain: "example.com"   # 自动拼接域名，必填
```

---

### 2.5 发送策略

- **逐个发送**：每个用户单独发送邮件，不合并批量发送
- **最多重试 3 次**：单封邮件发送失败后重试，3 次全部失败则记录错误日志，跳过该用户
- 重试间隔：指数退避（1s → 2s → 4s）

---

### 2.6 邮件模板（管理后台可配置）

模板存入 PostgreSQL `email_templates` 表，支持以下**自动替换变量**：

| 占位符 | 替换内容 | 示例 |
|--------|---------|------|
| `{{username}}` | 用户显示名 | 张三 |
| `{{user_id}}` | 用户账号（sAMAccountName） | zhangsan |
| `{{quota_type_label}}` | 配额类型中文名 | 月度Token / 日对话轮次 |
| `{{used}}` | 已用量（格式化） | 8,000,000 |
| `{{limit}}` | 上限值（格式化） | 10,000,000 |
| `{{percent}}` | 当前使用百分比 | 80.5% |
| `{{threshold}}` | 触发阈值 | 80% |
| `{{period}}` | 周期描述 | 2026年4月 / 今日（4月21日） |
| `{{reset_time}}` | 重置时间说明 | 每月1日重置 / 次日00:00重置 |

**管理后台模板编辑页**（所有管理员均可修改）：
- 邮件标题（纯文本输入框，支持占位符）
- 邮件正文（HTML 文本框，支持占位符）
- 占位符列表提示（只读，辅助填写）
- 预览按钮（填入示例数据渲染后展示）
- 保存/重置为默认模板

**内置默认模板**（系统初始化时写入，管理员可覆盖）：

```
标题：【AI Code Usage】您的{{quota_type_label}}用量已达 {{threshold}}

正文：
<p>您好 {{username}}，</p>
<p>您的 <strong>{{quota_type_label}}</strong> 在 {{period}} 已使用 <strong>{{percent}}</strong>
（{{used}} / {{limit}}）。</p>
<p>当前触发阈值：{{threshold}}。</p>
<p>配额将于 {{reset_time}} 自动重置，如需提升配额请联系管理员。</p>
<p>— AI Code Usage 系统</p>
```

---

### 2.7 发送记录去重（新表）

**新建 `email_notifications` 表**，替代旧 `email_alerts`：

```sql
CREATE TABLE IF NOT EXISTS email_notifications (
    id          SERIAL PRIMARY KEY,
    user_id     TEXT NOT NULL,
    quota_type  TEXT NOT NULL,       -- 'monthly_token' | 'daily_chats'
    threshold   INTEGER NOT NULL,    -- 50 | 80 | 100
    period_key  TEXT NOT NULL,       -- 月度: '2026-04' | 日度: '2026-04-21'
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    over_limit  BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (user_id, quota_type, threshold, period_key)
);
```

- 旧 `email_alerts` 表**保留不删**，代码切换到新表
- 存量已发记录不迁移（旧 80% 月度 Token 会在新表重新触发一次，可接受）

---

### 2.8 超限处理（预留接口）

```python
def on_over_limit(user_id: str, quota_type: str) -> None:
    """
    当用户配额达到 100% 时调用。
    当前：仅记录日志。
    预留：后续接入本系统关闭用户模型访问 API（API 尚未实现）。
    """
    logger.warning("User %s exceeded quota: %s", user_id, quota_type)
    # TODO: call disable_user_model_access(user_id) when API is ready
```

---

### 2.9 数据来源

- 用量数据：**ClickHouse（只读）**，通过现有 `get_monthly_token_usage` / `get_today_chat_count` 等函数查询
- 配额配置：PostgreSQL `quota_levels` 表（现有）
- 用户信息：PostgreSQL `users` 表（含 mail 字段）
- 发送记录：PostgreSQL `email_notifications` 表（新建）
- 邮件模板：PostgreSQL `email_templates` 表（新建）

---

### 2.10 管理后台新增配置入口

新增「通知设置」页面，**所有管理员可修改**：

| 配置项 | 类型 | 说明 |
|--------|------|------|
| 邮件通知开关 | 开关 | 全局 on/off |
| 检查间隔 | 下拉（30/60/120 分钟） | 修改后重启生效 |
| 触发阈值 | 多输入框（3档） | 0 = 忽略，修改后下次定时生效 |
| 邮件域名 | 文本框 | AD mail 为空时自动拼接 |
| 邮件模板 | 见 2.6 | 标题 + 正文 + 预览 |

> 注：检查间隔修改后需重启 APScheduler（后端重启），其余配置热加载生效

---

## 三、config.yaml 新增字段

```yaml
notification:
  enabled: true
  check_interval_minutes: 60    # 30 / 60 / 120
  thresholds: [50, 80, 100]     # 0 表示忽略该档
  email_domain: "example.com"   # AD mail 为空时自动拼接

smtp:
  host: ""
  port: 25
  username: ""                  # 已有，无密码时留空
  password: ""
  from_email: ""
  from_name: "AI Code Usage"
```

---

## 四、不在本期范围

- 短信 / 企微 / 飞书通知（仅邮件）
- 用户自行关闭提醒
- 模板多语言
- 关闭用户模型访问 API 实现（预留接口，本期仅打桩）

---

## 五、验收标准（草稿）

1. 配额值为 0 的配额项，不触发任何邮件
2. 月度 Token 50%/80%/100% 各只发一次（同月内）
3. 日对话轮次 50%/80%/100% 各只发一次（同日内），次日自动重置
4. SMTP 发送失败重试 3 次，仍失败记录日志不崩溃
5. 管理员修改模板后，下次发送立即使用新模板
6. 预览功能正常渲染所有 9 个占位符
7. `email_notifications` 表唯一约束正常去重
8. `on_over_limit` 钩子在 100% 时被调用（日志可见）
9. 全量 pytest 通过（TDD，新增测试覆盖以上场景）
