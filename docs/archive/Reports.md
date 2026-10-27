# EVA-00 考研辅助终端 — 功能汇报文档

---

## 一、《核心模块关联与本地持久化方案汇报》

### 1. 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│                    React Frontend (TypeScript)               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │Dashboard │  │ Tasks    │  │  Blog    │  │  Notes   │    │
│  │  .tsx    │  │  .tsx    │  │  .tsx    │  │  .tsx    │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │              │              │              │          │
│       └──────────────┼──────────────┼──────────────┘          │
│                      ▼                                        │
│              ┌───────────────┐                                │
│              │ dataService.ts│  ← 统一数据抽象层              │
│              │  TaskService  │                                │
│              │  DailyLogSvc  │                                │
│              │  FocusService │                                │
│              │  AiService    │                                │
│              │  MdImportSvc  │                                │
│              └───────┬───────┘                                │
│                      │ invoke()                               │
│                      │ (Tauri IPC / localStorage fallback)    │
└──────────────────────┼───────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                   Tauri Rust Backend                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  lib.rs                                              │    │
│  │  ├─ init_database()     → SQLite 建表 + 索引         │    │
│  │  ├─ get_tasks()         → SELECT * FROM tasks        │    │
│  │  ├─ create_task()       → INSERT INTO tasks          │    │
│  │  ├─ update_task()       → UPDATE tasks               │    │
│  │  ├─ delete_task()       → DELETE FROM tasks          │    │
│  │  ├─ batch_create_tasks()→ 批量插入                    │    │
│  │  ├─ get_daily_logs()    → SELECT * daily_logs        │    │
│  │  ├─ create_daily_log()  → INSERT daily_logs          │    │
│  │  ├─ update_daily_log()  → UPDATE daily_logs          │    │
│  │  ├─ get_focus_sessions()→ SELECT focus_sessions      │    │
│  │  ├─ upsert_focus_session() → INSERT OR REPLACE       │    │
│  │  ├─ parse_markdown_plan()  → MD解析引擎              │    │
│  │  ├─ ai_proxy()          → 转发API请求                │    │
│  │  └─ read_file_content() → 读取本地文件               │    │
│  └─────────────────────────────────────────────────────┘    │
│                      │                                        │
│                      ▼                                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  SQLite (sqlx)                                       │    │
│  │  路径: ~/Documents/EVA_Knowledge_Base/Database/eva.db │    │
│  │  ├─ tasks (14字段, date索引)                          │    │
│  │  ├─ daily_logs (10字段, date索引)                     │    │
│  │  └─ focus_sessions (6字段, date唯一索引)              │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### 2. 数据库 Schema

| 表名             | 字段数 | 关键字段                                                  | 索引             |
| ---------------- | ------ | --------------------------------------------------------- | ---------------- |
| `tasks`          | 14     | id, title, status, priority, date, start_time, tags, ...  | `idx_tasks_date` |
| `daily_logs`     | 10     | id, date, title, content, mood, sync_rate, auto_generated | `idx_logs_date`  |
| `focus_sessions` | 6      | id, date(UNIQUE), checked_in_at, total_focus_seconds      | date唯一约束     |

### 3. 数据流向

- **Dashboard → Tasks**: Dashboard 通过 `TaskService.getAll()` 获取今日任务，勾选完成时调用 `TaskService.update()` 同步状态
- **Tasks → Blog**: 完成任务可自动触发 Blog 的 `DailyLogService.generateDailyReview()` 生成复盘
- **Dashboard ↔ FocusSession**: 签到/签退操作通过 `FocusService.upsert()` 持久化
- **跨窗口同步**: `window.focus` 事件重载数据，保证多组件一致性

### 4. Tauri vs localStorage 双轨策略

