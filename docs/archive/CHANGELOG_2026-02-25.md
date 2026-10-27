# 更新日志（2026-02-25）

## v1.4.1-dev（错题收录与渲染修正，2026-02-27）

### 已落地（本次）
- 修复 `Blog` 与 `BlogPost` 的 LaTeX 显示为源码问题：
  - 从手写 `markdownToHtml + dangerouslySetInnerHTML` 切换为 `ReactMarkdown + remark-math + rehype-katex (+rehype-highlight)`。
  - 留痕列表展开正文、编辑器预览、文章详情页均统一走同一渲染链路。
- 保留并修正视频时间戳跳转能力：
  - 将时间戳标记改写为 Markdown 链接锚点并在点击时解析秒数跳转。
- 优化 `Notes`「收录为错题」题目提取逻辑：
  - 优先从 AI 回复中解析“题目识别/题目原文”与“解答/解析”分段。
  - 支持流水线格式（`【题目识别】` / `【详细解答】`）与常见自然语言标题格式。
  - 当用户提问为泛化提示（如“请识别这道题并详细解答”）时，优先用 AI 回复首段作为题面，避免将提示词误收录为题目。

### 修复补丁（同日追加）
- 修复对话图片点击预览异常：
  - 图片预览点击事件增加冒泡隔离，弹层关闭区域与大图点击分离。
  - 桌面端图片地址解析改为 `convertFileSrc` + `docRoot` 回退，避免 `ErrorImages` 文件已落盘但无法显示。
- 全局数学公式兼容增强：
  - 新增 `\\[...\\]` / `\\(...\\)` 到 `$$...$$` / `$...$` 的统一归一化。
  - 覆盖 `Notes` 助手消息、`Blog` 列表展开/预览、`BlogPost` 详情、`ErrorBook` 详情、`WeeklyReview` AI 复盘面板。
- 摘要与标题去源码：
  - 留痕首页摘要、错题本列表标题、周复盘错题标题统一改为纯文本快照，不再直接显示 LaTeX 源码片段。
- 错题“归档/删除/联动”行为修正：
  - 归档时自动移除该题在 `weekly_review_items` 的本周提醒项。
  - 新增“硬删除”能力（错题本归档视图可执行删除）。
  - 周清单与统计查询仅统计未归档错题，避免历史脏数据继续提示待复习。

### 修复补丁（同日二次追加）
- 修复 `Blog`/`BlogPost` 在无 `video` frontmatter 情况下数学归一化未生效的问题：
  - `\\[...\\]`、`\\(...\\)` 在留痕详情页也可稳定解析为 KaTeX 公式。
- 修复错题图片加载 `ERR_CONNECTION_REFUSED`：
  - `getImageUrl` 兼容绝对路径与相对路径两种历史数据格式，桌面端优先走 `convertFileSrc`。
- 修复 `Notes` 进入页面自动上滑导致空白观感：
  - 改为仅滚动 AI 聊天容器，不再触发页面级 `scrollIntoView`。

### 修复补丁（同日三次追加）
- 修复 `favicon.ico` 404：为页面显式声明图标资源（`/pic/head.png`）。
- 公式超宽折中处理：
  - 保留正文可读宽度提升（`BlogPost` 容器由 `max-w-3xl` 调整为 `max-w-5xl`）。
  - KaTeX 显示公式启用横向滚动，避免长公式撑破卡片。
- 修复 AI 对话图片仍不显示：
  - 强化 Tauri 运行态检测（`__TAURI__` / `__TAURI_INTERNALS__` / `__TAURI_IPC__` + `tauri:`/`*.localhost`）。
  - `getImageUrl` 统一支持绝对路径与相对路径，优先 `convertFileSrc` 生成可访问 URL。

### 修复补丁（同日四次追加）
- AI 图片路径稳定性增强：
  - 应用启动时持久化 `eva.workspace.root`，避免相对路径无法解析。
  - `getImageUrl` 新增 `asset.localhost` 旧地址反解支持；桌面端优先输出 `file:///` URL，规避 `asset.localhost` 连接失败场景。
