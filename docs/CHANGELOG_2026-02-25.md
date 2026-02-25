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
  - `GET /api/quiz/all`
  - `GET /api/quiz/due`
- 题库查询逻辑抽离为公共 SQLite 函数，Tauri Command 与 Axum Handler 复用同一套底层查询。
- 前端新增 `src/utils/apiBridge.ts`：
  - Tauri 环境走 `invoke`
  - Web 环境走 HTTP（`http://<hostname>:9527/api/quiz/*`）
- Quiz 页面已替换直接 `invoke` 调用，改为统一桥接层。

### 说明
- 本日志已按发布准备做精简，历史细节改由 Git 提交记录追溯。
