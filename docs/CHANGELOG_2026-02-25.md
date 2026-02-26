# 更新日志（2026-02-25）

## v0.1.1（当前基线）

### 已完成（Phase 2）
- Quiz 完成「录题 - 刷题 - 判题」闭环，题库读写全链路接入 SQLite。
- 资源页可触发真实 AI 出题流程，支持从本地资源读取文本后生成并入库。
- 复习调度升级为基础 SM-2（`interval` / `ease_factor` / `next_review`）。
- 新增「今日待复习」视图与 `get_due_questions` 查询。
- Notes AI 聊天记录已迁移到 SQLite（不再依赖 localStorage）。

### 关键能力状态
- AI 默认模型：`deepseek-ai/DeepSeek-V3.2`
- AI 客户端：SiliconFlow OpenAI 兼容接口 + SSE 流式输出
- 知识库/资源/题库：已形成可持续迭代的数据基座

---

## Phase 3 进展（局域网共享）

### 目标
- 将 Settings「同步与备份」从占位 UI 升级为真实系统状态。
- 建立本地 HTTP 服务基座，为 iPad/同网设备访问铺路。

### 已落地（本次）
- Rust 命令：`get_local_ip`（返回真实局域网 IPv4）。
- Rust 命令：`toggle_local_server(enable, port)`（后台启停本地服务）。
- Axum 服务升级：
  - 加入 CORS 中间件（开发调试跨域放开）。
  - 托管静态前端资源（`dist/build`），iPad 访问 `http://<IP>:9527` 可直接渲染页面。
- REST API 新增：
  - `GET /api/tasks`（支持 `?date=YYYY-MM-DD`）
  - `POST /api/tasks`
  - `PUT /api/tasks/{id}`
  - `DELETE /api/tasks/{id}`
  - `GET /api/quiz/all`
  - `GET /api/quiz/due`
- Tasks 底层 SQLite 查询已抽离为公共函数，Tauri Command 与 Axum Handler 共用同一套逻辑。
- 题库查询逻辑抽离为公共 SQLite 函数，Tauri Command 与 Axum Handler 复用同一套底层查询。
- 前端新增 `src/utils/apiBridge.ts`：
  - Tauri 环境走 `invoke`
  - Web 环境走 HTTP（`http://<hostname>:9527/api/quiz/*`）
- `apiBridge.ts` 已扩展 Tasks 双模能力：`fetchTasks`、`addTask`、`modifyTask`、`removeTask`。
- Quiz 页面已替换直接 `invoke` 调用，改为统一桥接层。
- Tasks 页面任务 CRUD 已迁移到桥接层；番茄钟全屏支持浏览器 Fullscreen API，并在不支持时自动降级为页面内最大化。

### 说明
- 本日志已按发布准备做精简，历史细节改由 Git 提交记录追溯。

---

## Phase 3 最终冲刺（已完成）

### 新增产品判断
- iPad/手机在局域网中的核心定位是“任务打卡 + 番茄钟副屏控制台”与“知识资料跨端阅读”，不是重度刷题主战场。

### 本轮收口结果（代码落地）
- 首页（Dashboard）已完成双模数据桥接，Web 端不再触发原生 `invoke` 链路。
- Axum 已补齐跨端阅读接口：
  - `GET /api/notes/tree`
  - `GET /api/notes/file?path=...`
  - `GET /api/resources`
- `apiBridge.ts` 已扩展统一桥接：
  - `fetchDashboardStats()`
  - `fetchNotesTree()`
  - `fetchNoteContent(relativePath)`
  - `fetchResources()`
  - `invokeDesktop()`（桌面专属写操作统一入口）
- Dashboard / Notes / Resources 已统一走桥接层，页面内不再直接依赖 `@tauri-apps/api/core`。
- Web 端防御性降级已生效：文件管理动作改为禁用/只读提示，统一文案为“局域网模式下仅支持跨端阅读，请在桌面端进行文件管理”。

---

## Phase 4 系统收尾（Settings 去 Mock）

### 已落地（本次）
- `Settings -> 考研目标` 已从写死默认值改为真实持久化字段：
  - `targetUniversity`
  - `examDate`
  - `targetScores`（政治/英语/数学/专业课）
- 设置项已与本地设置存储双向绑定，重启后可自动回显。
- `Settings -> 隐私与安全 -> 存储用量` 已接入 Rust 真实统计命令：
  - `get_storage_usage()`
  - 展示 SQLite、知识库/资源站、日志和总占用的真实字节换算结果。
- 新增 Rust 维护命令并接入前端按钮：
  - `clear_cache(cache_type)`
  - `reset_all_data()`
- 分类清理与一键清空已接真实调用，且加入前端确认拦截（重置为二次确认）。

---

## Phase 5 桌面原生化与终极打包（v1.0）

### 已落地（本次）
- 版本升级到 `1.0.0`：`package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json`。
- 托盘能力升级：新增“显示/隐藏面板”与“彻底退出”，支持左键点击托盘图标切换窗口显隐。
- 关闭按钮行为改为后台常驻：点击窗口 `X` 拦截为 `window.hide()`，不退出服务。
- 新增全局快捷键：`CmdOrCtrl+Shift+E`，用于快速呼出/隐藏主窗口。
- Axum 静态资源服务重构：移除 `ServeDir`，改为 `rust-embed` 内嵌前端资源并提供 SPA `index.html` fallback，修复生产环境局域网访问白屏风险。
- 新增交付文档：`docs/report.md`（依赖清单、托盘/快捷键代码、嵌入式静态资源路由代码）。