- 错题标题可读性优化（周复盘/错题本/周清单）：
  - 题目摘要不再以 `[公式]` 占位符为主，改为可读文本快照。
  - 自动弱化“选项段”噪音，标题更接近日常阅读直觉。
  - 后端 `make_title_snapshot` 同步清洗规则，避免新增数据继续污染标题。
- 选择题排版优化：
  - 错题详情中的 `选项 A/B/C/D` 自动分行，避免挤在同一行。
  - 周清单与错题卡片标题支持换行显示，长题面不再挤压布局。
- 文档更新：`README.md` 按最新 PRD 与当前能力完成重写（功能矩阵、运行模式、数据目录）。

### 修复补丁（同日五次追加）
- 修复桌面端题图报错 `Not allowed to load local resource`：
  - `getImageUrl` 取消 `file:///` 作为桌面主路径，改回 `convertFileSrc`（Tauri 允许域）生成可访问资源地址。
- 周复盘交互重构：
  - 移除标题前 `[ ]/[x]` 伪复选显示，避免与左侧复选框重复语义。
  - 点击题目标题改为跳转错题本对应题目（`/error-book?questionId=...`）。
  - 完成状态改为独立按钮控制，不再混入标题点击行为。
- 错题本“本周待复习清单”交互修复：
  - 点击题目仅打开详情，不再直接标记完成导致条目瞬间消失。
  - “标记完成”改为独立操作，周复盘与错题本状态口径一致。
- 复习展示逻辑升级为“题型总结优先”：
  - 新增 `extractReviewSummary`，优先展示 AI 输出的 `题型总结：...`，无总结时回退题面摘要。
  - Rust 后端 `make_title_snapshot` 同步优先提取 `题型总结` 写入周清单快照。
- 错题详情新增“先做题后看解析”模式：
  - 默认仅展示题目，答案/解析默认遮蔽。
  - 用户手动点击“显示解析与答案”后才展开。
- AI 解题输出规范增强：
  - 要求在回复开头输出“题型总结：...”。
  - 数学题要求至少提供两种思路（主解法 + 备选思路）。

### 修复补丁（同日六次追加）
- 收录错题解析对齐新格式：
  - `Notes` 收录逻辑支持“题型总结 → 题目 → 解析”新结构，不再把题型行误识别为题面。
  - 收录弹窗与手动新增均新增“题目类型”输入框，保存时统一写入 `ai_solution` 首行（`题型总结：...`）。
- 题型总结提取精度提升：
  - 新增精确提取函数，支持从 `题型总结：函数根的存在性与实数根的个数 已知...` 中只提取前半段题型字符串。
  - 周复盘与错题本列表统一只显示该题型总结，不展示题目细节。
- 周清单“打勾不保存/状态死循环”根因修复：
  - 后端 `toggle_weekly_review_item_done` 新增完整复习推进逻辑：
    - 第 1 次完成：`模糊`
    - 第 2 次完成：`基本掌握`
    - 第 3 次完成：`熟练`
    - 第 4 次完成：自动归档（可随时手动归档）。
  - 勾选完成时同步更新 `review_count/mastery_level/last_review_date`，并广播 `SYNC_WEEKLY_REVIEW_ITEMS + SYNC_WRONG_QUESTIONS`。
  - 周复盘、错题本均接入同步监听，首页错题速览与周复盘统计可实时刷新。
- 错题本清单交互重构：
  - 复选框直接绑定“完成状态”并持久化，不再承担“延续选择”语义。
  - “延续到下周”改为批量延续当前未完成项，避免认知冲突。
- 筛选栏可读性优化：
  - 将无标签的“全部”下拉改为显式标签：学科筛选 / 题型筛选 / 熟练度筛选。

### 修复补丁（同日七次追加）
- 周复盘清单交互优化：
  - 移除标题清单勾选框，改为“标记完成/改为未完成”按钮控制状态。
  - 已完成条目增加删除线并自动排在队列末尾（按状态排序）。
  - 明确提示“未完成项会在下周自动顺延”。
- 自动顺延机制落地到后端：
  - 获取本周清单时，系统自动将上周 `pending` 项去重复制到本周。
  - 用户无需手动顺延也不会丢失未完成题目。
