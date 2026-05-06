# 项目模板 CLI 初始化功能

## 1. 需求背景
- 目标：提供命令行工具 `skillhub init`，使用户在本地终端一键拉取模板并初始化项目。
- 成功标准：CLI 能成功拉取脚手架文件、解析变量、下载对应版本的 Skill 依赖，并适配不同的 AI IDE。
- 范围边界：仅包含 CLI 端的下载、解压、变量替换和目录结构生成逻辑。

## 2. 需求描述
- 功能概述：开发者在终端输入 `skillhub init --template @team/name`，CLI 会向后端请求该模板及其依赖的所有 Skill，将脚手架代码解压到本地，提示用户输入动态变量（如项目名、端口号），并根据 `--ai` 参数生成专属的提示词和工具配置目录（如 `.claude/`, `.cursor/`）。
- 业务价值：极大缩短项目冷启动时间，规范团队项目结构，并让 AI 编码助手一开箱即"拥有"企业内部知识和工具。
- 核心场景：新员工入职第一天，运行一条命令，就能得到一个配置了公司私有安全扫描规则（Skill）和 SpringBoot 后端框架的 Cursor 项目。

## 3. 用户旅程
- 主要用户：终端开发者（Developer）
- 主路径：
  1. 开发者在空目录执行 `skillhub init --template @backend-team/java-springboot --ai cursor`
  2. CLI 向 SkillHub 请求模板信息及鉴权
  3. CLI 下载模板的 ZIP 包并解压
  4. CLI 读取 `template.json`，发现有变量需替换，提示输入 `projectName: `
  5. 用户输入 "my-service"
  6. CLI 替换所有匹配文件中的 `{{projectName}}`
  7. CLI 下载模板声明的 Skill（如 `code-review`），放入 `.cursor/rules/` 和 `.cursor/skills/`
  8. 生成 `.cursorrules` 根文件
  9. CLI 运行 `postInit` 脚本（如 `npm install` 或 `mvn clean`）
  10. 提示"初始化成功"
- 异常路径：
  1. 未登录或 Token 过期 → CLI 提示先运行 `skillhub login`
  2. 模板不存在或无权访问 → CLI 报错 404/403
  3. 指定版本冲突或未找到对应 Skill → CLI 报错并中断初始化

## 4. 命令行交互结构
- 交互流：命令输入 → 权限校验 → 参数缺失时交互式提问 → 下载解压 → 变量替换 → AI 适配 → 后置脚本 → 成功提示
- 关键输出区域：
  - 进度条（下载模板与 Skill 时）
  - 交互式 Prompt（输入项目名、端口号等）
  - 成功后的目录结构树状预览 (Tree view)
- 状态流转：解析命令 → 鉴权 → 拉取数据 → 本地生成 → 完成

## 4. 命令结构
- 命令格式：`openclaw template init`
- 关键区域：无
- 状态流转：执行到结束

## 5. 输入输出

### 5.1 输入
| 场景 | 输入 | 说明 |
|------|------|------|
| 命令行执行 | 模板名+AI工具 | `skillhub init --template @xxx/yyy --ai claude` |
| 直接Git初始化 | Git URL | `skillhub init --git <url> --ref <tag> --ai cursor` |
| 变量交互 | 用户输入文本 | 响应 CLI 提示（如项目名称） |
| 更新模板 | 命令参数 | `skillhub template update`，可带 `--dry-run` 预览 |

### 5.2 输出
| 场景 | 输出 | 说明 |
|------|------|------|
| AI 适配 (Claude) | 目录结构 | 生成 `.claude/rules/`, `.claude/commands/`, `CLAUDE.md` 等 |
| AI 适配 (Cursor) | 目录结构 | 生成 `.cursor/rules/`, `.cursorrules` 等 |
| AI 适配 (CodeBuddy)| 目录结构 | 生成 `.codebuddy/rules.yaml`, `.codebuddy/agents/` 等 |
| 更新冲突提示 | 冲突文件 | 在 `.skillhub/conflicts/` 生成有修改冲突的文件供手动合并 |
