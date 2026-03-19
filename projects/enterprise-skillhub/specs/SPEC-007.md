# SPEC-007: 前端 Web UI (Enterprise SkillHub)

> 状态: draft
> 优先级: P0
> 负责人: PO Agent
> 关联 Task: TASK-B1~B11

## 1. 概述
为 Enterprise SkillHub 构建企业级 Web UI。在弃用原版 ClawHub 的 BFF 和 Convex 后段的情况下，使用 TanStack Start (React 19) 框架配合 Tailwind CSS + Radix UI 重构应用前端，直连已完成的 NestJS 业务 REST API。涵盖认证、发现、发布、审核、后台和管理全核心业务的完整用户界面闭环。

## 2. 技术选型（重要！）

### 2.1 基础与改造方案
基于 ClawHub 原版技术栈做企业化改造。

*   **保留**:
    *   构建工具: Vite 7.3, Bun (Runtime)
    *   核心框架: TanStack Start + React 19 (SSR), TanStack Router
    *   样式组件: Tailwind CSS v4, clsx, tailwind-merge, Radix UI
    *   特殊组件: Monaco Editor (在线编辑代码), react-markdown + remark-gfm (Skill.md 渲染)
    *   代码规范: oxlint + TypeScript 5.9, Vitest + Playwright
*   **替换**:
    *   Server/BFF: 移除 Nitro + h3。由 TanStack Start (API Routes 配合 Server Functions) 直连企业内网的 NestJS REST API。
    *   后端数据层: 移除 Convex 及其 hook (`useQuery`/`useMutation`)，替换为 `axios` 或 `fetch` 结合 `TanStack Query`。
    *   认证机制: 移除 Auth.js + `@convex-dev/auth`。替换为企业 LDAP JWT 认证 (Axios Interceptors/Fetch 携带 Authorization Header)。
    *   部署方式: 移除 Vercel 托管。替换为企业内网 K8s Docker 容器部署 (基于 Nginx / Node.js SSR runtime)。
*   **新增**:
    *   状态管理: 引入 Zustand (轻量全局共享状态) 与 TanStack Query (Server 状态缓存)。
    *   HTTP 客户端: 引入 Axios (拦截器处理 JWT 和全局 Error)。

### 2.2 技术栈映射表：ClawHub → SkillHub
| ClawHub 原版 (SaaS) | SkillHub 企业版 (K8s 私有化) | 备注 |
| :--- | :--- | :--- |
| Convex (Backend/Database) | Nest.js + PostgreSQL + Prisma | API 直连 |
| @convex-dev/auth (Auth) | JWT + 拦截器 (后端提供 LDAP) | TanStack Start 会话维持 |
| Convex useQuery Hooks | TanStack Query (@tanstack/react-query) | 数据缓存及状态管理 |
| Vercel Deployment | Docker + K8s Helm Chart | Nginx 静态文件 / Node SSR 服务 |
| Nitro + h3 (BFF) | TanStack Start Server Functions | 可选，优先直接请求 NestJS API |

### 2.3 项目结构 (目录树)
```
src/
├── app/
│   ├── routes/                # TanStack Router 路由 (文件即路由)
│   │   ├── _layout.tsx        # 主框架 Layout
│   │   ├── index.tsx          # 市场大厅
│   │   ├── login.tsx          # 认证页
│   │   ├── skills/            # Skill 模块路由
│   │   ├── admin/             # 管理员后台路由
│   │   └── templates/         # 模板模块路由
│   ├── components/            # 业务与通用组件
│   │   ├── ui/                # 基础 Radix 包装组件
│   │   ├── layout/            # Navbar, Sidebar, Footer
│   │   └── domain/            # 业务组件 (SkillCard, VersionUploader...)
│   ├── lib/                   # 核心库
│   │   ├── api-client.ts      # Axios 实例及拦截器
│   │   └── auth.ts            # JWT Cookie 相关
│   ├── queries/               # TanStack Query Hook 封装
│   ├── stores/                # Zustand Store 定义
│   └── routeTree.gen.ts       # TanStack Router 自动生成文件
├── public/                    # 静态资源
├── package.json
└── vite.config.ts
```

### 2.4 构建/开发/部署命令
*   **开发**: `bun run dev`
*   **构建**: `bun run build`
*   **启动 (生产)**: `bun run start`
*   **Lint/Test**: `bun run lint`, `bun run test`

## 3. 页面清单 & 路由表

根据 SPEC-001~006 归纳。