- 图片地址兼容增强：
  - `getImageUrl` 将 `asset.localhost + 绝对路径` 统一归一为 `/api/images/<relative>`，规避 `asset.localhost ... ERR_CONNECTION_REFUSED`。
  - 支持从 `EVA_Knowledge_Base` 绝对路径自动提取相对路径。
- 周日期文案优化：
  - 将 `endDate` 说明改为“选择任意一天，系统自动按该周周一到周日聚合”，降低理解成本。

### 修复补丁（同日八次追加）
- 图片地址链路最终收敛：
  - `getImageUrl` 新增 `/api/images/...` 历史 URL 反解析，统一回退为相对路径再重建目标地址，兼容旧数据。
  - 桌面端（Tauri）改为强制优先 `convertFileSrc(绝对路径)`，不再回落到 `http://<host>:9527`，避免本地服务未启时 `ERR_CONNECTION_REFUSED`。
  - 浏览器端继续使用 `http://<host>:9527/api/images/...`，维持局域网访问能力。

### 修复补丁（同日九次追加）
- 修复 Tauri 开发态图片仍报错 `asset.localhost ... ERR_CONNECTION_REFUSED`：
  - `tauri.conf.json` 启用 `app.security.assetProtocol.enable = true`。
  - 资产协议作用域增加 `$DOCUMENT/**`，允许 `convertFileSrc` 访问 `Documents/EVA_Knowledge_Base/ErrorImages/...`。
  - 保留前端 `image-debug` 日志，便于继续追踪极端路径样本。

### 修复补丁（同日十次追加）
- 错题收录题面识别增强（选择题场景）：
  - `Notes` 收录时新增“提示词识别”与“AI内容优先提题”策略，降低“把用户提问当题目”误判概率。
  - 对 `A/B/C/D` 选项结构做专门识别，优先抽取完整题干+选项作为 `question_content`。
- 留痕排版优化：
  - 同步到 `Blog` 时，题目内容统一走 `formatQuestionLayout`，选择题选项自动换行，移动端阅读更整洁。
- 移动端录入体验优化：
  - 收录弹窗增加 `max-h + overflow-y-auto`，并改为小屏按钮纵向布局，避免遮挡与挤压。

### 修复补丁（同日十一次追加，v1.4.1 收口）
- 工作区目录统一：
  - 启动初始化与“更改文档根目录”初始化均纳入 `ErrorImages/` 目录创建。
  - 设置页「本地工作区 → 目录规划」补充 `ErrorImages/` 展示，产品文案与实际落盘一致。
- 错题题面识别稳定性增强：
  - 收录提取新增“解答段特征”判定，降低将整段解析误判为题目的概率。
  - AI 侧输出约束升级：要求显式输出 `【题目识别】` 与 `【详细解答】` 区块，选择题选项分行。
  - 同步到每日留痕时继续保留选择题选项自动换行，提升移动端阅读观感。

### 版本
- 版本号升级至 `v1.4.1`（`package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json`）。

### 版本准备
- 版本号统一提升为 `v1.4.0`（`package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json`）。

## v1.4.0-dev（错题快录与周清单复盘，2026-02-27 实装 Round 1）

### 已落地（本次）
- 后端新增错题与周复盘清单数据基座（SQLite）：
  - `wrong_questions`（错题主表）
  - `weekly_review_items`（真实自然周清单）
  - `ai_messages.image_path`（AI 消息可关联图片路径）
- Rust 命令与 Axum 路由已补齐（桌面 / Web 双端可复用）：
  - 错题 CRUD + 统计
  - 周清单获取 / 勾选 / 手动延续至下周
  - 图片上传与静态访问（`/api/images/upload`、`/api/images/{*path}`）
- 前端桥接层 `src/utils/apiBridge.ts` 已接入双模 API：
  - 桌面端走 `invoke`
  - 局域网 Web 走 HTTP REST
- AI 客户端 `src/utils/aiClient.ts` 已扩展视觉通道：
  - 支持 OpenAI 兼容多模态 content
  - 支持 `single` / `pipeline` 两种识题模式
- 设置中心已新增视觉配置并持久化：
  - `aiVisionModel`
  - `aiVisionMode`
  - 同步保存到 `eva.settings.v1` 与 localStorage 兼容键

