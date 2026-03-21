# Monitoring Setup — Enterprise SkillHub

## Overview

This directory contains monitoring configuration for the Enterprise SkillHub platform:

- **Prometheus** — metrics collection and alerting
- **Grafana** — visualization dashboards

## Architecture

```
┌─────────────┐    scrape     ┌────────────┐    query    ┌─────────┐
│  SkillHub   │◄──────────────│ Prometheus │◄────────────│ Grafana │
│  Backend    │               │            │             │         │
│  /metrics   │               │  + Rules   │             │  Dash-  │
└─────────────┘               │  + Alerts  │             │  boards │
                              └────────────┘             └─────────┘
                                    │
                                    ▼
                              ┌────────────┐
                              │ AlertMgr   │──→ Feishu/WeCom Webhook
                              └────────────┘
```

## Prerequisites

- Prometheus Operator or standalone Prometheus in `monitoring` namespace
- Grafana with Prometheus datasource
- AlertManager (for notification routing)

## Deployment

### 1. Prometheus Config

```bash
kubectl apply -f prometheus/prometheus-config.yaml -n monitoring
```

### 2. Alert Rules

```bash
kubectl apply -f prometheus/alert-rules.yaml -n monitoring
```

### 3. Grafana Datasource

```bash
kubectl apply -f grafana/datasource.yaml -n monitoring
```

### 4. Grafana Dashboards

Import the JSON dashboard files via Grafana UI:
- `grafana/dashboard-overview.json` — System overview
- `grafana/dashboard-api.json` — API performance details

Or use the Grafana provisioning ConfigMap approach.

## Alert Rules Summary

| Alert | Condition | Severity | Team |
|-------|-----------|----------|------|
| API High Latency | p99 > 2s for 5m | Warning | Backend |
| API High Error Rate | > 5% for 3m | Critical | Backend |
| PG Connection Pool High | > 80% for 5m | Warning | DBA |
| Redis Memory High | > 90% for 5m | Warning | Infra |
| Pod Frequent Restarts | > 3 in 5m | Critical | Backend |
| Disk Usage High | > 85% for 10m | Warning | Infra |
| Review Queue Backlog | > 100 for 15m | Warning | Product |
| Search Slow | p99 > 3s for 5m | Warning | Backend |
| BGE-M3 Down | down for 5m | Critical | ML |

Total: **9 alert rules** across 4 rule groups.

## Metrics Exported by Backend

| Metric | Type | Description |
|--------|------|-------------|
| `skillhub_http_request_duration_seconds` | Histogram | HTTP request duration |
| `skillhub_http_requests_total` | Counter | Total HTTP requests |
| `skillhub_http_requests_in_flight` | Gauge | Current in-flight requests |
| `skillhub_review_queue_size` | Gauge | Pending review count |
| `skillhub_search_latency_seconds` | Histogram | Search latency |
| `skillhub_skill_uploads_total` | Counter | Skill upload count |
| `skillhub_active_users` | Gauge | Active users (15min) |
| `skillhub_db_pool_connections` | Gauge | DB pool status |
| `skillhub_*` (default) | Various | Node.js process metrics |

## Notification Channels

Configure AlertManager to send notifications:

```yaml
# alertmanager.yml
receivers:
  - name: feishu-webhook
    webhook_configs:
      - url: 'https://open.feishu.cn/open-apis/bot/v2/hook/<TOKEN>'
        send_resolved: true

route:
  receiver: feishu-webhook
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
```