| 模块 | 页面路由 | 权限要求 | 数据依赖 (调哪些 API) | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| 认证 | `/login` | Public | `POST /api/auth/login` | ✨ 新增 |
| 首页 | `/` | User | `GET /api/v1/skills` (热门/最新) | 💡 改造 |
| 搜索 | `/search` | User | `GET /api/v1/search` | 💡 改造 |
| Skill 详情 | `/skills/$slug` | User | `GET /api/v1/skills/:slug`, `GET /api/v1/skills/:slug/versions` | 💡 改造 |
| 我的发布 | `/me/skills` | User/Publisher | `GET /api/v1/skills?ownerId=me` | ✨ 新增 |
| 发布版本 | `/skills/$slug/upload` | Publisher | `POST /api/v1/skills/:slug/versions` (包含 ZIP) | ✨ 新增 |
| 审核大厅 | `/review` | Reviewer/Admin | `GET /api/v1/reviews?status=PENDING` | ✨ 新增 |
| 审核详情 | `/review/$id` | Reviewer/Admin | `GET /api/v1/reviews/:id`, `PATCH /api/v1/reviews/:id/approve` 等 | ✨ 新增 |
| 模板市场 | `/templates` | User | `GET /api/v1/templates` | ✨ 新增 |
| 模板详情 | `/templates/$id` | User | `GET /api/v1/templates/:id` | ✨ 新增 |
| 管理看板 | `/admin` | Admin | `GET /api/v1/admin/dashboard` | ✨ 新增 |
| 用户管理 | `/admin/users` | Admin | `GET /api/v1/admin/users`, `PATCH /api/v1/admin/users/:id/role` | ✨ 新增 |

## 4. 组件设计

### 4.1 全局组件
*   `Layout`: 应用最外层结构。包含 Navbar 和 Footer。如果处于 `admin/` 或 `me/` 路由下，还会提供 `Sidebar`。
*   `Navbar`: 顶部导航，包含 Logo、`OmniSearchBar` (全局搜索框，集成 debounce)、发布入口和 `UserProfileMenu` (头像、用户名展示、登出)。
*   `Sidebar`: 后台/个人中心侧边栏。展示菜单树，当前路由高亮。
*   `Footer`: 版权与企业合规信息。

### 4.2 业务组件
*   `OmniSearchBar`: 全局搜索，包含防抖逻辑。下拉展示补全或直接跳转 `/search`。
*   `SkillCard`: 展示 Skill 的标题、简介、图标。右上角带有状态徽章（针对我的发布/审核列表），以及部门/全局可见性 Tag。
*   `CategoryFilter` & `TagCloud`: 市场页侧边栏的筛选项。
*   `VersionUploader`: 拖拽区域上传 ZIP 文件。读取文件信息并校验大小/类型，带进度条。
*   `VersionHistoryTable`: 表格形式列出所有的版本号、更新时间、Changelog、审核状态。
*   `FileListView`: 在版本详情展示的树形文件预览结构。
*   `ReviewDashboard`: 列表展示等待审核项。
*   `ScanReportView`: 用红黄绿图标直观展示自动代码扫描（AutoScan）和安全合规结果的卡片面板。
*   `DecisionPanel`: 用于审核详情页。包含 "Approve", "Reject", "Revision Requested" 三个主按钮。旁边带必填 `Comment` 提交框。
*   `CodeDiffViewer` (P2): 调用 Monaco Editor 实现前一版本和新版本的 side-by-side diff。

## 5. 数据层设计

### 5.1 API Client 封装
使用 Axios 封装 `apiClient`：
*   **Request Interceptor**: 若存在 JWT Token（存储在状态或内存中，实际生产推荐 HttpOnly Cookie 或安全的 LocalStorage 同步至内存），统一挂载 `Authorization: Bearer <token>` 头部。
*   **Response Interceptor**: 全局拦截 401 (Token 过期/未登录)，触发前端清理 Token 并弹窗提示/重定向至 `/login`；全局拦截 403 / 500 等业务异常并调用 Toast 通知。

### 5.2 状态管理方案
*   **TanStack Query**: 负责所有的 Server 状态（如 `/api/v1/skills` 列表，搜索结果，详情）。配置 `staleTime: 60000` (1分钟)。对 POST/PATCH 操作后执行 `queryClient.invalidateQueries` 以自动刷新界面数据。
*   **Zustand**: 负责客户端纯本地状态，如 Sidebar 的折叠状态、弹窗的显示隐藏、当前登录用户的部分非敏感配置。

### 5.3 缓存策略
*   查询接口尽量复用 TanStack Query 的默认 SWR (Stale-While-Revalidate) 机制。
*   对于 `/api/v1/admin/dashboard` 等较重的统计接口，可将 `staleTime` 设置为 5 分钟，降低后端并发。