### 当前边界
- 本轮仅完成后端与配置层基座，前端页面联动（Notes 图片发送、错题收录弹窗、ErrorBook 页面、WeeklyReview/Dashboard 新卡片）将在 Round 2 完成。

## v1.4.0-dev（错题快录与周清单复盘，2026-02-27 实装 Round 2）

### 已落地（本次）
- `Notes` AI 对话新增图片题发送能力：
  - 支持选择图片与粘贴截图；发送后走视觉识题链路。
  - 用户消息支持按需关联 `image_path`，并可在气泡内预览/放大图片。
- `Notes` 助手消息新增「收录为错题」：
  - 弹窗填写科目/标签/难度/笔记。
  - 一键写入 `wrong_questions`，并可同步生成带“错题”标签的日留痕。
- 新增独立页面 `ErrorBook`（`/error-book`）：
  - 支持学科/掌握程度/关键词筛选。
  - 支持查看详情（Markdown + LaTeX）与错题归档。
  - 支持本周清单勾选完成与批量延续到下周。
- `Dashboard` 新增错题速览卡片：
  - 展示总数/未掌握/本周待复习/本周已完成/本周新增。
  - 提供“开始复习”“查看错题本”快捷入口。
- `WeeklyReview` 新增本周错题标题清单：
  - 使用真实自然周 `week_start` 口径。
  - 支持勾选完成与延续到下周。
  - AI 周诊断 Prompt 注入错题维度摘要。

### 导航与路由
- `App` 新增 `/error-book` 路由。
- `Sidebar` 新增「错题本」入口。

## v1.4.0-dev（错题快录与智能复习系统，2026-02-27 规划）

### 设计文档
- 新增 `docs/spec_2.27.md`：错题快录与智能复习系统 Spec（v1.4）。
- 完整覆盖：AI 多模态图片识题 + 错题本持久化 + SM-2 间隔复习 + 周复盘/留痕联动。

### 规划能力清单
- **AI 多模态扩展**：
  - SiliconFlow 视觉模型（`Pro/Qwen/Qwen2.5-VL-7B-Instruct`）接入。
  - `aiClient.ts` 支持 `OpenAI 多模态消息格式`（image_url content part）。
  - 双模型流水线（Vision 提取题目 → Reasoning 详细解答）与单步模式可选。
  - Settings 新增 `aiVisionModel` / `aiVisionMode` 配置项。
- **Notes AI 对话图片上传**：
  - 支持点击选择 / Ctrl+V 粘贴 / 拖拽上传图片。
  - 图片保存至 `Documents/EVA_Knowledge_Base/ErrorImages/` 目录。
  - 发送含图片消息时自动切换视觉模型。
  - `ai_messages` 表新增 `image_path` 列。
- **一键收录为错题**：
  - AI 回复气泡新增"收录为错题"按钮。
  - 结构化收录弹窗：科目 / 标签 / 难度 / 补充笔记。
  - 可选"同步到留痕"，自动创建带"错题"标签的 Blog 条目。
- **错题本独立页面**（`/error-book`）：
  - 按学科/标签/掌握程度筛选与搜索。
  - 翻卡片式 SM-2 间隔复习模式。
  - 手动录入错题能力。
- **SQLite 新增表**：
  - `wrong_questions`：错题记录（含 SM-2 调度字段）。
- **Axum HTTP 路由**：
  - CRUD + 复习 + 统计 + 图片上传/服务。
- **Dashboard 错题速览卡片**。
- **WeeklyReview 错题维度注入 AI 周诊断**。
- **Blog LaTeX 渲染增强**（ReactMarkdown + rehype-katex 替换手写 markdownToHtml）。
- 含 13 条 Agent Prompt 实施指令。

---

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

---

## v1.2.1（前端入口收敛，2026-02-27）

### 已落地（本次）
- 完全隐藏前端「练功房（Quiz）」入口：
  - 桌面端侧边栏已移除「练功房」导航项。
  - `App.tsx` 已移除 `/quiz` 路由映射，前端不可再直接访问该页面。
  - `Resources` 页面已移除“生成练功房”按钮与相关文案，避免残留跳转入口。
  - 移动端底部导航保持无 Quiz 入口（继续为 4 栏：首页/任务/知识库/周复盘）。
