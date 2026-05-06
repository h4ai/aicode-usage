#!/usr/bin/env node
/**
 * File Inbox Dispatch Tool
 * PM 用此脚本向目标 Agent 的 inbox/ 目录写入 dispatch 文件
 * 
 * 用法（PM 通过 write tool 直接写文件即可，此脚本供命令行使用）:
 *   node dispatch.js --task TASK-117 --agent dev --summary "实现用户注册功能"
 * 
 * 或者 PM 直接用 write tool 写:
 *   write ~/.openclaw/workspace-dev/inbox/TASK-117.dispatch.json
 */

const fs = require('fs');
const path = require('path');

// Agent workspace 映射
const AGENT_WORKSPACES = {
  dev: '/home/azureuser/.openclaw/workspace-dev',
  qa: '/home/azureuser/.openclaw/workspace-qa',
  po: '/home/azureuser/.openclaw/workspace-po',
  sa: '/home/azureuser/.openclaw/workspace-sa',
};

// 项目 tasks 目录
const TASKS_DIR = '/home/azureuser/.openclaw/workspace-dev/projects/enterprise-skillhub/tasks';

function dispatch(taskId, agentId, summary, priority = 'normal') {
  const workspace = AGENT_WORKSPACES[agentId];
  if (!workspace) {
    console.error(`Unknown agent: ${agentId}. Valid: ${Object.keys(AGENT_WORKSPACES).join(', ')}`);
    process.exit(1);
  }

  const inboxDir = path.join(workspace, 'inbox');
  
  // 确保 inbox 目录存在
  if (!fs.existsSync(inboxDir)) {
    fs.mkdirSync(inboxDir, { recursive: true });
  }

  // 检查 TASK JSON 是否存在
  const taskFile = path.join(TASKS_DIR, `${taskId}.json`);
  const taskFileRelative = `projects/enterprise-skillhub/tasks/${taskId}.json`;
  
  if (!fs.existsSync(taskFile)) {
    console.warn(`Warning: Task file not found: ${taskFile}`);
  }

  // 检查是否已有 dispatch
  const dispatchFile = path.join(inboxDir, `${taskId}.dispatch.json`);
  if (fs.existsSync(dispatchFile)) {
    console.error(`Dispatch already exists: ${dispatchFile}`);
    process.exit(1);
  }

  // 写 dispatch 文件
  const dispatch = {
    _schema: 'file-inbox-dispatch-v1',
    taskId,
    dispatchedAt: new Date().toISOString(),
    dispatchedBy: 'pm',
    targetAgent: agentId,
    taskFile: taskFileRelative,
    summary: summary || `Task ${taskId}`,
    priority,
    status: 'pending', // pending → processing → done/failed
  };

  fs.writeFileSync(dispatchFile, JSON.stringify(dispatch, null, 2) + '\n');
  console.log(`✅ Dispatched ${taskId} → ${agentId} inbox: ${dispatchFile}`);
  return dispatchFile;
}

// CLI 模式
if (require.main === module) {
  const args = process.argv.slice(2);
  const taskIdx = args.indexOf('--task');
  const agentIdx = args.indexOf('--agent');
  const summaryIdx = args.indexOf('--summary');
  const priorityIdx = args.indexOf('--priority');

  if (taskIdx === -1 || agentIdx === -1) {
    console.log('Usage: node dispatch.js --task TASK-XXX --agent dev [--summary "..."] [--priority normal|high|critical]');
    process.exit(1);
  }

  const taskId = args[taskIdx + 1];
  const agentId = args[agentIdx + 1];
  const summary = summaryIdx !== -1 ? args[summaryIdx + 1] : '';
  const priority = priorityIdx !== -1 ? args[priorityIdx + 1] : 'normal';

  dispatch(taskId, agentId, summary, priority);
}

module.exports = { dispatch, AGENT_WORKSPACES };
