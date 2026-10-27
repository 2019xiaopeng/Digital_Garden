# 番茄专注系统重构 Spec（v1.1）

> 项目：QCBs Digital Garden  
> 日期：2026-02-27  
> 范围：Web/Tauri 桌面端 + 局域网 API + SQLite + PRD/白皮书文档更新  
> 目标：围绕“可复用番茄钟 + 标签归因统计 + 成就感回路”重构（并保持周复盘职责单一）

---

## 1. 需求澄清（把你的描述翻译成产品语言）

### 1.1 你真正想要的能力

1. **完全隐藏练功房（Quiz）**，暂时不出现在产品导航与路由中。  
2. 支持“**固定可复用的专注项**”（类似“背单词 30 分钟番茄钟”），可反复启动，不必每次重新配置。  
3. 所有番茄/倒计时都应留下**可统计的专注记录**，并能按“标签（如 背单词/408/数学）”聚合。  
4. 统计页要能展示：
   - 总专注时长
   - 某标签专注时长
   - 各标签占比（饼图）
   - 各模板使用次数/时长
5. 交互必须“省时间、省心、直觉”：模板能力不能增加填写步骤或心智负担。

### 1.2 现状问题（代码已验证）

- 当前只有 `focus_sessions`（按天汇总秒数），**缺少“单次专注事件”**。
- Tasks 里虽然有 `timerType`/`timerDuration`/`tags`，但结束计时后没有形成完整行为日志。
- Dashboard 有番茄计时 UI，但与标签/模板统计没有闭环。

**结论**：要实现你的想法，必须新增“专注事件流水表 + 专注模板表”。

---

## 2. 目标与边界

### 2.1 本期目标（必须做）

- G1：隐藏 Quiz 模块（UI、路由入口）。
- G2：新增“专注模板（Focus Template）”并可复用启动。
- G3：新增“专注事件（Focus Run）”持久化记录。
- G4：新增按标签/模板聚合统计 API。
- G5：新增独立「专注成就」Tab 承载全量专注统计（不与周复盘混用）。
- G6：更新 PRD 与数据存储白皮书。

### 2.2 本期非目标（先不做）

- Android 锁屏/应用锁（另一个 spec 已覆盖）。
- SM-2 与番茄深度联动。
- 跨设备账户体系与云端鉴权。

---

## 3. 领域模型设计

## 3.1 核心实体

### A) FocusTemplate（可复用模板）

用于定义“背单词 30 分钟番茄钟”这种可复用专注项。

```ts
type FocusTemplate = {
  id: string;
  name: string;                  // 背单词、数学刷题、英语精读
  timer_type: "pomodoro" | "countdown";
  duration_minutes: number;      // 默认时长
  tags_json: string;             // ["英语","背单词"]
  linked_task_title?: string;    // 可选，快速创建任务时使用
  color_token?: string;          // UI token，不存自定义颜色值
  is_archived: 0 | 1;
  created_at: string;
  updated_at: string;
};
```

### B) FocusRun（单次专注事件）

每次开始计时都创建一条 run，完成/中断时更新状态。

```ts
type FocusRun = {
  id: string;
  source: "dashboard" | "tasks" | "weekly_review" | "mobile";
  template_id?: string | null;
  task_id?: string | null;

  timer_type: "pomodoro" | "countdown";
  planned_minutes: number;
  actual_seconds: number; // 结束时回填

  status: "running" | "completed" | "aborted";
  started_at: string;
  ended_at?: string | null;
  date: string; // YYYY-MM-DD（started_at 对应本地日）

  tags_json: string; // 快照，避免任务后续改标签造成历史漂移
  note?: string | null;

  created_at: string;
  updated_at: string;
};
```

### C) FocusStats（聚合结果）

```ts
type FocusStatsSummary = {
  total_focus_minutes: number;
  completed_runs: number;
  completion_rate: number; // completed_runs / all_runs
};

type FocusStatsSlice = {
  key: string;            // 标签名或模板名
  minutes: number;
  percent: number;
  runs: number;
};
```

---

## 4. 数据库与迁移

## 4.1 新增 SQLite 表

```sql
CREATE TABLE IF NOT EXISTS focus_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timer_type TEXT NOT NULL DEFAULT 'pomodoro',
  duration_minutes INTEGER NOT NULL DEFAULT 25,
  tags_json TEXT NOT NULL DEFAULT '[]',
  linked_task_title TEXT,
  color_token TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS focus_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  template_id TEXT,
  task_id TEXT,
  timer_type TEXT NOT NULL,
  planned_minutes INTEGER NOT NULL,
  actual_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  date TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(template_id) REFERENCES focus_templates(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_focus_runs_date ON focus_runs(date);
CREATE INDEX IF NOT EXISTS idx_focus_runs_status ON focus_runs(status);
CREATE INDEX IF NOT EXISTS idx_focus_runs_template ON focus_runs(template_id);
```

