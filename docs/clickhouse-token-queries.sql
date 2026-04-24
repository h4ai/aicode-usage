-- =============================================
-- ClickHouse 查询 - 按日期+用户+模型维度统计tokens消耗
-- 数据库连接信息：
-- 地址：xx
-- 端口：8123
-- 用户名：default
-- 密码：C0p1l0tC0d3#15
-- 表名：otel.events
-- =============================================

-- =============================================
-- 核心查询：按日期 + 用户 + 模型 三维度统计tokens消耗
-- =============================================
SELECT
    toDate(event_date) as dt,
    userId,
    userNickname,
    username,
    requestModelId,
    requestModelName,
    count() as request_count,
    sum(totalToken) as total_tokens,
    sum(inputToken) as input_tokens,
    sum(outputToken) as output_tokens,
    avg(totalToken) as avg_tokens,
    max(totalToken) as max_tokens,
    min(totalToken) as min_tokens
FROM otel.events
WHERE eventCode IN ('chat_request_response', 'chat_message_response')
AND totalToken > 0
AND userId IS NOT NULL
GROUP BY
    toDate(event_date),
    userId,
    userNickname,
    username,
    requestModelId,
    requestModelName
ORDER BY dt DESC, total_tokens DESC;

-- =============================================
-- 按日期 + 用户 维度统计（合并所有模型）
-- =============================================
SELECT
    toDate(event_date) as dt,
    userId,
    userNickname,
    username,
    enterprise,
    count(DISTINCT conversationId) as conversation_count,
    count() as request_count,
    sum(totalToken) as total_tokens,
    sum(inputToken) as input_tokens,
    sum(outputToken) as output_tokens,
    avg(totalToken) as avg_tokens
FROM otel.events
WHERE eventCode IN ('chat_request_response', 'chat_message_response')
AND totalToken > 0
AND userId IS NOT NULL
GROUP BY
    toDate(event_date),
    userId,
    userNickname,
    username,
    enterprise
ORDER BY dt DESC, total_tokens DESC;

-- =============================================
-- 按日期 + 模型 维度统计（合并所有用户）
-- =============================================
SELECT
    toDate(event_date) as dt,
    requestModelId,
    requestModelName,
    count(DISTINCT userId) as user_count,
    count(DISTINCT conversationId) as conversation_count,
    count() as request_count,
    sum(totalToken) as total_tokens,
    sum(inputToken) as input_tokens,
    sum(outputToken) as output_tokens,
    avg(totalToken) as avg_tokens
FROM otel.events
WHERE eventCode IN ('chat_request_response', 'chat_message_response')
AND totalToken > 0
AND userId IS NOT NULL
GROUP BY
    toDate(event_date),
    requestModelId,
    requestModelName
ORDER BY dt DESC, total_tokens DESC;

-- =============================================
-- 按用户 + 模型 维度统计（合并所有日期）
-- =============================================
SELECT
    userId,
    userNickname,
    username,
    enterprise,
    requestModelId,
    requestModelName,
    count(DISTINCT conversationId) as conversation_count,
    count() as request_count,
    sum(totalToken) as total_tokens,
    sum(inputToken) as input_tokens,
    sum(outputToken) as output_tokens,
    avg(totalToken) as avg_tokens
FROM otel.events
WHERE eventCode IN ('chat_request_response', 'chat_message_response')
AND totalToken > 0
AND userId IS NOT NULL
GROUP BY
    userId,
    userNickname,
    username,
    enterprise,
    requestModelId,
    requestModelName
ORDER BY total_tokens DESC;

-- =============================================
-- 按用户统计总tokens消耗
-- =============================================
SELECT
    userId,
    userNickname,
    username,
    enterprise,
    count(DISTINCT conversationId) as conversation_count,
    count() as request_count,
    sum(totalToken) as total_tokens,
    sum(inputToken) as input_tokens,
    sum(outputToken) as output_tokens,
    avg(totalToken) as avg_tokens,
    max(totalToken) as max_tokens,
    min(totalToken) as min_tokens
FROM otel.events
WHERE eventCode IN ('chat_request_response', 'chat_message_response')
AND totalToken > 0
AND userId IS NOT NULL
GROUP BY
    userId,
    userNickname,
    username,
    enterprise
ORDER BY total_tokens DESC;

-- =============================================
-- tokens消耗分布统计
-- =============================================
SELECT
    case
        when totalToken <= 100 then '0-100'
        when totalToken <= 500 then '101-500'
        when totalToken <= 1000 then '501-1000'
        when totalToken <= 2000 then '1001-2000'
        when totalToken <= 5000 then '2001-5000'
        else '5000+'
    end as token_range,
    count() as event_count,
    count(DISTINCT userId) as user_count,
    sum(totalToken) as total_tokens
FROM otel.events
WHERE eventCode IN ('chat_request_response', 'chat_message_response')
AND totalToken > 0
AND userId IS NOT NULL
GROUP BY token_range
ORDER BY min(totalToken);