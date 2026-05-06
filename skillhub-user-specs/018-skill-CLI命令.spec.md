# Skill CLI 命令

## 1. 需求背景
- 目标：提供命令行工具，让开发者能够在终端中搜索、安装、更新、发布和管理 Skill（技能包），实现项目级别的 Skill 依赖管理
- 成功标准：开发者能通过 CLI 完成 Skill 的完整生命周期操作（搜索→安装→使用→更新→发布），操作体验类似 npm/pip
- 范围边界：CLI 工具仅负责本地操作和与 SkillHub 服务端的交互，不包含 Web 界面操作

## 2. 需求描述
- 功能概述：CLI 工具提供 skill search/info/install/update/list/publish/uninstall 七大核心命令，支持开发者在项目中管理 Skill 依赖。安装的 Skill 记录在项目的 skill.lock 文件中，支持版本锁定和去重下载
- 业务价值：让开发者无需离开终端即可完成 Skill 管理，提升开发效率；通过 lock 文件确保团队成员使用一致的 Skill 版本
- 核心场景：开发者在新项目中搜索并安装所需的代码审查 Skill，后续通过 update 命令获取最新版本

## 3. 用户旅程
- 主要用户：开发者
- 主路径：
  1. 开发者在终端执行 `skillhub skill search code-review` 搜索相关 Skill
  2. 从搜索结果中找到目标 Skill，执行 `skillhub skill info @team/code-review` 查看详情
  3. 确认后执行 `skillhub skill install @team/code-review` 安装到当前项目
  4. 系统下载 Skill 包并解压到项目的 `.skills/` 目录，生成/更新 `skill.lock`
  5. 开发者使用 `skillhub skill list` 查看当前项目已安装的所有 Skill
  6. 当有新版本时，执行 `skillhub skill update @team/code-review` 更新
  7. 不再需要时，执行 `skillhub skill uninstall @team/code-review` 移除
- 异常路径：
  1. 搜索无结果 → 提示"未找到匹配的 Skill"，建议调整关键词或检查网络
  2. 安装的 Skill 版本不存在 → 提示"指定版本不存在"，列出可用版本
  3. 网络中断 → 提示"连接服务器失败"，支持 --retry 参数重试
  4. 版本冲突 → 提示当前锁定版本与请求版本不兼容，提供 --force 选项
  5. 未登录状态执行 publish → 提示需要先执行 `skillhub auth login` 登录

## 4. 命令结构
- 命令列表：
  - `skillhub skill search <keyword>` — 按关键词搜索 Skill（支持标签、分类筛选）
  - `skillhub skill info <name>` — 查看 Skill 详细信息（版本、描述、依赖、下载量）
  - `skillhub skill install <name>[@version]` — 安装指定 Skill 到当前项目
  - `skillhub skill update [name]` — 更新指定或全部 Skill 到最新兼容版本
  - `skillhub skill list` — 列出当前项目已安装的 Skill 及版本
  - `skillhub skill publish` — 将当前目录打包为 Skill 发布到 SkillHub
  - `skillhub skill uninstall <name>` — 从当前项目移除指定 Skill
- 全局参数：
  - `--server <url>` — 指定 SkillHub 服务器地址
  - `--token <token>` — 使用指定的认证 Token
  - `--json` — 以 JSON 格式输出结果（便于脚本集成）
  - `--verbose` — 显示详细日志
- 状态流转：未安装 → 安装中（下载+解压） → 已安装 → 更新中 → 已更新 / 已卸载

## 5. 输入输出

### 5.1 输入
| 场景 | 输入 | 说明 |
|------|------|------|
| 搜索 Skill | 关键词字符串 | 支持按名称、标签、分类搜索 |
| 查看详情 | Skill 名称 | 格式为 @namespace/skill-name 或 skill-name |
| 安装 Skill | Skill 名称[@版本号] | 版本号可选，不指定则安装最新稳定版 |
| 更新 Skill | Skill 名称（可选） | 不指定名称则更新全部已安装 Skill |
| 发布 Skill | 当前目录 | 需包含 SKILL.md 和合法的包结构 |
| 卸载 Skill | Skill 名称 | 从 .skills/ 目录移除并更新 skill.lock |

### 5.2 输出
| 场景 | 输出 | 说明 |
|------|------|------|
| 搜索成功 | 结果列表 | 显示名称、版本、描述、下载量（表格或列表格式） |
| 详情查看 | 完整信息 | 名称、作者、最新版本、所有版本、描述、依赖列表 |
| 安装成功 | 确认信息 | 显示已安装的 Skill 名称、版本、安装路径 |
| 更新成功 | 变更摘要 | 显示更新前后的版本号差异 |
| 发布成功 | 发布确认 | 显示版本号、审核状态（待审核） |
| 列表展示 | 已安装列表 | 当前项目所有 Skill 的名称、版本、状态 |
