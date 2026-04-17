-- ClickHouse 事件上报主表
-- 引擎：MergeTree，按 toYYYYMM(event_date) 分区，按 event_code + event_date 排序
CREATE TABLE IF NOT EXISTS events
(
    -- 分区/时间
    event_date          Date          MATERIALIZED toDate(toDateTime(timestamp / 1000)),
    timestamp           Int64         NOT NULL COMMENT '事件上报时间戳(毫秒)',
    report_delay        Nullable(Int32) COMMENT '发起上报到真正上报的延迟(ms)',

    -- 事件标识
    event_code          LowCardinality(String) NOT NULL COMMENT '事件编码',

    -- 产品/版本
    product             LowCardinality(String) COMMENT 'SaaS/Cloud-Hosted/Self-Hosted',
    release_date        Nullable(Int64) COMMENT '构建时间戳',
    commit              Nullable(String) COMMENT '构建 Commit ID',

    -- 用户信息
    user_id             Nullable(String) COMMENT '用户ID（未登录为空）',
    username            Nullable(String) COMMENT '用户英文名',
    user_nickname       Nullable(String) COMMENT '用户昵称',
    enterprise_id       Nullable(String) COMMENT '企业ID（AD域登录关键字段）',
    enterprise          Nullable(String) COMMENT '企业组织架构信息',
    exp_keys            Nullable(String),
    exp_params          Nullable(String),

    -- 客户端环境
    os                  LowCardinality(String) COMMENT '操作系统',
    arch                Nullable(String) COMMENT '操作系统架构',
    os_version          Nullable(String),
    cpu_model           Nullable(String),
    cpu_cores           Nullable(Int16),
    memory_size         Nullable(Int16) COMMENT '物理内存GB',
    ext_name            LowCardinality(String) COMMENT '插件/客户端名称',
    ext_version         Nullable(String),
    ide_type            LowCardinality(String) COMMENT 'vscode/jetbrains/vim',
    ide_name            Nullable(String),
    ide_version         Nullable(String),
    download_channel    Nullable(String),
    user_agent          Nullable(String) COMMENT 'web UA',
    machine_id          Nullable(String),
    session_id          Nullable(String),
    trace_id            Nullable(String),

    -- VCS
    vcs_type            LowCardinality(String) COMMENT 'git/svn/unknown',
    vcs_repo            Nullable(String),
    vcs_branch_name     Nullable(String),
    vcs_rev_id          Nullable(String),

    -- ===== 补全事件字段 (completion_*) =====
    completion_id       Nullable(String),
    request_id          Nullable(String),
    completion_type     LowCardinality(String) COMMENT 'completion/nes',
    file_path           Nullable(String),
    language_id         LowCardinality(String),
    trigger_source      Nullable(String),
    intent              LowCardinality(String) COMMENT 'inline/block-scope',
    prompt_length       Nullable(Int32),
    source              LowCardinality(String) COMMENT 'remote/cache/prefetch/multi-step',
    action              Nullable(String) COMMENT 'accept/reject 等',
    action_source       Nullable(String),
    accept_mode         LowCardinality(String),
    accept_index        Nullable(Int32),
    accept_lines        Nullable(Int32),
    snippet             Nullable(String),
    snippet_length      Nullable(Int32),
    recommended_lines   Nullable(Int32),
    similarity          Nullable(Float32) COMMENT '补全采纳后相似度0~1',
    line_count          Nullable(Int32),
    finish_reason       Nullable(String),
    cost                Nullable(Int64) COMMENT '网络请求耗时ms',
    request_model_id    Nullable(String),
    request_model_name  Nullable(String),
    response_model_id   Nullable(String),
    duration            Nullable(Int32) COMMENT '跟踪上报间隔(秒)',
    state               Nullable(String) COMMENT '补全后代码修改情况',

    -- ===== Chat 事件字段 (chat_*) =====
    conversation_id     Nullable(String),
    message_id          Nullable(String),
    mode                LowCardinality(String) COMMENT 'ask/craft/plan/debug',
    input_length        Nullable(Int32),
    is_custom_model     Nullable(Bool),
    is_plan             Nullable(Bool),
    is_auto_execute_terminal Nullable(Bool),
    is_auto_modify      Nullable(Bool),
    codebase_enable     Nullable(Bool),
    is_max_mode         Nullable(Bool),
    max_token           Nullable(Int32),
    max_steps           Nullable(Int32),
    max_retries         Nullable(Int32),
    temperature         Nullable(Float32),
    tool_call_count     Nullable(Int32),
    input_token         Nullable(Int64),
    output_token        Nullable(Int64),
    total_token         Nullable(Int64),
    cached_tokens       Nullable(Int64),
    cached_write_tokens Nullable(Int64),
    cached_miss_tokens  Nullable(Int64),
    is_successful       Nullable(Bool),
    message_error_code  Nullable(String),
    history_count       Nullable(Int32),
    is_context_truncated Nullable(Bool),
    current_step_count  Nullable(Int32),
    step_count          Nullable(Int32),
    tool_call_id        Nullable(String),
    tool_name           Nullable(String),
    tool_call_successful Nullable(Bool),
    tool_status         LowCardinality(String),
    tool_error_code     Nullable(String),
    scene               Nullable(String),
    command             Nullable(String),
    custom_agent_id     Nullable(String),
    custom_agent_name   Nullable(String),
    mention_contexts    Array(String),
    knowledge_ids       Array(String),
    codebase_id         Nullable(String),
    mention_context_count Nullable(Int32),
    add_line_count      Nullable(Int32),
    removed_lines       Nullable(Int32),

    -- ===== MCP 事件字段 (mcp_*) =====
    mcp_id              Nullable(String),
    mcp_name            Nullable(String),
    tool_args           Nullable(String),
    installed_server_count Nullable(Int32),
    market_server_count  Nullable(Int32),
    custom_server_count  Nullable(Int32),
    is_official          Nullable(Bool),

    -- ===== 用户认证 (user_auth_action) =====
    -- action 字段复用上面的 action

    -- ===== 页面事件 (page_*/web_*) =====
    page                LowCardinality(String),
    page_url            Nullable(String),
    page_name           Nullable(String),
    refer_url           Nullable(String),
    is_first_page       Nullable(Bool),
    element_id          Nullable(String),
    element_name        Nullable(String),
    button              Nullable(String),

    -- ===== 代码编辑 (code_edit) =====
    file_count          Nullable(Int32),
    character_count     Nullable(Int32),
    delete_char_count   Nullable(Int32),

    -- ===== 文档变更 (document_change) =====
    added_chars         Nullable(Int32),
    deleted_chars       Nullable(Int32),
    added_blank_chars   Nullable(Int32),
    deleted_blank_chars Nullable(Int32),
    added_lines         Nullable(Int32),
    deleted_lines       Nullable(Int32),

    -- ===== 插件/IDE 事件 =====
    plugin_name         Nullable(String),
    plugin_version      Nullable(String),
    marketplace_name    Nullable(String),
    plugin_scope        LowCardinality(String),
    is_built_in         Nullable(Bool),
    has_agents          Nullable(Bool),
    has_commands        Nullable(Bool),
    has_skills          Nullable(Bool),
    has_mcp_servers     Nullable(Bool),

    -- ===== 专家中心 (expert_*) =====
    expert_id           Nullable(String),
    expert_name         Nullable(String),
    expert_title        Nullable(String),
    expert_type         Nullable(String),
    position            Nullable(Int32),

    -- ===== 工作区 (workspace_*) =====
    workspace_name      Nullable(String),
    workspace_id        Nullable(String),
    core_feature_triggered Nullable(Bool),

    -- ===== IDE 集成 =====
    integration_type    Nullable(String),
    integration_id      Nullable(String),
    is_integration_successful Nullable(Bool),
    integration_source  Nullable(String),

    -- ===== 活动 (activity_notify) =====
    activity_id         Nullable(String),
    status              Nullable(String),

    -- ===== Plan 模式 (ide_plan_action) =====
    plan_name           Nullable(String),
    plan_status         Nullable(Int32),
    parts               Nullable(String),
    todo_status         Nullable(String),

    -- 插入时间（ETL 写入时间）
    inserted_at         DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_code, event_date)
