# AI Code Usage — 全量端到端测试用例（40条）+ 验收标准（AC）

- 来源：`full-e2e-test-cases.md`
- 目标：为每条用例补充 **PASS / FAIL / BLOCKED** 条件，做到“可量化、可自动判定（API）/可人工核对（UI）”。
- 默认环境（本次自动化脚本使用）：
  - BE: `http://127.0.0.1:8002`
  - Admin: `admin / admin123`
  - Test user: `uid_001 / test123`
  - ⚠️ `POST /api/auth/test-login` 默认可能未启用（需 config.yaml: `auth.allow_test_login: true`）。当返回 404/422 时，涉及 test-login 的用例在自动化中将标记为 **BLOCKED**

> 约定：
> - `status=xxx` 指 HTTP 响应码。
> - `body.xxx` 为 JSON 字段（字段名以实际为准；若后端字段名不同，在脚本中做兼容映射）。
> - “后端不可达”包含：连接超时、连接被拒绝、DNS 失败。

---

## M1 认证模块（TC-001 ~ TC-005）

### TC-001 管理员登录成功（API）
- 接口: POST /api/auth/login
- 输入: {"username":"admin","password":"admin123"}
- PASS: status=200 且 JSON 可解析 且 (body.token 或 body.access_token 任一为非空字符串) 且 (body.role 缺省或 body.role=="admin")
- FAIL: status≠200 或 token/access_token 为空/缺失 或响应非 JSON
- BLOCKED: 后端不可达（ConnectTimeout/ConnectionRefused）

### TC-002 测试用户登录成功（API）
- 接口: POST /api/auth/test-login
- 输入: {"username":"uid_001","password":"test123"}
- PASS: status=200 且 JSON 可解析 且 body.token 为非空字符串
- FAIL: status≠200 或 token 为空/缺失 或响应非 JSON
- BLOCKED: 后端不可达；或 test-login 端点未启用（status=404/422，需配置 auth.allow_test_login: true）

### TC-003 错误密码登录失败（API）
- 接口: POST /api/auth/login
- 输入: {"username":"admin","password":"WRONG"}
- PASS: status ∈ {400,401,403} 且响应体包含可读错误信息（body.message/detail/error 任一非空）
- FAIL: status=200 或未返回错误信息（message/detail/error 全为空/缺失）
- BLOCKED: 后端不可达

### TC-004 携带 JWT 访问受保护 API 成功（API）
- 接口: GET /api/metrics/summary
- 输入: Authorization: Bearer <uid token>
- PASS: status=200 且 JSON 可解析 且 body 为对象 且至少包含：body.total_token 与 body.request_count（或语义等价字段）
- FAIL: status≠200 或响应非 JSON 或返回明显错误（如 unauthorized）
- BLOCKED: 后端不可达；或无法获取 uid token（依赖 TC-002，被 404 阻塞）

### TC-005 无 JWT 访问受保护 API 失败（API）
- 接口: GET /api/metrics/summary
- 输入: 无 Authorization
- PASS: status ∈ {401,403}
- FAIL: status=200
- BLOCKED: 后端不可达

---

## M2 配额体系（TC-006 ~ TC-008）

### TC-006 管理员获取配额级别列表（API）
- 接口: GET /api/admin/quota-levels
- 输入: Authorization: Bearer <admin token>
- PASS: status=200 且 JSON 可解析 且返回列表/对象中包含且仅包含 L1/L2/L3 三个级别（名称或 code 字段匹配其一）
- FAIL: status≠200；或缺少任一等级；或出现多余等级（除非后端明确支持更多，需在报告记录）
- BLOCKED: 后端不可达；或无法获取 admin token（依赖 TC-001）

### TC-007 用户未分配级别默认 L1（UI+API）
- 接口: （可选）GET /api/admin/users
- 输入: admin token
- PASS: （MANUAL/UI）用户管理页中 uid_001 的级别显示为 L1；或（API）在 users 列表中 uid_001 的 quota_level/quotaLevel/level 字段为 "L1"
- FAIL: 显示非 L1（且不是显式分配结果）；或找不到 uid_001 记录
- BLOCKED: 无法获取 admin token；或 UI 环境不可用/前端不可达；或后端 users 接口不可用

