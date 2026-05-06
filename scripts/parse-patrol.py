#!/usr/bin/env python3
"""Parse patrol.js and pm-heartbeat.js JSON output for cron reporting."""
import json, sys

def parse_patrol(data):
    try:
        d = json.loads(data) if isinstance(data, str) else data
        verdict = d.get('verdict', 'UNKNOWN')
        summary = d.get('summary', '')
        report = d.get('report', {})
        violations = report.get('violations', d.get('violations', []))
        warnings = report.get('warnings', d.get('warnings', []))
        total = report.get('task_count', d.get('totalTasks', 0))
        status_summary = report.get('status_summary', {})
        completeness = report.get('completeness_scores', {})
        alert_rate = d.get('alert_rate', {})
        delta = d.get('delta', None)
        escalations = d.get('escalations', [])

        parts = []

        # 1. 状态 + 量化指标（放最前面）
        if verdict == 'OK':
            parts.append(f'✅ 巡检通过 ({total} 任务, 11项检查)')
        elif verdict == 'ERROR':
            parts.append(f'❌ {len(violations)}个违规 {len(warnings)}个告警 / {total}任务')
        else:
            parts.append(f'⚠️ {len(warnings)}个告警 / {total}任务')

        # 2. 量化指标面板
        if status_summary:
            status_line = ' | '.join(f'{s}:{c}' for s, c in sorted(status_summary.items()))
            parts.append(f'📊 状态: {status_line}')

        if alert_rate:
            rate = alert_rate.get('rate', 0)
            rate_icon = '✅' if alert_rate.get('pass', True) else '🔴'
            parts.append(f'📉 告警率: {rate_icon} {rate}% (目标<{alert_rate.get("target",10)}%)')

        if completeness:
            scores = list(completeness.values())
            avg = sum(scores) / len(scores) if scores else 0
            low = [(k, v) for k, v in completeness.items() if v < 70]
            parts.append(f'📈 平均完成度: {avg:.0f}%' + (f' | ⚠️ 低于70%: {", ".join(f"{k}({v}%)" for k,v in low)}' if low else ''))

        # 3. 对比变化
        if delta:
            v_delta = delta.get('violations', {}).get('delta', 0)
            w_delta = delta.get('warnings', {}).get('delta', 0)
            v_sign = '+' if v_delta >= 0 else ''
            w_sign = '+' if w_delta >= 0 else ''
            parts.append(f'🔄 对比上次: 违规{v_sign}{v_delta} 告警{w_sign}{w_delta}')

        # 4. 违规详情（最多5个）
        if violations:
            for v in violations[:5]:
                parts.append(f'  🚨 [{v.get("taskId","?")}] {v.get("category", v.get("type","?"))}: {v.get("message","?")}')

        # 5. 告警（最多3个）
        if warnings:
            for w in warnings[:3]:
                parts.append(f'  ⚠️ [{w.get("taskId","?")}] {w.get("category", w.get("type","?"))}: {w.get("message","?")}')
            if len(warnings) > 3:
                parts.append(f'  ... 还有 {len(warnings)-3} 个告警')

        # 6. 趋势升级
        if escalations:
            parts.append(f'🔴 趋势升级: {len(escalations)}个问题连续3+次未修复')

        print('\n'.join(parts))
    except Exception as e:
        print(f'⚠️ 巡检脚本解析失败: {e}')

def parse_heartbeat(data):
    try:
        d = json.loads(data) if isinstance(data, str) else data
        nt = d.get('notification_text', '')
        if nt:
            lines = nt.strip().split('\n')
            relevant = [l for l in lines[1:] if l.strip()][:8]
            print('\n'.join(relevant))
            return
        parts = []
        for g in d.get('gate_passed', [])[:3]:
            parts.append(f'  ✅ 门禁通过: {g.get("taskId","?")}')
        for g in d.get('gate_failed', [])[:3]:
            parts.append(f'  ❌ 门禁失败: {g.get("taskId","?")} — {g.get("reason","?")}')
        for t in d.get('dispatchable', [])[:3]:
            tid = t.get('taskId', t) if isinstance(t, dict) else t
            parts.append(f'  📋 可派发: {tid}')
        for w in d.get('waiting_deps', [])[:3]:
            parts.append(f'  ⏳ 等待依赖: {w.get("taskId","?")} → {w.get("unmet",[])}')
        if not parts:
            parts.append('无待办操作')
        print('\n'.join(parts))
    except Exception as e:
        print(f'门禁检测解析失败: {e}')