```typescript
// dataService.ts 中的核心模式
async getAll(): Promise<LegacyTask[]> {
  const invoke = await getInvoke();     // 尝试加载 Tauri invoke
  if (invoke) {
    try {
      return (await invoke("get_tasks")) as Task[];   // ✅ Tauri 路径
    } catch (e) {
      console.warn("Fallback to localStorage:", e);
    }
  }
  // ⚠️ localStorage 降级路径（纯浏览器/开发模式）
  return JSON.parse(localStorage.getItem("qcb.tasks.v1") || "[]");
}
```

**优势**: 开发时 `npm run dev` 不需要 Tauri，使用 localStorage 即可运行全部功能。打包为桌面应用后自动切换到 SQLite。

### 5. 迁移策略

`TaskService.migrateFromLocalStorage()` 方法支持一键将现有 localStorage 数据迁移至 SQLite 数据库,无数据丢失风险。

---

## 二、《MD 计划导入解析方案汇报》

### 1. Markdown 模板规范

```markdown
# 2025-06-01 周日学习计划

## 上午
- [ ] 复习高等数学极限部分 @2025-06-01 #math #high
- [ ] 线性代数矩阵运算 @2025-06-01 #math #medium

## 下午
- [ ] 背英语单词100个 @2025-06-01 #english #low
- [ ] 完成操作系统实验报告 @2025-06-01 #os #high

## 晚上
- [ ] 政治选择题100道 @2025-06-01 #politics
- [x] 整理今日笔记 @2025-06-01 #review

# 2025-06-02 周一

- [ ] 概率论条件概率 @2025-06-02 #math #high
- [ ] 数据结构链表实现 @2025-06-02 #ds #medium
```

### 2. 解析规则

| 语法         | 说明                                   | 示例                  |
| ------------ | -------------------------------------- | --------------------- |
| `- [ ]`      | 未完成任务                             | `- [ ] 复习高数`      |
| `- [x]`      | 已完成任务                             | `- [x] 已完成`        |
| `@YYYY-MM-DD`| 任务日期（覆盖标题中的日期）           | `@2025-06-01`         |
| `#tag`       | 标签标记                               | `#math #english`      |
| `#high`      | 高优先级                               | `#high` 或 `#urgent`  |
| `#low`       | 低优先级                               | `#low`                |
| `# 日期标题` | 作为默认日期（当行内无 `@日期` 时生效）| `# 2025-06-01`        |

### 3. 双引擎解析

- **Rust 引擎** (Tauri 环境): `parse_markdown_plan` 命令，在 Rust 层逐行解析，性能最优
- **JS 引擎** (Web 降级): `MarkdownImportService.parseMarkdownLocally()`，纯前端 JS 实现，保证离线可用

两引擎输出相同的 `ImportReport` 结构:

```typescript
interface ImportReport {
  total: number;     // 解析到的总任务数
  created: number;   // 成功创建数
  skipped: number;   // 跳过数（重复ID等）
  tasks: ImportedTask[];
}

interface ImportedTask {
  title: string;     // 任务标题（去除标签和日期后的纯文本）
  date: string;      // YYYY-MM-DD
  priority: string;  // high / medium / low
  tags: string[];    // 学科标签数组
  status: string;    // todo / done
}
```

### 4. 用户操作流程

```
用户点击 [导入 MD 计划] 按钮
        │
        ├── Tauri 环境 → 弹出系统文件选择器 → 选择 .md 文件
        │                           │
        │                    Rust 读取文件内容
        │                           │
        └── Web 环境 → 手动粘贴 MD 内容到文本框
                                    │
                         ┌──────────┘
                         ▼
                    解析预览面板
                    （展示每个任务的标题/日期/优先级/标签）
                         │
                    用户确认导入
                         │
                    batch_create_tasks()
                         │
                    任务列表自动刷新
```

### 5. 去重策略

`batch_create_tasks` 在 Rust 端使用 `INSERT OR IGNORE` 语义，以 `id` 为唯一键进行去重。前端生成的 ID 使用 `timestamp-random` 格式，天然避免冲突。

---

## 三、《纯 API 驱动的 AI 极简工作流汇报》

### 1. 架构选择：纯云端 API