---

## v1.0 发布后交互优化（2026-02-25）

### 已落地（本次）
- `Settings -> 快捷键` 补充桌面端原生快捷入口说明：
  - `Ctrl/Cmd + Shift + E`（全局唤醒/隐藏主窗口）
  - 托盘左键/双击（显示或隐藏主窗口）
- `Settings -> 隐私与安全 -> 分类清理 / 一键清空` 由 `window.confirm` 升级为统一 `ConfirmDialog`，交互风格与知识库删除确认保持一致。
- 一键清空保留双重确认流程（首层确认 + 二次不可恢复确认），并确保仅在确认后执行删除。
- 数据存储白皮书补充 `eva.settings.v1` 最新字段快照与维护命令映射，覆盖考研目标与系统维护相关设计。

---

## v1.0.1 预发布收敛（2026-02-26）

### 已落地（本次）
- `PRD_Roadmap` 新增 `4.13 移动端与 Web 局域网适配规范`：明确横竖屏布局策略、背景视觉焦点锚定 `80% center`、Web 端功能白名单与 Settings 强制拦截。
- `Layout` 完成移动端底部导航与内容容器断点重构：移动端仅保留首页/任务/知识库/练功房入口。
- `App` 增加 `/settings` 路由防守：Web 环境统一提示“设置仅在桌面端开放”。
- `Dashboard` 与 `Tasks` 接入 `SYNC_TASKS` 事件静默刷新，避免跨端操作后手动刷新页面。
- `Tasks` 列表触控优化：增大勾选热区并加大列表项间距。
- Rust/Axum 新增 `/api/ws` WebSocket 路由与广播中心，任务写入后同时触发：
  - 广播总线消息 `{ "action": "SYNC_TASKS" }`
  - 桌面端 Tauri 事件 `sync-update`

---

## v1.0.2 交互修正（2026-02-26）

### 已落地（本次）
- `Notes` 在手机/平板（紧凑视口）与局域网 Web 端默认隐藏 AI 助手面板，避免挤压文档浏览区域；知识库树区域自动占满主内容宽度。
- `Settings -> 考研目标` 与 `Dashboard -> 终极目标` 倒计时改为基于实时时钟刷新（按周期重算），并统一跟随 `examDate` 配置更新。
- `Dashboard` 顶部 `Target Date` 由硬编码改为读取设置中的考试日期。
- `Blog`：
  - 一键生成今日留痕改为调用结构化模板（带数据快照、完成清单、复盘结论、明日三步）。
  - 一键 AI 复盘的提示词升级为“四段式输出”模板（今日结论/做对了什么/主要阻塞/明日行动），输出更可执行。

---

## v1.2.0 (Release)（Phase 6 · 极简周复盘闭环，2026-02-26）

### 已落地（本次）
- `Tasks` 新增「一键克隆昨日任务」：
  - 支持在任务快速输入区与空列表占位区直接触发。
  - 以 `selectedDate - 1` 为源日期读取任务，批量创建到当前日期，默认状态为 `todo`。
  - 克隆成功后提供 Toast 提示，并静默刷新列表。
- Rust 后端新增周度聚合命令：
  - `get_weekly_stats(end_date)`（Tauri Command）
  - 统计过去 7 天：
    - `total_focus_minutes`
    - `completion_rate`
    - `subject_distribution`（408/数学/英语/政治）
- Axum 新增周度统计 API：
  - `GET /api/stats/weekly?end_date=YYYY-MM-DD`
- 前端桥接层 `apiBridge.ts` 新增：
  - `fetchWeeklyStats(endDate)`
  - 桌面端走 `invoke("get_weekly_stats")`，Web 局域网走 HTTP `/api/stats/weekly`。
- 前端新增 `WeeklyReview` 页面（`/weekly`）：
  - 顶层基准日选择器（`endDate`，默认当天）。
  - 核心指标卡：本周总专注时长 + 本周任务完成率（环形进度）。
  - 图表区接入 `recharts`，使用 `PieChart` 渲染 `subject_distribution`（EVA 配色）。
- 新增「周度学情深度剖析」AI 模块：
  - 按周统计数据自动构建 Prompt 并调用已有 `ai_proxy`。
  - 输出以 Markdown 面板渲染，结构化呈现“数据诊断 / 偏科预警 / 下周行动”。
- 全局导航接入完成：
  - `App.tsx` 新增 `/weekly` 路由。
  - 桌面端侧边栏新增「周复盘」入口。
  - Web 移动端底部导航新增「周复盘」入口。
- `Dashboard` 数据大盘（NERV 监控）新增折叠交互：
  - 默认折叠隐藏，按需展开热力图与监控块。
  - 折叠状态本地持久化，跨次打开保持一致。
  - 移动端折叠态显示精简摘要卡，降低误触与视觉负担。
- 移动端底部导航瘦身：
  - 移除「练功房」入口，恢复 `grid-cols-4`。
  - 保留：首页 / 任务 / 知识库 / 周复盘。
- 前端依赖新增：
  - `recharts`

### 说明
- Phase 6 第一阶段「周统计 + 周复盘页面 + AI 剖析 + 导航入口」已闭环。