## 4.2 与现有 `focus_sessions` 的关系

- `focus_sessions` 继续保留：用于签到/签退和历史兼容。
- 新统计优先基于 `focus_runs`。
- Dashboard 的 NERV 与热力图可逐步切换为 `focus_runs` 聚合，不要求一次迁移完。

## 4.3 历史数据处理策略

- **不做强制回填**（因为历史数据无标签，回填会污染占比）。
- 可选：创建 `legacy-unclassified` 标签，只在总时长中展示，不参与标签榜单。

---

## 5. 后端接口设计（Tauri 命令 + Axum HTTP）

## 5.1 Tauri Commands

### 模板相关
- `get_focus_templates() -> Vec<FocusTemplate>`
- `create_focus_template(template: FocusTemplate) -> FocusTemplate`
- `update_focus_template(id: String, template: FocusTemplate) -> FocusTemplate`
- `archive_focus_template(id: String) -> ()`

### 运行记录相关
- `start_focus_run(payload) -> FocusRun`  
  创建 `status=running` 记录，返回 `run_id`。
- `finish_focus_run(run_id: String, payload) -> FocusRun`  
  回填 `actual_seconds`、`ended_at`、`status=completed|aborted`。
- `get_focus_runs(range) -> Vec<FocusRun>`
- `get_focus_stats(range, dimension: "tag" | "template" | "timer_type") -> FocusStats`

## 5.2 Axum HTTP 路由（LAN/Web）

- `GET /api/focus/templates`
- `POST /api/focus/templates`
- `PUT /api/focus/templates/{id}`
- `DELETE /api/focus/templates/{id}`（软删除 -> archive）
- `POST /api/focus/runs/start`
- `POST /api/focus/runs/{id}/finish`
- `GET /api/focus/stats?start_date=...&end_date=...&dimension=tag`

## 5.3 Sync 广播

新增同步动作：
- `SYNC_FOCUS_TEMPLATES`
- `SYNC_FOCUS_RUNS`

触发点：模板增删改、run 开始/结束。

---

## 6. 前端交互设计

## 6.1 先做“隐藏练功房”

### 必改点
1. `src/components/Sidebar.tsx`：移除“练功房”导航项。
2. `src/App.tsx`：移除 `/quiz` 路由（或重定向首页）。
3. 与 quiz 文案耦合处替换为“专注统计”相关文案（如 Resources 页面按钮文案）。

### 保留策略
- 后端 `questions` 表与命令先不删，避免破坏历史数据。

## 6.2 Tasks 页增强

目标：让“模板复用”比“手填参数”更快，且不强迫用户先创建模板再用模板。

推荐改造（替代当前“从模板填充 + 保存为模板”双控件）：
- 单一入口：`专注预设`（默认值：`无`）
  - 最近使用（最多 3 个，Chip 形式）
  - 常用系统预设（25m 番茄 / 50m 深度 / 15m 冲刺）
  - 我的模板（下拉）
- 一键沉淀：`保存当前专注配置为模板`（链接按钮，不占主流程）
  - 点击即在当前弹窗内完成创建，不跳转、不二次打开
  - 成功后立即可被“专注预设”选中
- 编辑态直觉规则：
  - 未选模板时不展示“模板名输入框”
  - 仅在用户主动点击“保存当前配置为模板”时才要求模板名
  - 模板创建后自动回填并保持当前任务表单上下文

创建任务时：
- 若选择模板，自动填充 `timerType/timerDuration/tags`。
- 启动计时时，调用 `start_focus_run`，结束调用 `finish_focus_run`。

## 6.3 Dashboard 番茄卡片增强

新增启动模式：
- 按模板启动（主入口）
- 按任务启动（沿用今日任务）
- 快速启动（临时不存模板）

结束后反馈：
- 弹出“本次专注 xx 分钟，标签 yy”
- 展示今日累计分钟与本模板累计分钟

## 6.4 WeeklyReview 职责收敛（改造）

`WeeklyReview` 只做“周复盘”一件事，不承载专注统计探索：
- 保留：周总时长、周完成率、学科分布、AI 周诊断
- 移除：标签占比饼图、模板占比饼图、TOP3 标签/模板

## 6.5 新增「专注成就」独立 Tab（Focus Insights）

