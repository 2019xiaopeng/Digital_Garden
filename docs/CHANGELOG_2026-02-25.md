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
