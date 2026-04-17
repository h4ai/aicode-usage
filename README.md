# AI Code Usage 数据看板

## 项目概述
AI 编程助手（IDE 插件）使用数据统计看板，支持 AD 域登录，展示 Token 消耗、用户活跃度、补全采纳率等指标。

## 技术栈
- 数据库：ClickHouse（localhost:8123，库名：otel）
- 主表：otel.events
- 数据格式：客户端上报的埋点事件（camelCase 字段）

## 目录结构
- sql/        SQL 查询文件
- scripts/    数据导入/ETL 脚本
- grafana/    看板配置
- docs/       文档

## ClickHouse 连接
- 地址：localhost:8123
- 用户：default
- 数据库：otel
- 主表：otel.events

## 核心视图
- otel.v_token_by_date_user_model  Token消耗（日期+用户+模型）
- otel.v_dau                        DAU统计
- otel.v_completion_acceptance      补全采纳率