**选型**: DeepSeek Chat API (`deepseek-chat` model)
**原因**: 无需本地部署 LLM，轻量级，低成本，API 兼容 OpenAI 格式

```
前端 ──invoke()──→ Tauri Rust ──reqwest──→ DeepSeek API
                   (CORS 代理)              (云端推理)
```

**为什么需要 Rust 中转**: 浏览器环境存在 CORS 限制，无法直接调用第三方 API。Tauri Rust 作为本地代理，绕过浏览器安全策略。

### 2. 已实现的 AI 功能（选定 2 个核心场景）

#### 场景一：闪电灵感 Inbox（NLP 任务解析）

**入口**: 任务页面顶部 [⚡ 闪电灵感] 按钮

**流程**:
1. 用户输入自然语言日程描述
2. 发送至 DeepSeek API，System Prompt 指导返回结构化 JSON
3. 前端解析 JSON，展示预览
4. 用户确认后批量创建任务

**System Prompt**:
```
你是一个任务解析助手。用户会输入一段混乱的自然语言日程描述。
请严格返回一个JSON数组，每个元素包含:
- title: 任务标题(简洁)
- date: 日期(YYYY-MM-DD格式，根据"今天"=${today}推算)
- priority: "high"/"medium"/"low"
- tags: 标签数组(从内容推断学科标签)
- startTime: 建议开始时间(HH:mm)
- duration: 预计时长(小时,数字)

只返回JSON数组，不要返回任何其他内容。
```

**JSON 稳定性措施**:
- `temperature: 0.3` — 降低随机性，提高格式一致性
- `max_tokens: 1024` — 限制输出长度
- 前端做 `JSON.parse` + 类型校验 + 容错处理
- 自动去除 AI 可能返回的 markdown code fences (` ```json `)

#### 场景二：一键 AI 复盘（日记生成器）

**入口**: 每日留痕页面 [✨ 一键 AI 复盘] 按钮

**流程**:
1. 自动读取今日已完成任务 + 专注时长
2. 发送至 DeepSeek API，让 AI 生成复盘日记
3. 自动保存为一篇 DailyLog

**System Prompt**:
```
你是EVA系统的复盘助手，语调清冷、极简，像绫波丽。
用户今天完成了以下任务和专注时长，请生成一段极简的复盘日记(100-200字)。
要求:
1. 用Markdown格式
2. 包含鼓励但保持克制冷淡的语调
3. 总结关键成就
4. 简短建议明天的方向
不要加标题，直接输出正文内容。
```

**降级策略**:
- API 调用失败时 → `DailyLogService.generateDailyReview()` 使用本地模板生成（无 AI）
- 模板包含完成任务清单 + 专注时长统计

### 3. AI Proxy 后端实现

```rust
#[tauri::command]
async fn ai_proxy(request: AiProxyRequest) -> Result<AiProxyResponse, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": request.model,
        "messages": [
            { "role": "system", "content": request.system_prompt },
            { "role": "user", "content": request.user_message }
        ],
        "temperature": request.temperature.unwrap_or(0.7),
        "max_tokens": request.max_tokens.unwrap_or(1024)
    });
    let resp = client.post(&request.api_url)
        .header("Authorization", format!("Bearer {}", request.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send().await.map_err(|e| e.to_string())?;
    // ... parse OpenAI-format response
}
```

### 4. API Key 管理

- 存储于 `localStorage("eva.ai.apiKey")`
- 首次使用时在 UI 中输入，后续自动记忆
- 仅在 Tauri invoke 时传入 Rust 层，不通过网络暴露

### 5. 成本估算

| 模型           | 输入价格        | 输出价格        | 单次调用预估 |
| -------------- | --------------- | --------------- | ------------ |
| deepseek-chat  | ¥1/百万tokens   | ¥2/百万tokens   | ~¥0.003      |

每日 10 次调用成本约 ¥0.03，极低。

---

*报告生成时间: 2025-01-XX*
*项目: EVA-00 考研辅助终端 (Digital Garden)*