- 保持后端兼容：未删除 `questions` 表、Quiz 命令与局域网相关接口，仅做前端隐藏。

---

## v1.3.0-dev（Focus Engine 后端基座，2026-02-27）

### 已落地（Prompt 2~5）
- `src-tauri/src/lib.rs` 新增 Focus 数据结构：
  - `FocusTemplate`
  - `FocusRun`
  - `StartFocusRunPayload` / `FinishFocusRunPayload`
  - `FocusStatsSummary` / `FocusStatsSlice` / `FocusStatsResult`
- SQLite 自动迁移新增：
  - `focus_templates` 表（支持软删除字段 `is_archived`）
  - `focus_runs` 表（记录单次专注事件）
  - 索引：`idx_focus_templates_archived`、`idx_focus_templates_updated_at`、`idx_focus_runs_date`、`idx_focus_runs_status`、`idx_focus_runs_template_id`
- 新增并注册 Tauri 命令：
  - `get_focus_templates`
  - `create_focus_template`
  - `update_focus_template`
  - `archive_focus_template`
  - `start_focus_run`
  - `finish_focus_run`
  - `get_focus_runs`
  - `get_focus_stats`
- 新增 LAN/Web 路由：
  - `GET /api/focus/templates`
  - `POST /api/focus/templates`
  - `PUT /api/focus/templates/{id}`
  - `DELETE /api/focus/templates/{id}`
  - `POST /api/focus/runs/start`
  - `POST /api/focus/runs/{id}/finish`
  - `GET /api/focus/stats`
- 同步广播新增：
  - `SYNC_FOCUS_TEMPLATES`
  - `SYNC_FOCUS_RUNS`

### 最小调用示例（invoke）
```ts
const { invoke } = await import("@tauri-apps/api/core");

await invoke("create_focus_template", {
  template: {
    id: "",
    name: "背单词",
    timer_type: "pomodoro",
    duration_minutes: 30,
    tags_json: JSON.stringify(["英语", "背单词"]),
    linked_task_title: "背单词",
    color_token: null,
    is_archived: 0,
    created_at: "",
    updated_at: "",
  },
});

const run = await invoke("start_focus_run", {
  payload: {
    source: "tasks",
    template_id: null,
    task_id: null,
    timer_type: "pomodoro",
    planned_minutes: 30,
    date: null,
    tags_json: JSON.stringify(["英语", "背单词"]),
    note: null,
  },
});

await invoke("finish_focus_run", {
  runId: (run as { id: string }).id,
  payload: {
    actual_seconds: 1800,
    status: "completed",
    ended_at: null,
    tags_json: null,
    note: null,
  },
});
```

---

## v1.3.1-dev（Focus Engine 前端接线 + 文档同步，2026-02-27）

### 已落地（Prompt 6~10）
- `src/utils/apiBridge.ts` 扩展 Focus 双模桥接（Tauri invoke / LAN HTTP）：
  - `fetchFocusTemplates` / `createFocusTemplate` / `updateFocusTemplate` / `archiveFocusTemplate`
  - `startFocusRun` / `finishFocusRun`
  - `fetchFocusStats`
- `src/pages/Tasks.tsx` 接入模板化与 run 追踪：
  - 新建/编辑任务支持“从模板填充”（计时类型/时长/标签）。
  - 新增“保存为专注模板”开关与模板名输入。
  - 任务计时开始自动 `startFocusRun`，计时完成或手动关闭时 `finishFocusRun`。
  - 任务番茄启动时，任务状态 `todo -> in-progress`（不自动 done）。
- `src/pages/Dashboard.tsx` 番茄卡片改造为三入口：
  - 按模板启动 / 按任务启动 / 快速启动。
  - 结束后展示“本次分钟数 / 今日累计分钟 / 当前模板累计分钟”。
  - 全屏沉浸模式沿用，底层改为 FocusRun 写入。
- `src/pages/WeeklyReview.tsx` 新增 Focus 统计可视化：
  - 标签专注占比饼图（`dimension=tag`）。
  - 模板专注占比饼图（`dimension=template`）。
  - TOP3 标签与 TOP3 模板卡片。