新增页面建议：`/focus-insights`（桌面侧边栏与移动端导航均可达）。

核心模块：
- 标签专注占比饼图（dimension=tag）
- 模板使用占比饼图（dimension=template）
- TOP3 标签/模板卡片
- 总累计分钟 / 总完成轮次 / 完成率

统计区间：
- 默认 `all-time`（全量历史）
- 可选筛选（最近 7/30/90 天）作为辅助，而非默认

UI 主题约束（必须）：
- 仅使用 EVA 主题 token，不新增硬编码色盘
- 饼图与数据卡优先使用：
  - 绫波蓝：`#88B5D3`（主信息）
  - 深邃蓝灰：`#2a3b52`（次级信息）
  - 初号机橙：`#FF9900`（强调/峰值）
  - 冷白：`#F8FAFC`（浅色背景）
  - 深底：`#0a1120`（深色背景）
- 禁止出现与主题冲突的高饱和红绿随机配色

---

## 7. 数据关联规则（关键）

## 7.1 标签归因优先级

当一次 run 结束时，`tags_json` 按以下优先级快照：
1. 若来自模板：使用模板 tags
2. 若来自任务：使用任务 tags
3. 两者都有：取并集去重（模板优先顺序）
4. 为空：写入 `["未分类"]`

## 7.2 统计口径

- 有效专注：`status = completed` 且 `actual_seconds >= 60`
- 时长换算：`minutes = floor(actual_seconds / 60)`
- 占比：`slice_minutes / total_minutes`
- 统计区间：默认“全量历史（all-time）”，周维度仅用于周复盘模块

## 7.3 与任务状态联动（本期最简）

- 启动任务番茄后，可将任务从 `todo` 自动切到 `in-progress`。
- **不自动置为 done**（避免误完成）。

---

## 8. 验收标准（DoD）

1. 侧边栏与路由中看不到练功房入口。
2. 能创建“背单词 30 分钟”模板并重复启动。
3. 每次计时完成后数据库新增/更新 `focus_runs`。
4. 新增独立“专注成就”页面，展示“标签占比饼图”和“模板占比饼图”。
5. 周复盘页面不再包含 Focus 标签/模板统计图，仅保留周复盘核心模块。
6. 切换到 Web/LAN 模式仍可获取同样统计。
7. 全部图表配色符合 EVA 主题 token 规范。
8. PRD 与数据存储白皮书文档有对应更新内容。

---

## 9. 风险与规避

- 风险1：前端计时与后端记录时钟漂移  
  规避：`finish_focus_run` 以客户端上传 `actual_seconds` 为主，服务端只做边界校验。

- 风险2：标签脏数据（大小写、空格、同义词）  
  规避：入库前标准化（trim + lower + 同义词映射字典）。

- 风险3：旧数据无法做标签占比  
  规避：从上线日起开始可信统计，并在 UI 提示“统计起始日”。

---

## 10. PRD 更新草案（可直接合并）

> 目标文件：`docs/PRD_Roadmap.md`

### 10.1 模块状态调整

- 将 `3.6 练功房 · Quiz` 改为“**冻结（暂时隐藏）**”，标注“后端能力保留，前端入口关闭”。
- 在 `3.2 任务与计划` 与 `3.1 Dashboard` 增加“番茄模板/专注记录闭环”条目。
- 新增子节：`3.x 专注引擎（Focus Engine）`：
  - 专注模板
  - 专注事件流水
  - 标签/模板占比统计
  - 周复盘图表联动

### 10.2 Roadmap 建议

- Phase A：隐藏练功房 + 数据模型落地
- Phase B：模板复用 + run 持久化
- Phase C：周复盘统计图 + 文案完善

---

## 11. 数据存储白皮书更新草案（可直接合并）

> 目标文件：`docs/数据存储白皮书.md`

### 11.1 SQLite 新增表

在第 4 节表清单新增：
- `focus_templates`：专注模板
- `focus_runs`：单次专注事件流水（统计主数据源）

### 11.2 localStorage 新增键（可选）

- `eva.focus.activeRun.v1`：当前运行中计时（异常退出恢复）
- `eva.focus.filters.v1`：周复盘筛选维度缓存

### 11.3 存储策略补充

- `focus_sessions`：兼容层（签到/旧热力图）
- `focus_runs`：分析层（标签/模板统计）
- 新增数据治理：标签标准化、最小有效时长阈值

---

## 12. Agent 交付清单（list_prompt）