def parse_retro_check():
    """检查各 Agent 每日反思 cron 的执行状态"""
    import os, time
    cron_file = os.path.expanduser('~/.openclaw/cron/jobs.json')
    try:
        with open(cron_file, 'r') as f:
            cron_data = json.load(f)
    except Exception as e:
        print(f'⚠️ 无法读取 cron 配置: {e}')
        return

    jobs = cron_data.get('jobs', [])
    retro_jobs = [j for j in jobs if 'retro' in j.get('name', '').lower() or 'review' in j.get('name', '').lower()]

    if not retro_jobs:
        print('⚠️ 未找到反思/复盘 cron job')
        return

    now_ms = int(time.time() * 1000)
    parts = ['📝 每日反思 Cron 状态:']

    ok_count = 0
    err_count = 0
    disabled_count = 0

    for j in retro_jobs:
        name = j.get('name', '?')
        agent = j.get('agentId', j.get('agent', '?'))
        enabled = j.get('enabled', False)
        state = j.get('state', {})
        last_run = state.get('lastRunAtMs', 0)
        last_status = state.get('lastRunStatus', 'unknown')
        consec_errs = state.get('consecutiveErrors', 0)
        last_error = state.get('lastError', '')
        schedule = j.get('schedule', {}).get('expr', '?')

        # 计算距上次执行的时间
        if last_run > 0:
            hours_ago = (now_ms - last_run) / 3600000
            time_str = f'{hours_ago:.0f}h前'
        else:
            time_str = '从未执行'

        if not enabled:
            disabled_count += 1
            parts.append(f'  ⏸️ {agent}({name}): disabled')
        elif consec_errs > 0:
            err_count += 1
            err_brief = last_error[:60] if last_error else '未知错误'
            parts.append(f'  ❌ {agent}({name}): 连续{consec_errs}次报错 [{time_str}]')
        elif last_status == 'ok':
            ok_count += 1
            parts.append(f'  ✅ {agent}({name}): 正常 [{time_str}]')
        else:
            parts.append(f'  ⚠️ {agent}({name}): {last_status} [{time_str}]')

    # 汇总
    total = len(retro_jobs)
    parts.append(f'  📊 汇总: {total}个反思cron — ✅{ok_count} ❌{err_count} ⏸️{disabled_count}')

    if err_count > 0 or disabled_count > total // 2:
        parts.append(f'  🚨 需要修复！大部分反思 cron 未正常运行')

    print('\n'.join(parts))


def parse_task_summary():
    """PM 专用：任务状态概览（不做合规检查，只统计状态和阻塞）"""
    import os, glob, time
    tasks_dir = os.path.expanduser('~/.openclaw/workspace-dev/projects/enterprise-skillhub/tasks')
    try:
        files = glob.glob(os.path.join(tasks_dir, 'TASK-*.json'))
    except Exception as e:
        print(f'⚠️ 无法读取任务目录: {e}')
        return

    status_counts = {}
    blocked = []
    in_progress = []
    pending = []
    now = time.time() * 1000

    for f in sorted(files):
        try:
            with open(f, 'r') as fh:
                t = json.load(fh)
            s = (t.get('status', 'UNKNOWN')).upper()
            if s == 'CANCELED':
                continue
            status_counts[s] = status_counts.get(s, 0) + 1

            task_id = t.get('id', os.path.basename(f))

            if s == 'BLOCKED':
                reason = t.get('blocked_reason', '未说明')
                blocked.append(f'{task_id}: {reason}')
            elif s == 'IN_PROGRESS':
                # 检查是否长时间无更新
                last_ts = 0
                for evt in (t.get('event_log') or []):
                    if evt.get('timestamp'):
                        try:
                            evt_ms = int(time.mktime(time.strptime(evt['timestamp'][:19], '%Y-%m-%dT%H:%M:%S')) * 1000)
                            if evt_ms > last_ts:
                                last_ts = evt_ms
                        except:
                            pass
                hours_idle = (now - last_ts) / 3600000 if last_ts > 0 else 0
                assignee = t.get('assignee', '?')
                title = t.get('title', '?')[:30]
                idle_str = f' ⚠️ 空闲{hours_idle:.0f}h' if hours_idle > 24 else ''
                in_progress.append(f'{task_id}({assignee}): {title}{idle_str}')
            elif s == 'PENDING':
                deps = t.get('prerequisites') or t.get('dependencies') or []
                assignee = t.get('assignee', '?')
                pending.append(f'{task_id}({assignee}) 依赖:{",".join(deps) if deps else "无"}')
        except:
            pass

    parts = ['📋 任务状态概览:']
    status_line = ' | '.join(f'{s}:{c}' for s, c in sorted(status_counts.items()))
    parts.append(f'  {status_line}')

    if in_progress:
        parts.append(f'  🔨 进行中({len(in_progress)}):')
        for ip in in_progress[:5]:
            parts.append(f'    {ip}')

    if blocked:
        parts.append(f'  🔴 阻塞({len(blocked)}):')
        for b in blocked[:3]:
            parts.append(f'    {b}')

    if pending:
        parts.append(f'  ⏳ 待启动({len(pending)}):')
        for p in pending[:5]:
            parts.append(f'    {p}')

    if not in_progress and not blocked and not pending:
        parts.append('  ✅ 所有任务已完成或取消')

    print('\n'.join(parts))


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'patrol'
    if mode == 'retro':
        parse_retro_check()
        sys.exit(0)
    if mode == 'task_summary':
        parse_task_summary()
        sys.exit(0)
    data = sys.stdin.read().strip()
    if not data:
        print('⚠️ 无输入数据')
        sys.exit(0)
    if mode == 'patrol':
        parse_patrol(data)
    elif mode == 'heartbeat':
        parse_heartbeat(data)
    else:
        print(f'未知模式: {mode}')