- 文档同步：
  - `docs/PRD_Roadmap.md`：标注 Quiz 前端冻结状态，补充 Focus Engine 模块现状。
  - `docs/数据存储白皮书.md`：新增 `focus_templates` / `focus_runs` 与 `focus_sessions` 分工说明。

### 构建验证
- 前端 `npm run build` 已通过（存在既有 chunk size 警告，无新增阻断错误）。

---

## v1.3.2-dev（紧急稳定性修复，2026-02-27）

### 已落地（本次）
- 修复 `Tasks` 页面白屏：
  - 原因：`finalizeFocusRun` 在定义前被 `useEffect` 依赖与调用，触发运行时 TDZ 异常（`Cannot access 'finalizeFocusRun' before initialization`）。
  - 处理：调整 `src/pages/Tasks.tsx` 内部声明顺序，先定义回调再在计时副作用中引用。
- 修复 `Settings` 启动时局域网同步误报：
  - 当 9527 端口已被本机现有进程占用（`os error 10048`）时，初始化阶段改为容错处理，不再输出阻塞性错误日志。

### 影响
- 打开“任务与计划”不再因上述运行时异常导致页面空白。
- 已有本地服务占用端口时，`Settings` 初始化更稳健。

### 文档策略同步（本次）
- `docs/spec.md`：新增 Prompt 11，一次性收敛“专注预设交互 + 周复盘单职责 + 专注成就独立页 + EVA 主题配色规范”。
- `docs/PRD_Roadmap.md`：补充 2026-02-27 策略说明，明确周复盘与专注成就信息架构解耦。
- `docs/数据存储白皮书.md`：将 `eva.focus.filters.v1` 用途更新为“专注成就页筛选缓存”，并明确 all-time 默认统计口径。

---

## v1.3.3-dev（Prompt 11 一次性收敛，2026-02-27）

### 已落地（本次）
- `Tasks` 交互收敛为统一“专注预设”入口：
  - 合并为单控件，支持最近使用（Top3）+ 快捷预设（25m/50m/15m）+ 我的模板。
  - 保留“保存当前专注配置为模板”轻量按钮，仅在用户点击后展示模板名输入。
  - 模板创建成功后立即可选中并应用，不阻断主流程“保存任务”。
- `WeeklyReview` 职责去耦：
  - 移除 Focus 标签/模板占比与 TOP3 模块。
  - 保留周复盘核心：周总专注、周完成率、学科分布、AI 周诊断。
- 新增独立 `FocusInsights` 页面（`/focus-insights`）：
  - 默认 all-time（全量历史）统计。
  - 提供 7/30/90 天筛选。
  - 展示总累计分钟、总完成轮次、完成率、标签占比饼图、模板占比饼图、TOP3 标签/模板。
- 导航与路由接入：
  - `App.tsx` 新增 `/focus-insights` 路由。
  - `Sidebar` 新增“专注成就”入口。
  - 移动端底部导航新增“成就”入口并调整为 5 栏。
- 配色收敛：
  - 图表与关键数据卡统一使用 EVA 主色系（`#88B5D3` / `#2a3b52` / `#FF9900` 及其明度梯度）。

---

## v1.3.0（Release，2026-02-27）

### 已落地（发布收口）
- `Tasks` 增补模板治理能力：
  - 在“专注预设”区域提供模板删除（归档）入口，避免模板数量无上限堆积。
  - 删除模板后自动清理“最近使用预设”中的对应项，防止脏引用残留。
  - 标签维持逐项删除并新增“清空标签”快捷操作。
- `FocusInsights` 统计展示修正：
  - 总累计专注及 TOP3 时长统一改为 `h m` 形式展示（不再仅显示 `m`）。
  - 页面补充数据来源说明：统计基于 `focus_runs` 关联聚合。
- 存储口径与文档对齐：
  - 白皮书新增 `eva.focus.recentPresets.v1`（仅交互缓存）说明。
  - 明确 Focus 统计事实源为 SQLite：`focus_runs` / `focus_templates`。

### 版本
- `package.json`：`1.3.0`
- `src-tauri/Cargo.toml`：`1.3.0`
- `src-tauri/tauri.conf.json`：`1.3.0`