### TC-008 管理员修改配额级别额度生效（UI+API）
- 接口: GET /api/admin/quota-levels（验证）
- 输入: admin token
- PASS: （MANUAL/UI）修改并保存后页面提示成功；且刷新/再次 GET 返回的目标额度字段与新值一致（数值精确相等）
- FAIL: 保存失败；或刷新后回滚；或 GET 返回与页面展示不一致
- BLOCKED: 无法获取 admin token；或 UI 不可用；或后端不可达

---

## M3 告警展示（TC-009 ~ TC-010）

### TC-009 月度 Token 进度条颜色与文案（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：按用量区间呈现正确颜色+文案：
  - <50%：绿色 + “使用正常”
  - 50~79%：黄色 + “已使用 x%，请注意控制用量”
  - 80~99%：橙色 + “已使用 x%，即将达到上限”
  - ≥100%：红色 + “已超出月度限额，请联系管理员”
- FAIL: 任一区间颜色/文案不匹配；或 x% 不等于实际计算（used/limit*100，允许四舍五入误差 ≤1% 需在报告注明）
- BLOCKED: UI 不可达；或缺少可构造的测试数据覆盖区间（数据前置不足）

### TC-010 每日请求次数进度条颜色与文案（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：
  - <80%：绿色 + “今日使用正常”
  - 80~99%：橙色 + “今日请求次数即将达到上限”
  - ≥100%：红色 + “今日请求次数已超出限额”
- FAIL: 颜色/文案与区间不匹配
- BLOCKED: UI 不可达；或数据前置不足

---

## M4 健康检查（TC-011）

### TC-011 健康检查接口返回依赖状态（API）
- 接口: GET /health
- 输入: 无
- PASS: status=200 且 JSON 可解析 且包含依赖状态字段（满足其一即可）：
  - body.postgres / body.postgresql / body.db
  - body.clickhouse / body.ch
  - body.ldap（或明确替代项）
- FAIL: status≠200 或响应非 JSON 或缺少任何依赖状态字段
- BLOCKED: 后端不可达

---

## M5 个人看板（TC-012 ~ TC-017）

### TC-012 个人面板加载：统计卡片与进度条（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：页面无明显错误（无 4xx/5xx 弹窗/白屏）；统计卡片存在（累计Token/活跃天数/日均Token等任意三张卡片可见）；两条进度条可见
- FAIL: 白屏/报错；关键组件缺失
- BLOCKED: 前端不可达；或无法登录（依赖 TC-002 的 token/登录能力）

### TC-013 趋势图 Tab：图表渲染（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：趋势图 Tab 进入后图表元素渲染（非空白）；输入/输出 Token 至少两种颜色可区分；控制台无 error（如可观测）
- FAIL: 图表空白/崩溃；Token 未分色
- BLOCKED: UI 不可达；或数据接口失败导致无法渲染

### TC-014 明细列表 Tab：表格加载（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：表格有表头且包含列：日期/模型/请求次数/输入Token/输出Token/总Token（允许字段名略有差异但语义一致）；至少 1 行数据或展示 empty state
- FAIL: 表格无法加载；列缺失；交互（分页/排序）存在但不可用
- BLOCKED: UI 不可达；或数据接口失败

### TC-015 模型分布 Tab：环形图渲染（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：环形图可见；图例包含至少 1 个模型；占比/数值不为 NaN
- FAIL: 图表空白；占比异常（NaN/负数）
- BLOCKED: UI 不可达；或数据不足

### TC-016 明细列表 CSV 导出（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：点击“导出 CSV”触发下载；文件大小>0；首行包含表头字段（用逗号分隔，列数≥5）
- FAIL: 不下载/下载空文件；字段不匹配
- BLOCKED: UI 不可达；浏览器下载受限

### TC-017 时间筛选互不影响（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：趋势图选择“最近7天”后切换到明细列表选择“最近30天”，再回趋势图仍保持“最近7天”（可通过 UI 文案/选中态确认）
- FAIL: Tab 切换导致筛选条件互相覆盖/丢失
- BLOCKED: UI 不可达

---

## M6 管理员-用户管理（TC-018 ~ TC-020）