> 使用方式：按顺序把以下 prompt 发给实现 agent。  
> 每个 prompt 都要求：改代码 + 跑最小验证 + 回传改动文件与验证结果。

### Prompt 1：隐藏练功房入口

```text
请在当前仓库实现“完全隐藏练功房（Quiz）”：
1) 移除 Sidebar 的“练功房”导航项；
2) 移除 App.tsx 中 /quiz 路由（可改为重定向 /）；
3) 检查 Layout 移动端导航是否仍有 quiz 入口并移除；
4) 不删除后端 quiz 表和命令，只做前端隐藏；
5) 执行前端构建并汇报变更文件。
```

### Prompt 2：新增数据库表与后端模型

```text
请在 src-tauri/src/lib.rs 中新增 focus_templates 与 focus_runs 的数据结构、建表 SQL、索引 SQL：
- focus_templates: id,name,timer_type,duration_minutes,tags_json,linked_task_title,color_token,is_archived,created_at,updated_at
- focus_runs: id,source,template_id,task_id,timer_type,planned_minutes,actual_seconds,status,started_at,ended_at,date,tags_json,note,created_at,updated_at
并保证应用启动可自动迁移（CREATE TABLE IF NOT EXISTS）。
请跑 cargo check 并反馈结果。
```

### Prompt 3：实现 FocusTemplate Tauri 命令

```text
请实现并注册以下 tauri command：
- get_focus_templates
- create_focus_template
- update_focus_template
- archive_focus_template
要求：
1) 软删除（is_archived=1）；
2) 返回结构体与前端 JSON 字段一致；
3) 有基础错误处理；
4) 写出最小调用示例（可在前端临时按钮或测试函数）。
```

### Prompt 4：实现 FocusRun 命令与统计

```text
请实现并注册 tauri command：
- start_focus_run
- finish_focus_run
- get_focus_runs
- get_focus_stats(start_date,end_date,dimension)
统计维度支持 tag/template/timer_type。
口径：仅统计 status=completed 且 actual_seconds>=60。
请提供至少 2 条 SQL 聚合查询并说明。
```

### Prompt 5：补齐 Axum HTTP 路由

```text
请为 LAN/Web 模式新增路由：
GET /api/focus/templates
POST /api/focus/templates
PUT /api/focus/templates/{id}
DELETE /api/focus/templates/{id}
POST /api/focus/runs/start
POST /api/focus/runs/{id}/finish
GET /api/focus/stats
并保证 CORS 与现有风格一致。
```

### Prompt 6：扩展 apiBridge 双模调用

```text
请在 src/utils/apiBridge.ts 扩展 FocusTemplate/FocusRun 双模桥接：
- 桌面端走 invoke
- Web 端走 /api/focus/*
新增类型定义与函数：
fetchFocusTemplates/createFocusTemplate/updateFocusTemplate/archiveFocusTemplate
startFocusRun/finishFocusRun/fetchFocusStats
并补充最小错误处理。
```

### Prompt 7：Tasks 页面模板化改造

```text
请在 Tasks 页面实现：
1) 新建/编辑任务时支持“从专注模板填充”；
2) 新增“保存为模板”开关（可选）;
3) 启动任务计时时调用 startFocusRun；
4) 计时结束或手动停止调用 finishFocusRun；
5) 标签快照按模板+任务并集去重。
完成后跑前端构建并给出交互说明。
```

### Prompt 8：Dashboard 番茄卡片改造

```text
请改造 Dashboard 番茄卡片，新增“按模板启动/按任务启动/快速启动”三种入口。
完成一次计时后展示：
- 本次分钟数
- 今日累计分钟
- 当前模板累计分钟（若有模板）
并调用 FocusRun API 写入记录。
```

### Prompt 9：WeeklyReview 图表增强

```text
请在 WeeklyReview 页面新增两张饼图：
1) 标签专注占比（dimension=tag）
2) 模板专注占比（dimension=template）
并新增 TOP3 标签与 TOP3 模板卡片。
数据来自 fetchFocusStats。
```

### Prompt 10：文档更新与收尾

```text
请更新 docs/PRD_Roadmap.md 与 docs/数据存储白皮书.md：
- 反映 Quiz 冻结隐藏状态
- 新增 FocusTemplate/FocusRun 数据模型与统计口径
- 说明 focus_sessions 与 focus_runs 的分工
最后执行 npm run build（必要时 tauri build）并提交 changelog 建议。
```

### Prompt 11：一次性收敛交互与信息架构（长提示词）