SETTINGS index_granularity = 8192;


-- 常用查询辅助视图：补全采纳率
CREATE VIEW IF NOT EXISTS v_completion_acceptance AS
SELECT
    event_date,
    enterprise_id,
    language_id,
    countIf(event_code = 'completion_trigger') AS trigger_count,
    countIf(event_code = 'completion_action' AND action = 'accept') AS accept_count,
    round(accept_count / nullIf(trigger_count, 0) * 100, 2) AS acceptance_rate
FROM events
WHERE event_code IN ('completion_trigger', 'completion_action')
GROUP BY event_date, enterprise_id, language_id;


-- 常用查询辅助视图：Chat Token 消耗（按企业/日期）
CREATE VIEW IF NOT EXISTS v_chat_token_usage AS
SELECT
    event_date,
    enterprise_id,
    request_model_name,
    count() AS request_count,
    sum(input_token) AS total_input_token,
    sum(output_token) AS total_output_token,
    sum(total_token) AS total_token_sum
FROM events
WHERE event_code = 'chat_request_response'
GROUP BY event_date, enterprise_id, request_model_name;


-- 常用查询辅助视图：DAU（按产品）
CREATE VIEW IF NOT EXISTS v_dau AS
SELECT
    event_date,
    product,
    enterprise_id,
    uniqExact(user_id) AS dau
FROM events
WHERE user_id != ''
GROUP BY event_date, product, enterprise_id;