### 5.4 错误处理
*   `ui/toast` 组件：封装统一的错误提示。
*   TanStack Router 中使用 `errorComponent` 处理页面级 Crash（如后端不可用返回 500）。

## 6. 安全要求

*   **JWT Token 存储**: 优先设计为后端设置 `HttpOnly, Secure, SameSite=Strict` Cookie 返回。前端 Axios 请求配置 `withCredentials: true`。若必须在前端提取数据，提供一个无感刷新的短效 Token 存 LocalStorage，结合长期 Cookie 的 `/api/auth/refresh`。
*   **CSRF 防护**: 如果使用 Cookie，由于 SameSite=Strict 可以一定程度防御。针对敏感 API 操作，可以在页面注入并在 Axios header 挂载 CSRF Token。
*   **XSS 防护**: React 渲染天然防止基础 XSS；在 `Skill.md` Markdown 渲染使用 `react-markdown` 并配合 `rehype-sanitize` 以及 HTML 净化库（如 `DOMPurify`）。
*   **权限路由守卫**: TanStack Router 中使用 `beforeLoad` 生命周期进行拦截。检查用户 Role 属性，若 `role !== 'ADMIN'` 访问 `/admin` 则跳转到 `/` 并提示无权限。未登录状态访问非白名单页面重定向 `/login`。

## 7. 验收标准（AC）

*   **AC-F1 (Login Page) - P0**
    *   *Given* 用户未登录，*When* 访问根路径 `/`，*Then* 页面被重定向至 `/login`。
    *   *Given* 用户在 `/login` 输入正确的 LDAP 账号密码，*When* 点击登录，*Then* 调用 API 成功，跳转到 `/` 且顶部导航显示用户名。
*   **AC-F2 (Marketplace) - P0**
    *   *Given* 已登录用户访问 `/`，*When* 页面加载完成，*Then* 呈现热门/最新 Skill 列表，分类筛选器可见，分页或无限滚动可用。
*   **AC-F3 (OmniSearchBar) - P0**
    *   *Given* 用户在导航栏搜索框输入 "数据库"，*When* 等待 300ms 后，*Then* 调用 `/api/v1/search` 并在下拉列表或跳转页面显示包含相似度匹配的卡片结果。
*   **AC-F4 (VersionUploader) - P1**
    *   *Given* 具备 Publisher 权限用户进入 `/skills/xxx/upload`，*When* 拖拽 1 个 ZIP 包并填写版本信息点击提交，*Then* 调用 `/api/v1/skills/:slug/versions` 并在上传进度达到 100% 后跳转回详情页，显示该版本状态为 "PENDING_AUTO"。
*   **AC-F5 (Review Dashboard & Decision) - P0**
    *   *Given* 具备 Reviewer 权限用户进入 `/review`，*When* 点击待审核 Skill 进入详情，*Then* 渲染 `ScanReportView` 展示安全扫描结果，并且渲染 `DecisionPanel`。
    *   *Given* 审核详情页的 `DecisionPanel`，*When* 填写评价并点击 Approve，*Then* 提交 API 请求并返回成功，该记录从 PENDING 列表移除。
*   **AC-F6 (Admin Dashboard) - P1**
    *   *Given* 具备 Admin 权限用户进入 `/admin`，*When* 页面渲染，*Then* 能够正常调用 `/api/v1/admin/dashboard` 并以图表显示活跃用户数和 Top Skill 下载量。

*(所有前端 AC 必须能在后续通过 Playwright 编写 E2E 测试例来自动验证)*

## 8. Sprint 拆分建议

依据 `SPEC-COVERAGE-REVIEW.md` 的 P0/P1/P2 定义。

*   **Sprint F1 (发现与认证闭环) [P0]**
    *   包含: TanStack Start 框架搭建、Layout、LDAP Login 页、Marketplace (列表与分类)、Skill 详情页渲染、OmniSearchBar。
    *   预估工作量: 1周 (2人)
*   **Sprint F2 (发布与审核业务闭环) [P0]**
    *   包含: Review Dashboard (审核大厅)、Review 详情 (ScanReportView + DecisionPanel)、我的发布 (My Skills)、VersionUploader (ZIP 上传组件)。
    *   预估工作量: 1.5周 (2人)
*   **Sprint F3 (模板、后台与统计) [P1/P2]**
    *   包含: 模板市场、Admin Dashboard 数据面板图表、CodeDiffViewer 进阶组件、管理员用户权限管理页。
    *   预估工作量: 1周 (1人)
