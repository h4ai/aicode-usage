# 需求映射关系表 v1.0

> 用途：人工校验 requirements.md → iterations → prd.json 转换是否正确无遗漏
> 生成时间：2026-04-17 | 状态：待沈老板确认

---

## 映射总览

| requirements.md 章节 | 核心内容（人类确认） | iterations 文件 | User Story | prd.json ID |
|---------------------|-------------------|----------------|-----------|-------------|
| §九技术规范（技术栈+部署） | FastAPI+Vue3+Docker Compose，前端3002/后端8002，/health接口，data_schema.py | 001-auth.md | US-001 项目脚手架 | US-001 |
| §三认证模块（管理员） | bcrypt hash，config.yaml，修改立即失效，JWT 8小时 | 001-auth.md | US-002 管理员登录 | US-002 |
| §三认证模块（AD用户） | LDAP，域账号/显示名匹配userId，首次登录建档L1 | 001-auth.md | US-003 AD用户登录 | US-003 |
| §三认证模块（前端） | 登录页，路由守卫，JWT存localStorage，角色跳转 | 001-auth.md | US-004 登录页+路由守卫 | US-004 |
| §四配额体系（进度条API） | 月度Token/限额，今日请求次数/限额，颜色状态，5分钟缓存 | 002-dashboard.md | US-005 配额进度条API | US-005 |
| §四配额体系（指标卡片API） | 月/今日视角切换，活跃天数/日均Token | 002-dashboard.md | US-006 指标卡片API | US-006 |
| §六个人看板（顶部区域前端） | 四色进度条，四个指标卡片，本月/今日切换 | 002-dashboard.md | US-007 进度条+卡片前端 | US-007 |
| §六Tab1趋势图 | ECharts柱/折线，输入输出分色，7天/30天/自定义 | 002-dashboard.md | US-008 趋势图API+前端 | US-008 |
| §六Tab2明细列表 | 按日期+模型分组，3筛选，排序，CSV导出限3个月 | 002-dashboard.md | US-009 列表+导出 | US-009 |
| §六Tab3模型分布 | ECharts环形图，各模型Token占比，时间筛选 | 002-dashboard.md | US-010 模型分布图 | US-010 |
| §七7.2配额级别管理 | L1/L2/L3固定三级，只能改额度不可增删，立即生效 | 003-admin.md | US-011 配额级别管理 | US-011 |
| §七7.1用户管理 | 显示名/userId/enterprise/级别，修改级别，"未知"兜底 | 003-admin.md | US-012 用户管理 | US-012 |
| §七7.3全局趋势 | 所有用户汇总趋势，按模型/部门分组 | 003-admin.md | US-013 全局趋势 | US-013 |
| §七7.4部门汇总 | enterprise分组，NULL归"未知"，人均Token | 003-admin.md | US-014 部门汇总 | US-014 |
| §七7.5用量排行榜 | 仅管理员可见，Top10/20/50，非管理员403 | 003-admin.md | US-015 排行榜 | US-015 |
| §五邮件通知 | 每小时轮询，首次80%发邮件，同月只发一次，SMTP热加载 | 003-admin.md | US-016 邮件通知 | US-016 |

---

## 说明

- **人类确认层**：只有 `requirements.md v0.7` 经沈老板逐条确认
- **AI 转换层**：iterations Markdown、prd.json 均为 AI 转换，source 字段标注来源章节
- **校验方法**：逐行对照本表，确认每个 US 的"核心内容"与 requirements.md 对应章节一致
- **发现问题**：直接告知 OPS，修改对应 iterations 文件 + prd.json 并重新提交 git commit

---

## 校验状态

- [ ] 沈老板已确认映射关系正确
- [ ] 启动 ralph.sh 开发