### TC-018 管理员查询用户列表含配额级别列（API）
- 接口: GET /api/admin/users?month=4
- 输入: admin token
- PASS: status=200 且 JSON 可解析 且返回为列表（长度≥1） 且每条记录包含字段（满足其一即可）：
  - userId/user_id
  - quota_level/quotaLevel/level
  - monthly_token（或 month_tokens/monthToken/total_tokens 任一）
  - daily_requests（或 today_requests/todayRequest/request_count 任一）
- FAIL: status≠200；或非列表；或关键字段全集缺失
- BLOCKED: 后端不可达；或无法获取 admin token

### TC-019 用户管理页面加载（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：页面表格渲染；包含“配额级别”列；操作时无 401/403
- FAIL: 页面报 401/403；表格不渲染/列缺失
- BLOCKED: UI 不可达；或无法 admin 登录

### TC-020 未知用户部门显示“未知”（UI+API）
- 接口: （可选）GET /api/admin/departments 或 /api/admin/users
- 输入: admin token
- PASS: MANUAL：部门为空（NULL/空串）的记录在 UI 中归入“未知”；或 API 返回聚合包含 key/name 为 “未知” 的项
- FAIL: 空部门未归类；显示为空导致不可用
- BLOCKED: UI 不可达；或后端不可达

---

## M7 管理员-配额管理（TC-021 ~ TC-022）

### TC-021 配额级别管理页展示 L1/L2/L3 + 当前人数（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：仅展示 L1/L2/L3 三行；每行可见当前人数（整数≥0）；页面无新增/删除入口
- FAIL: 等级缺失/多出；人数不显示；出现新增/删除入口
- BLOCKED: UI 不可达；或无法 admin 登录

### TC-022 修改配额额度立即展示且持久化（UI）
- 接口:（验证）GET /api/admin/quota-levels
- 输入: admin token
- PASS: MANUAL：保存成功提示；刷新仍是新值；且 GET 返回一致
- FAIL: 保存失败/回滚/前后不一致
- BLOCKED: UI 不可达；或后端不可达

---

## M8 管理员-全局趋势（TC-023 ~ TC-024）

### TC-023 全局趋势页面图表渲染（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：汇总趋势图渲染（非空白）；横轴为日期；无明显报错
- FAIL: 图表空白/加载失败
- BLOCKED: UI 不可达；或数据接口失败

### TC-024 全局趋势按模型/部门分组筛选（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：切换分组（模型/部门）后图表刷新；至少一种可观察的差异（图例/series/数值）发生变化
- FAIL: 切换无任何变化；或触发错误
- BLOCKED: UI 不可达

---

## M9 管理员-部门汇总（TC-025 ~ TC-026）

### TC-025 管理员获取部门汇总数据（API）
- 接口: GET /api/admin/departments?month=4
- 输入: admin token
- PASS: status=200 且 JSON 可解析 且返回列表长度≥1 且每项包含（语义等价即可）：
  - enterprise（部门/企业名）
  - user_count
  - monthly_token
  - monthly_requests
  - avg_token_per_user
- FAIL: status≠200；或返回结构异常；或关键字段全缺失
- BLOCKED: 后端不可达；或无法获取 admin token

### TC-026 部门汇总页面表格展示（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：表格可见且至少一行；存在“未知”分组（当存在 enterprise 为空数据时）
- FAIL: 表格不渲染；未知分组逻辑错误
- BLOCKED: UI 不可达；或无可用数据构造“未知”

---

## M10 管理员-排行榜（TC-027 ~ TC-028）

### TC-027 排行榜页面 TopN 数据加载（UI+API）
- 接口: （如有）/api/admin/rank 或页面调用的榜单接口
- 输入: admin token
- PASS: MANUAL：TopN 表格加载并展示 N 条（N=10/20/50 之一）；若提供切换，切换后条数随之改变
- FAIL: 表格空白/报错；切换无效
- BLOCKED: UI 不可达；或接口不可达

### TC-028 普通用户不可见排行榜菜单（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：uid_001 登录后菜单中不出现“用量排行榜”；若直接访问路由，返回 403 或被重定向至无权限页
- FAIL: 普通用户可见/可访问排行榜
- BLOCKED: UI 不可达；或无法 uid 登录

---

## M11 邮件通知增强（US-017~022）(TC-029 ~ TC-040)

### TC-029 通知设置页面可访问且布局正确（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：页面可访问；包含模块：enabled 开关、check_interval_minutes、thresholds、email_domain、模板编辑区
- FAIL: 页面 404/401；模块缺失
- BLOCKED: UI 不可达；或无法 admin 登录

