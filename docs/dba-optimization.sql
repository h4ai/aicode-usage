-- ============================================================
-- DBA 优化 SQL — otel.events 表
-- 生成日期：2026-04-21
-- 影响：只读操作（无数据修改）
-- 执行前请在测试环境验证
-- ============================================================

-- ============================================================
-- 优化 1：userNickname 加入 ORDER BY（排序键）
-- 影响等级：🚀🚀🚀 最大
-- 原因：MergeTree 按排序键物理排布数据。
--       加入 userNickname 后，GROUP BY userNickname 变成有序扫描，
--       可跳过大量不相关的 granule，查询速度提升数倍至数十倍。
-- 注意：ALTER TABLE ... MODIFY ORDER BY 需要 ClickHouse 21.6+
--       执行后会触发后台 merge，短期内写入性能轻微下降。
-- ============================================================

ALTER TABLE otel.events
MODIFY ORDER BY (eventCode, event_date, userNickname);

-- 验证：
-- SELECT * FROM system.tables WHERE database = 'otel' AND name = 'events'
-- 看 sorting_key 是否已包含 userNickname


-- ============================================================
-- 优化 2：userNickname 改为 LowCardinality(String)
-- 影响等级：🚀🚀
-- 原因：LowCardinality 使用字典编码，
--       对低基数列（用户数 < 10000）GROUP BY 和过滤速度大幅提升。
--       当前 Nullable(String) 需额外 null 分支处理。
-- 注意：修改列类型需要重写数据（background mutation），
--       表数据量大时耗时较长，建议在业务低峰期执行。
--       LowCardinality 不支持 Nullable，需确认 userNickname 无重要空值逻辑。
-- ============================================================

ALTER TABLE otel.events
MODIFY COLUMN userNickname LowCardinality(String) DEFAULT '';

-- 如需保留 Nullable 语义（有 NULL 值场景），改为：
-- ALTER TABLE otel.events
-- MODIFY COLUMN userNickname LowCardinality(Nullable(String));

-- 跟踪 mutation 进度：
-- SELECT * FROM system.mutations WHERE table = 'events' AND is_done = 0;


-- ============================================================
-- 优化 3：totalToken 建 Skip Index（minmax）
-- 影响等级：🚀
-- 原因：所有查询都带 totalToken > 0 过滤条件。
--       minmax skip index 可跳过 totalToken 全为 0 的 granule，
--       减少 I/O 读取量。
-- 注意：需要 MATERIALIZE INDEX 触发后台重建，耗时与数据量成正比。
-- ============================================================

ALTER TABLE otel.events
ADD INDEX IF NOT EXISTS idx_total_token_minmax totalToken TYPE minmax GRANULARITY 4;

-- 触发后台重建（必须执行，否则历史数据不走索引）：
ALTER TABLE otel.events MATERIALIZE INDEX idx_total_token_minmax;

-- 跟踪进度：
-- SELECT * FROM system.mutations WHERE table = 'events' AND is_done = 0;


-- ============================================================
-- 优化 4（可选）：Materialized View 预聚合
-- 影响等级：🚀🚀🚀
-- 原因：当前所有 token/request/chat 聚合都是实时计算全表扫描。
--       MV 在写入时预聚合，查询直接走小表，延迟降至微秒级。
-- 注意：MV 只聚合 MV 创建后的新数据，历史数据需要手动回填。
--       先在测试环境验证聚合逻辑正确性再上生产。
-- ============================================================

-- 创建预聚合 MV（按天/用户/模型）
CREATE MATERIALIZED VIEW IF NOT EXISTS otel.mv_daily_user_token
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_date, userNickname, requestModelName)
AS
SELECT
    event_date,
    assumeNotNull(userNickname)   AS userNickname,
    assumeNotNull(requestModelName) AS requestModelName,
    sum(inputToken)   AS input_token,
    sum(outputToken)  AS output_token,
    sum(totalToken)   AS total_token,
    countIf(eventCode = 'chat_request_response') AS chat_count,
    count()           AS request_count
FROM otel.events
WHERE eventCode IN ('chat_request_response', 'chat_message_response')
  AND totalToken > 0
GROUP BY event_date, userNickname, requestModelName;

-- 历史数据回填（一次性执行，数据量大时分批）：
INSERT INTO otel.mv_daily_user_token
SELECT
    event_date,
    assumeNotNull(userNickname),
    assumeNotNull(requestModelName),
    sum(inputToken), sum(outputToken), sum(totalToken),
    countIf(eventCode = 'chat_request_response'),
    count()
FROM otel.events
WHERE eventCode IN ('chat_request_response', 'chat_message_response')
  AND totalToken > 0
GROUP BY event_date, userNickname, requestModelName;

-- 查询示例（月度用户 token 汇总，比直接查 events 快 10-100x）：
-- SELECT userNickname, sum(total_token) AS monthly_token
-- FROM otel.mv_daily_user_token
-- WHERE event_date >= toStartOfMonth(today())
-- GROUP BY userNickname
-- ORDER BY monthly_token DESC;


-- ============================================================
-- 执行优先级建议
-- ============================================================
-- 1. 优化 3（Skip Index）— 风险最低，立即可执行
-- 2. 优化 1（ORDER BY）  — 收益最大，需低峰期执行，执行前备份
-- 3. 优化 2（LowCardinality）— 需确认空值影响，mutation 耗时长
-- 4. 优化 4（MV）         — 收益极大，但需回填历史数据，需测试环境先验证
-- ============================================================