```text
你现在要在当前仓库一次性完成 Focus 功能的交互与信息架构收敛，目标是：
1) 操作直觉、省时间、省心；
2) 周复盘只做周复盘，不被专注统计干扰；
3) 专注统计独立成就页，默认看全量历史；
4) 图表和数据卡严格符合 EVA 主题配色。

【硬性约束】
- 不新增复杂流程，不引入额外弹窗链路。
- 不改后端数据模型（focus_templates / focus_runs 继续沿用）。
- 不破坏现有 Prompt 1~10 已完成能力。
- 所有新 UI 必须使用现有 Tailwind token / 主题变量；禁止随意硬编码新颜色。

【一、Tasks 交互重构（替换“从模板填充+保存为模板”反直觉设计）】
请修改 `src/pages/Tasks.tsx`：
1. 将高级设置中的“从专注模板填充”和“保存为模板开关+模板名输入”重构为：
  - 一个统一控件：`专注预设`（默认“无”）
  - 预设来源包括：最近使用（优先展示）+ 我的模板 + 固定快捷预设（25m/50m/15m）
2. 保留“保存当前专注配置为模板”能力，但改为轻量按钮：
  - 不默认占主流程；
  - 仅点击时才要求模板名；
  - 创建成功后立即可选中并应用。
3. 交互细节：
  - 选择模板/预设后自动填充 `timerType/timerDuration/tags`；
  - 创建任务主按钮仍为“保存任务”，不增加额外必经步骤；
  - 不允许“必须先创建模板才能使用模板”的阻塞体验。

【二、周复盘去耦合（保持单一职责）】
请修改 `src/pages/WeeklyReview.tsx`：
1. 移除 Focus 标签占比、模板占比、TOP3 标签/模板模块；
2. 保留周复盘核心：周总专注、周完成率、学科分布、AI 周诊断；
3. 确保页面语义集中在“周复盘”而非“全局成就探索”。

【三、新增独立成就页（Focus Insights）】
新增页面 `src/pages/FocusInsights.tsx`（命名可等价，但需语义清晰）：
1. 展示全量历史统计（默认 all-time）：
  - 总专注分钟、总 completed runs、完成率；
  - 标签占比饼图（dimension=tag）；
  - 模板占比饼图（dimension=template）；
  - TOP3 标签 / TOP3 模板。
2. 可选筛选区间：7/30/90天（默认 all-time）。
3. 使用现有 `fetchFocusStats`，避免重复造接口。

【四、导航与路由接入】
请修改：
- `src/App.tsx`：新增路由（例如 `/focus-insights`）；
- `src/components/Sidebar.tsx`：新增“专注成就”入口；
- 若有移动端导航入口（`Layout` 内）也同步增加，不改变现有信息架构层级。

【五、配色统一（严格遵守 EVA 主题）】
1. 图表/数据卡只使用主题允许色：`#88B5D3`、`#2a3b52`、`#FF9900` 及其中性色阶；
2. 不使用高饱和杂色组合；
3. 深色/浅色模式可读性均需达标；
4. 若需多切片配色，基于主题色做明度梯度，不另起新色系。

【六、回归验证】
完成后请执行并汇报：
1. `npm run build`（前端构建）
2. 关键路径手测说明：
  - Tasks 新建任务应用预设
  - 一键保存为模板并复用
  - WeeklyReview 仅保留周复盘模块
  - FocusInsights 全量统计展示正常

【七、文档与记录】
1. 更新 `docs/PRD_Roadmap.md`：
  - 明确“周复盘单职责 + 专注成就独立页”
  - 更新 Tasks 交互描述为“统一专注预设入口”
2. 更新 `docs/数据存储白皮书.md`：
  - Focus 筛选缓存用途改为“专注成就页筛选”
  - 强调 all-time 默认统计策略
3. 更新 `docs/CHANGELOG_2026-02-25.md`：新增本次改造条目。

请只做上述范围内的最小必要改动，不额外扩展新功能。
```

---

## 13. 建议实施顺序（给你看的管理版）

1. Prompt 1（先隐藏 quiz，避免 UI 干扰）
2. Prompt 2~5（后端模型/API 一次打通）
3. Prompt 6（桥接层）
4. Prompt 7~9（页面功能）
5. Prompt 10（文档与验证）
6. Prompt 11（交互与信息架构收敛，建议覆盖执行）

---

## 14. 版本标记建议

- 建议里程碑版本：`v1.3.0-focus-engine`
- 本期 changelog 关键词：
  - `feat(focus): reusable focus templates`
  - `feat(focus): run-level tracking and tag analytics`
  - `feat(review): focus pie charts by tag/template`
  - `chore(ui): hide quiz module`