### TC-030 阈值配置显示（50/80/100%）且输入框宽度足够（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：可见 3 档阈值（默认 50/80/100）；每档可输入数字；输入 0 后可被接受并保存（如有保存动作）；布局不截断（输入框可完整显示至少 3 位数字）
- FAIL: 阈值档位缺失；输入不可用；布局导致不可操作
- BLOCKED: UI 不可达

### TC-031 邮件模板编辑页 + 占位符说明表格可见（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：存在 title 输入框、body HTML 输入框；占位符说明区域可展开并可见变量列表/表格
- FAIL: 任一关键控件缺失
- BLOCKED: UI 不可达

### TC-032 占位符点击复制（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：点击占位符（如 {{username}}）后出现“复制成功”提示；粘贴内容与占位符文本完全一致
- FAIL: 无提示；粘贴内容不一致
- BLOCKED: UI 不可达；或浏览器剪贴板权限受限

### TC-033 获取邮件模板（API）
- 接口: GET /api/admin/email-template
- 输入: admin token
- PASS: status=200 且 JSON 可解析 且 body.title 为字符串（可空但字段存在） 且 body.body 为字符串（可空但字段存在）
- FAIL: status≠200；或字段缺失/类型不对；或响应非 JSON
- BLOCKED: 后端不可达；或无法获取 admin token

### TC-034 获取模板变量列表为 9 个（API）
- 接口: GET /api/admin/email-template/variables
- 输入: admin token
- PASS: status=200 且 JSON 可解析 且变量集合大小=9 且包含：username,user_id,quota_type_label,used,limit,percent,threshold,period,reset_time（大小写不敏感）
- FAIL: status≠200；或数量≠9；或缺少任一必需变量
- BLOCKED: 后端不可达；或无法获取 admin token

### TC-035 模板预览渲染 HTML（API）
- 接口: POST /api/admin/email-template/preview
- 输入: admin token（body 可为空或包含示例数据，以后端要求为准）
- PASS: status=200 且响应可解析为 JSON 或 text；且返回内容包含 "<" 与 ">"（可视为 HTML）且不包含未替换的 "{{"（允许未知占位符保留但需记录）
- FAIL: status≠200；或预览为空；或大量占位符未替换（包含 "{{"）
- BLOCKED: 后端不可达；或接口未实现

### TC-036 保存邮件模板成功（API）
- 接口: PUT /api/admin/email-template
- 输入: admin token；{title: "...", body: "..."}
- PASS: PUT status ∈ {200,204}；随后 GET /api/admin/email-template status=200 且返回的 title/body 与新值一致
- FAIL: PUT status 非 2xx；或 GET 读到旧值
- BLOCKED: 后端不可达；或无法获取 admin token

### TC-037 邮件域名配置输入框 + tooltip（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：存在 email_domain 输入框；存在 tooltip/说明：mail 为空时拼接 user_id@domain；空值校验（允许空或提示必填）行为一致且不导致崩溃
- FAIL: 控件缺失；校验异常导致无法保存/页面错误
- BLOCKED: UI 不可达

### TC-038 检查间隔下拉（30/60/120）且提示“修改后重启生效”（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：下拉仅包含 30/60/120；页面有提示“修改后重启后端/调度器生效”（文案可近似）
- FAIL: 选项多/少；无提示
- BLOCKED: UI 不可达

### TC-039 通知开关全局 on/off（UI）
- 接口:（可选验证）GET/PUT 通知配置接口（如存在）
- 输入: admin
- PASS: MANUAL：enabled 切换保存成功；刷新后状态保持（持久化）；关闭后本轮只验证配置保存，不强制验证实际不再发邮件
- FAIL: 保存失败；刷新回滚
- BLOCKED: UI 不可达；或后端配置接口不可用

### TC-040 模板预览对话框：9 占位符正确渲染（UI）
- 接口: N/A
- 输入: N/A
- PASS: MANUAL：预览内容中 9 个占位符均被替换（不出现 {{username}} 等原文本）；HTML 排版可读，无乱码
- FAIL: 任一占位符未替换；乱码/排版严重错乱
- BLOCKED: UI 不可达；或预览功能不可用
