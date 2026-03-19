# HEARTBEAT.md

## 定时巡检（每小时）
- 检查 subagent 状态：`subagents list`
- 检查 git log：`cd projects/enterprise-skillhub && git log --oneline -10`
- 检查 screenshots/ 目录是否有新产出
- 汇报到群里：任务进度、完成情况、阻塞项
- 如果全部完成，派 QA 跑 e2e 并汇总最终报告
