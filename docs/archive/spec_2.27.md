# 错题快录与智能复习系统 Spec（v1.4）

> 项目：QCBs Digital Garden  
> 日期：2026-02-27  
> 范围：AI 多模态图片识题 + 错题本持久化 + 周复盘清单化复习 + 留痕联动  
> 目标：围绕"拍照→题面 LaTeX 提取→一键收录→周内灵活复习"构建考研错题快速归纳闭环

---

## 1. 需求澄清

### 1.1 用户核心诉求

1. 在知识库 AI 对话中**发送题目图片**（数学手写题、408 真题截图等），AI 能**识别并解题**。
2. AI 回答（含 LaTeX 公式 + Markdown 解析）可**一键导入到每日留痕**，自动打上"错题"标签。
3. 收录的错题应形成**独立错题本**，支持按学科/标签检索、按掌握程度筛选。
4. 周复盘中展示**本周待复习错题标题清单**，用户可在本周任意时间复习并勾选完成。
5. 对已复习题目，若仍需继续练习，可手动加入**下周延续清单**。
6. 错题内容优先保留：**LaTeX 格式题面 + Markdown 解答**；图片仅在需要保留图形信息时存档。

### 1.2 现状与约束

| 维度 | 现状 | 约束 |
|---|---|---|
| AI 模型 | SiliconFlow `deepseek-ai/DeepSeek-V3.2`（纯文本） | 不支持多模态 |
| AI 对话 | Notes.tsx 右侧面板，SSE 流式，SQLite 持久化 | 已有 `ai_sessions` + `ai_messages` |
| 每日留痕 | Blog.tsx，`daily_logs` 表，支持 Markdown + 标签 | 已有 `DailyLogService` |
| LaTeX 渲染 | AI 回复已支持 `remark-math` + `rehype-katex` | 仅限 AI 助手气泡 |
| 图片处理 | 无任何图片上传/发送能力 | 需从零构建 |
| 错题管理 | 无 | 需从零构建 |
| 周复盘机制 | 当前周复盘偏统计，不含错题标题清单勾选 | 需新增“真实自然周 + 勾选 + 延续”机制 |

### 1.3 多模态解决方案

**核心问题**：DeepSeek-V3.2 不支持图片输入。

**解决策略**：采用 **双模型流水线（Vision + Reasoning）**——

1. **识题阶段**：使用 SiliconFlow 上的视觉模型（如 `Pro/Qwen/Qwen2.5-VL-7B-Instruct`）读取图片，提取题目文本（含 LaTeX 公式还原）。
2. **解题阶段**：将提取的文本交给推理模型（`DeepSeek-R1` 或 `DeepSeek-V3.2`）生成详细步骤解答。
3. 用户也可选择**单模型模式**：若未来切换到原生支持视觉的模型（如 Qwen2.5-VL-72B），则一步完成。

**降级方案**：
- 若视觉模型不可用/返回质量差，用户可手动粘贴题目文本再发送。
- 保留纯文本对话能力不受影响。

---

## 2. 目标与边界

### 2.1 本期目标（v1.4 必须做）

- **G1**：AI 对话支持图片上传（粘贴/选择文件），调用视觉模型识别题目。
- **G2**：新增"错题快录"能力——AI 回答可一键收录为结构化错题。
- **G3**：新增"错题本"独立页面，支持学科/标签/掌握程度筛选与检索。
- **G4**：周复盘内置“本周待复习错题清单”（标题级），支持勾选完成与下周延续。
- **G5**：一键同步到每日留痕（自动生成带"错题"标签的留痕条目）。
- **G6**：Dashboard / 周复盘集成错题统计摘要。
- **G7**：更新文档（PRD、数据白皮书、CHANGELOG）。

### 2.2 本期非目标（先不做）

- OCR 本地离线识别（Tesseract 等）——优先走云端视觉模型。
- 错题手写笔记/标注（iPad 手写板联动）。
- 跨设备错题同步（云端账户体系）。
- 错题与 Quiz 模块的合并（Quiz 仍冻结）。
- 错题导出 PDF/打印。
- 系统自动规定“每天必须复习 N 题”的强约束节奏。

---

## 3. 领域模型设计

### 3.1 核心实体

#### A) WrongQuestion（错题记录）

```ts
type WrongQuestion = {
  id: string;
  subject: string;                    // "数学" | "408" | "英语" | "政治" | "其他"
  tags_json: string;                  // '["线代","特征值"]'
  question_content: string;           // 题目正文（Markdown + LaTeX）
  question_image_path: string | null; // 原始题目图片相对路径
  ai_solution: string;                // AI 解答（Markdown + LaTeX）
  user_note: string | null;           // 用户补充笔记
  source: "ai_chat" | "manual";      // 来源
  ai_session_id: string | null;       // 关联 AI 会话 ID（可溯源）
  ai_message_ids_json: string | null; // 关联 AI 消息 ID 列表 '["msg1","msg2"]'
  difficulty: number;                 // 1-5 主观难度
  mastery_level: number;              // 0=未掌握 1=模糊 2=基本掌握 3=熟练
   review_count: number;               // 周复盘勾选完成次数（长期统计）
   next_review_date: string | null;    // 兼容保留字段（v1.4 不作为强调度依据）
   last_review_date: string | null;    // 最近一次在周清单中勾选完成日期
   ease_factor: number;                // 兼容保留字段（可用于未来算法）
   interval_days: number;              // 兼容保留字段（可用于未来算法）
  is_archived: number;                // 0 | 1
  created_at: string;
  updated_at: string;
};
```

#### B) ImageAttachment（图片附件，逻辑概念）

图片不单独建表，以文件系统路径存储：
- 桌面端：`Documents/EVA_Knowledge_Base/ErrorImages/{YYYY-MM}/{uuid}.{ext}`
- 数据库仅存相对路径：`ErrorImages/2026-02/abc123.png`

#### C) WeeklyReviewItem（周复盘错题清单项）

用于实现“本周任意时间复习 + 勾选完成 + 延续到下周”的真实周机制。

```ts
type WeeklyReviewItem = {
   id: string;
   week_start: string;             // YYYY-MM-DD（周一）
   week_end: string;               // YYYY-MM-DD（周日）
   wrong_question_id: string;
   title_snapshot: string;         // 当周展示标题快照
   status: "pending" | "done";     // 本周内勾选状态
   carried_from_week: string | null; // 来源周 week_start（若为延续项）
   completed_at: string | null;
   created_at: string;
   updated_at: string;
};
```

#### D) 错题统计聚合（接口返回）

```ts
type WrongQuestionStats = {
  total_count: number;          // 总错题数
  unmastered_count: number;     // 未掌握 (mastery_level = 0)
   weekly_pending_count: number; // 本周待复习（真实周）
   weekly_done_count: number;    // 本周已勾选完成
  this_week_new: number;        // 本周新增
  by_subject: Array<{           // 按学科分布
    subject: string;
    count: number;
    unmastered: number;
  }>;
};
```

---

## 4. 数据库设计

### 4.1 新增 SQLite 表

```sql
CREATE TABLE IF NOT EXISTS wrong_questions (
  id              TEXT PRIMARY KEY,
  subject         TEXT NOT NULL DEFAULT '其他',
  tags_json       TEXT NOT NULL DEFAULT '[]',
  question_content TEXT NOT NULL,
  question_image_path TEXT,
  ai_solution     TEXT NOT NULL,
  user_note       TEXT,
  source          TEXT NOT NULL DEFAULT 'ai_chat',
  ai_session_id   TEXT,
  ai_message_ids_json TEXT,
  difficulty      INTEGER NOT NULL DEFAULT 3,
  mastery_level   INTEGER NOT NULL DEFAULT 0,
  review_count    INTEGER NOT NULL DEFAULT 0,
  next_review_date TEXT,
  last_review_date TEXT,
  ease_factor     REAL NOT NULL DEFAULT 2.5,
  interval_days   INTEGER NOT NULL DEFAULT 1,
  is_archived     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  FOREIGN KEY(ai_session_id) REFERENCES ai_sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wrong_questions_subject ON wrong_questions(subject);
CREATE INDEX IF NOT EXISTS idx_wrong_questions_mastery ON wrong_questions(mastery_level);
CREATE INDEX IF NOT EXISTS idx_wrong_questions_next_review ON wrong_questions(next_review_date);
CREATE INDEX IF NOT EXISTS idx_wrong_questions_archived ON wrong_questions(is_archived);
CREATE INDEX IF NOT EXISTS idx_wrong_questions_created ON wrong_questions(created_at DESC);

CREATE TABLE IF NOT EXISTS weekly_review_items (
   id TEXT PRIMARY KEY,
   week_start TEXT NOT NULL,
   week_end TEXT NOT NULL,
   wrong_question_id TEXT NOT NULL,
   title_snapshot TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT 'pending',
   carried_from_week TEXT,
   completed_at TEXT,
   created_at TEXT NOT NULL,
   updated_at TEXT NOT NULL,
   FOREIGN KEY(wrong_question_id) REFERENCES wrong_questions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_weekly_review_items_week ON weekly_review_items(week_start, week_end);
CREATE INDEX IF NOT EXISTS idx_weekly_review_items_status ON weekly_review_items(status);
CREATE INDEX IF NOT EXISTS idx_weekly_review_items_question ON weekly_review_items(wrong_question_id);
```

### 4.2 ai_messages 表扩展

现有 `ai_messages` 表需新增 `image_path` 列，存储用户消息中附带的图片：

```sql
ALTER TABLE ai_messages ADD COLUMN image_path TEXT;
```

> 迁移策略：`ALTER TABLE ... ADD COLUMN` 对已有行自动填 NULL，无需回填。

### 4.3 图片存储策略

| 场景 | 存储位置 | 说明 |
|---|---|---|
| AI 对话中上传的图片 | `Documents/EVA_Knowledge_Base/ErrorImages/{YYYY-MM}/{uuid}.{ext}` | 可选写入，仅在需保留图形信息时持久化 |
| 数据库字段 | `wrong_questions.question_image_path` / `ai_messages.image_path` | 默认 NULL，按需存相对路径 |
| 前端展示 | Tauri: 读取绝对路径；Web: `/api/images/{relative_path}` | 双模适配 |
| 图片大小限制 | 最大 10MB，超过提示压缩 | 前端校验 |

默认策略：
- **优先提取 LaTeX 题面，不默认持久化原图**。
- 仅当用户选择“保留原图”或模型判断“题目依赖图形语义（典型 408 图示题）”时写入 `ErrorImages/` 并关联路径。

---

## 5. 后端接口设计

### 5.1 新增 Tauri Commands

#### 图片处理
- `save_chat_image(image_data: Vec<u8>, ext: String) -> String`
  - 将图片二进制写入 `ErrorImages/{YYYY-MM}/{uuid}.{ext}`
  - 返回相对路径

#### 错题 CRUD
- `get_wrong_questions(filter: WrongQuestionFilter) -> Vec<WrongQuestion>`
   - `filter`: `{ subject?, mastery_level?, search_keyword?, is_archived? }`
- `create_wrong_question(question: WrongQuestion) -> WrongQuestion`
- `update_wrong_question(id: String, question: WrongQuestion) -> WrongQuestion`
- `archive_wrong_question(id: String) -> ()`

#### 周清单调度
- `get_weekly_review_items(week_start: String) -> Vec<WeeklyReviewItem>`
   - 返回该真实自然周（周一~周日）的错题清单项
- `toggle_weekly_review_item_done(item_id: String, done: bool) -> WeeklyReviewItem`
   - 勾选/取消勾选本周完成状态
- `carry_weekly_review_items_to_next_week(item_ids: Vec<String>, from_week_start: String) -> ()`
   - 将选中题目延续到下周清单（去重写入）

#### 统计
- `get_wrong_question_stats() -> WrongQuestionStats`

### 5.2 新增 Axum HTTP 路由

```
GET    /api/wrong-questions              # 列表（支持 query 过滤）
POST   /api/wrong-questions              # 新建
PUT    /api/wrong-questions/{id}         # 更新
DELETE /api/wrong-questions/{id}         # 归档（软删除）
GET    /api/wrong-questions/stats        # 统计概览
GET    /api/weekly-review/items?week_start=YYYY-MM-DD
POST   /api/weekly-review/items/{id}/toggle
POST   /api/weekly-review/carry-next-week
POST   /api/images/upload               # 上传图片（multipart/form-data）
GET    /api/images/{path}               # 获取图片（静态服务）
```

### 5.3 同步广播

新增动作：
- `SYNC_WRONG_QUESTIONS`
- `SYNC_WEEKLY_REVIEW_ITEMS`

触发点：错题增删改、周清单勾选、延续到下周。

---

## 6. AI 多模态扩展设计

### 6.1 aiClient.ts 改造

#### 消息内容类型扩展

```ts
// 现有（纯文本）
type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// 扩展为（兼容多模态）
type TextContent = { type: "text"; text: string };
type ImageContent = { type: "image_url"; image_url: { url: string } };
type MessageContent = string | Array<TextContent | ImageContent>;

type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: MessageContent;
};
```

#### 新增视觉模型配置

```ts
const VISION_MODELS: Record<string, string> = {
  "qwen-vl-7b": "Pro/Qwen/Qwen2.5-VL-7B-Instruct",
  "internvl-26b": "Pro/OpenGVLab/InternVL2.5-26B",
};

const DEFAULT_VISION_MODEL = "Pro/Qwen/Qwen2.5-VL-7B-Instruct";
```

#### 双模型流水线函数

```ts
export async function* visionChatCompletion(options: {
  imageBase64: string;          // "data:image/png;base64,..."
  userPrompt: string;           // 用户附加文字指令
  visionModel?: string;         // 视觉模型
  reasoningModel?: string;      // 推理模型（可选二阶段）
  mode: "single" | "pipeline";  // 单模型 or 双模型流水线
  signal?: AbortSignal;
}): AsyncGenerator<string, void, unknown> {
  // single 模式：视觉模型一步到位
  // pipeline 模式：
  //   Step 1 — vision model 提取题目
  //   Step 2 — reasoning model 详细解答
}
```

### 6.2 Settings 新增字段

```ts
// AppSettings 扩展
interface AppSettings {
  // ... 现有字段 ...
  aiVisionModel: string;        // 视觉模型，默认 "Pro/Qwen/Qwen2.5-VL-7B-Instruct"
  aiVisionMode: "single" | "pipeline";  // 单步 or 流水线
}
```

### 6.3 图片上传前端流程（默认提取题面，不强制存图）

```
用户操作（选择图片/粘贴截图/拖拽）
  ↓
前端校验（类型 + 大小 ≤ 10MB）
  ↓
若需保留原图：调用 Rust save_chat_image → 写入磁盘 → 返回 relative_path
  ↓
图片转 base64 → 构建多模态消息
  ↓
调用 visionChatCompletion (vision model)
  ↓
SSE 流式返回 → 渲染到聊天气泡（含 LaTeX）
  ↓
消息持久化到 ai_messages（`image_path` 按需写入）
```

### 6.4 你还需要做什么（Qwen2.5-VL-7B 接入准备）

你目前只提供 SiliconFlow API Key，**可以直接开始开发**，无需额外平台接入。但建议你确认 4 件事：

1. 账户中该模型可调用：`Pro/Qwen/Qwen2.5-VL-7B-Instruct`（无权限会 4xx）。
2. 账户余额/额度足够（视觉模型单次成本高于纯文本）。
3. 在设置页填好统一 API Key（当前沿用 `eva.settings.v1` 的 AI Key）。
4. 首次联调准备 2~3 张样例题图：
   - 一张公式清晰题
   - 一张手写拍照题
   - 一张 408 图示题（验证“保留原图”分支）
```

---

## 7. 前端交互设计

### 7.1 Notes AI 对话增强（图片上传）

#### 改造 `src/pages/Notes.tsx`

1. **输入区改造**：
   - 将底部 `<input type="text">` 改为 `<textarea>`（支持多行 + 粘贴）
   - 新增图片上传按钮（📎 图标），支持：
     - 点击选择本地图片（`open()` 对话框）
     - Ctrl+V 粘贴剪贴板截图
     - 拖拽图片到输入区
   - 图片预览缩略图显示在输入区上方，带删除按钮
   - 发送时：有图片 → 走 `visionChatCompletion`；纯文本 → 走 `chatCompletion`

2. **消息气泡增强**：
   - 用户消息若含图片，在文字上方渲染缩略图（可点击放大）
   - AI 回复继续使用 `ReactMarkdown` + `remarkMath` + `rehypeKatex`（已有能力）
   - AI 回复气泡右下角新增**「收录为错题」**按钮（仅 assistant 消息显示）

3. **收录为错题弹窗**（点击「收录为错题」后）：
   - 科目选择：数学 / 408 / 英语 / 政治 / 其他
   - 标签输入：逗号分隔自由标签
   - 难度评级：1-5 星
   - 题目内容：自动填充（用户消息文本 + 图片引用）
   - AI 解答：自动填充（assistant 消息正文）
   - 补充笔记：可选自由文本
   - 同步到留痕：开关（默认开），开启则同时创建 Blog 条目
   - 确认按钮：「收录」

### 7.2 错题本独立页面

#### 新增 `src/pages/ErrorBook.tsx`（路由 `/error-book`）

**页面结构**：

```
┌─────────────────────────────────────────────┐
│  错题本                     [本周待复习 N 道] │
├─────────────────────────────────────────────┤
│ 筛选栏: [全部学科▾] [全部标签▾] [掌握程度▾]  │
│         [搜索关键词...]                      │
├─────────────────────────────────────────────┤
│ 统计摘要卡片（总数/未掌握/本周新增）          │
├─────────────────────────────────────────────┤
│ 错题列表（卡片模式）                          │
│ ┌──────────────────────────┐                │
│ │ [数学] 特征值与特征向量    │                │
│ │ #线代 #特征值  ★★★☆☆      │                │
│ │ 掌握: 模糊  本周状态: 待完成 │                │
│ │ [查看] [复习] [编辑] [归档] │                │
│ └──────────────────────────┘                │
│ ...                                          │
├─────────────────────────────────────────────┤
│ 分页                                         │
└─────────────────────────────────────────────┘
```

**核心功能**：
1. **列表模式**：
   - 按创建时间倒序展示
   - 支持学科/标签/掌握程度筛选
   - 支持关键词搜索（匹配题目/解答/笔记）
   - 每张卡片显示：科目标签、题目摘要、难度星级、掌握程度、本周清单状态

2. **详情模式**（点击"查看"）：
   - 全屏 Modal 展示完整题目（含 LaTeX 渲染 + 原始图片）
   - 完整 AI 解答（LaTeX + Markdown 渲染）
   - 用户补充笔记
   - 底部操作栏：编辑 / 归档 / 溯源（跳转到原始 AI 会话）

3. **复习模式**（点击"复习"或"本周待复习"入口）：
   - 进入"标题清单 + 按题复习"流程
   - 正面：题目（含图片）
   - 翻转/展开：AI 解答 + 用户笔记
   - 完成后勾选 checkbox（本周状态改为 done）
   - 支持多选后一键"延续到下周"
   - 连续复习流，直到本周待复习项处理完

4. **手动录入**（可选）：
   - 提供"手动新增错题"按钮，纯手动填写题目/解答
   - source 标记为 `manual`

### 7.3 Dashboard 集成

在 Dashboard 中新增**「错题速览」**卡片（位于番茄卡片下方）：

```
┌──────────────────────────┐
│ 📝 错题速览               │
│ 总计 47 道 · 未掌握 12 道  │
│ 本周待复习: 5 道          │
│       ┌──────────┐       │
│       │ 开始复习  │       │
│       └──────────┘       │
│ 本周新增: 3 道            │
└──────────────────────────┘
```

点击"开始复习"跳转 `/error-book?mode=review`。

### 7.4 WeeklyReview 集成（真实自然周）

在"周度学情深度剖析"区域上方新增**本周错题清单卡**：

```
┌──────────────────────────┐
│ 本周待复习错题（标题清单） │
│ [ ] 矩阵特征值综合题       │
│ [x] 进程调度时序分析题     │
│ [ ] TCP 拥塞控制图示题     │
│ [延续到下周]（可多选）     │
└──────────────────────────┘
```

交互规则：
- 清单按**真实周**组织（周一 00:00:00 到周日 23:59:59），不再采用“从某天往前退 7 天”。
- 用户可在本周任意时间勾选完成，不限制每日复习数量。
- 对仍需练习的题目，可手动“延续到下周”，进入下周 `pending` 清单。

### 7.5 留痕（Blog）联动

收录错题时若"同步到留痕"开启，自动创建一条留痕：

```markdown
## 错题收录 - 数学 · 特征值与特征向量

### 题目
$$\text{设矩阵} A = \begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}，求 A 的特征值与特征向量。$$

### AI 解答
...（完整 Markdown + LaTeX）...

### 我的笔记
...（用户补充）...

---
*由 EVA 错题快录自动生成*
```

- Tags: `["错题", "数学", "线代", ...]`
- Mood: `"focused"`

### 7.6 导航与路由

- `App.tsx`：新增 `/error-book` 路由
- `Sidebar.tsx`：新增「错题本」入口（📝 图标，位于"专注成就"下方）
- `Layout.tsx` 移动端导航：评估是否新增入口（建议通过 Dashboard 卡片跳转，不增加底部栏）

---

## 8. 配色与 UI 规范

严格遵守 EVA 主题 token：

| 元素 | 颜色 | 用途 |
|---|---|---|
| 科目标签背景 | `#88B5D3/15` | 淡蓝底 |
| 未掌握状态 | `#FF9900` | 橙色警告 |
| 已掌握状态 | `#88B5D3` | 绫波蓝 |
| 难度星级激活 | `#FF9900` | 初号机橙 |
| 卡片边框 | `border-[#88B5D3]/30` | 统一 glass-card 风格 |
| 复习按钮 | `bg-gradient-to-r from-[#2a3b52] to-[#88B5D3]` | EVA 渐变 |
| 图片上传区 | `border-dashed border-[#88B5D3]/40` | 虚线框 |

---

## 9. 数据关联与统计口径

### 9.1 错题溯源链路

```
用户发送图片消息 → ai_messages (image_path, role='user')
                     ↓
AI 返回解答      → ai_messages (role='assistant')
                     ↓
一键收录         → wrong_questions (ai_session_id, ai_message_ids_json)
                     ↓
同步留痕         → daily_logs (tags 含 "错题")
```

### 9.2 周清单口径（替代按天配额）

- **本周边界**：自然周（周一~周日），`week_start` 为周一日期。
- **本周待复习**：`weekly_review_items.status = 'pending' AND week_start = current_week_start`
- **本周已完成**：`weekly_review_items.status = 'done' AND week_start = current_week_start`
- **延续到下周**：从本周选中项复制到下周 `weekly_review_items`，`carried_from_week = current_week_start`
- **未掌握**：`wrong_questions.mastery_level = 0 AND is_archived = 0`（保留长期能力指标）

### 9.3 周复盘错题数据

周复盘 AI Prompt 注入：
```
本周错题清单：待复习 {pending} 道，已完成 {done} 道。
其中可延续到下周候选 {carryable} 道。
学科分布：数学 {x} 道，408 {y} 道，英语 {z} 道。
```

---

## 10. 风险与规避

| # | 风险 | 规避策略 |
|---|---|---|
| 1 | SiliconFlow 视觉模型识别准确率低（手写/模糊图） | 提供"识别不准？手动编辑题目"入口；pipeline 模式下 Step 1 结果可人工校对后再发 Step 2 |
| 2 | 图片体积大导致 base64 编码后请求超限 | 前端压缩到 ≤ 2MB 再编码；超大图提示用户裁切 |
| 3 | 视觉模型 API 费用高于纯文本 | 设置页展示"视觉模型调用次数"统计；可关闭自动视觉，改为手动触发 |
| 4 | LaTeX 渲染在留痕中不如 AI 气泡完备 | Blog 详情页也引入 `ReactMarkdown` + `remarkMath` + `rehypeKatex` |
| 5 | 错题积压过多不复习 | Dashboard 卡片强提醒；周复盘清单支持“延续到下周”但需显式操作，避免无限堆积 |
| 6 | 图片只在桌面端可用，Web 端无法写磁盘 | Web 端走 `/api/images/upload` multipart 上传，Rust 统一写入 |

---

## 11. 验收标准（DoD）

1. ✅ AI 对话中可粘贴/选择图片并发送，AI 能返回包含 LaTeX 的题面与解答。
2. ✅ AI 回复气泡上有"收录为错题"按钮，点击后弹出结构化录入弹窗。
3. ✅ 收录后错题出现在"错题本"页面，题目/解答完整且 LaTeX 正确渲染。
4. ✅ 错题本支持按学科/标签/掌握程度筛选。
5. ✅ 周复盘显示本周待复习错题标题清单，支持勾选完成。
6. ✅ 支持将勾选项或未完成项手动延续到下周清单。
7. ✅ "同步到留痕"开启时，Blog 页面出现对应错题条目且 LaTeX 正常渲染。
8. ✅ Dashboard 展示错题速览卡片。
9. ✅ WeeklyReview 清单使用真实自然周（周一~周日）。
10. ✅ 图片默认不落库，仅在用户选择保留原图时持久化。
11. ✅ Web/LAN 模式下图片上传与错题查看均可用。
12. ✅ 全部 UI 符合 EVA 主题配色规范。
13. ✅ PRD、数据白皮书、CHANGELOG 已同步更新。

---

## 12. Agent 交付清单（list_prompt）

> 使用方式：按顺序把以下 prompt 发给实现 agent。  
> 每个 prompt 都要求：改代码 + 跑最小验证 + 回传改动文件与验证结果。

### Prompt 1：新增数据库表与后端模型（周清单机制）

```text
请在 src-tauri/src/lib.rs 中完成以下工作：

1. 新增 `WrongQuestion` 数据结构（Rust struct，derive Serialize/Deserialize/FromRow）：
   - id: String
   - subject: String
   - tags_json: String
   - question_content: String
   - question_image_path: Option<String>
   - ai_solution: String
   - user_note: Option<String>
   - source: String             // "ai_chat" | "manual"
   - ai_session_id: Option<String>
   - ai_message_ids_json: Option<String>
   - difficulty: i32            // 1-5
   - mastery_level: i32         // 0-3
   - review_count: i32
   - next_review_date: Option<String>
   - last_review_date: Option<String>
   - ease_factor: f64           // 默认 2.5
   - interval_days: i32         // 默认 1
   - is_archived: i32
   - created_at: String
   - updated_at: String

2. 新增 `WrongQuestionFilter` 结构体（用于列表查询参数）：
   - subject: Option<String>
   - mastery_level: Option<i32>
   - search_keyword: Option<String>
   - is_archived: Option<i32>   // 默认 0

3. 新增 `WeeklyReviewItem` 结构体：
   - id: String
   - week_start: String        // 周一
   - week_end: String          // 周日
   - wrong_question_id: String
   - title_snapshot: String
   - status: String            // pending | done
   - carried_from_week: Option<String>
   - completed_at: Option<String>
   - created_at: String
   - updated_at: String

4. 新增 `WrongQuestionStats` 结构体（统计返回值）：
   - total_count: i64
   - unmastered_count: i64
   - weekly_pending_count: i64
   - weekly_done_count: i64
   - this_week_new: i64
   - by_subject: Vec<SubjectStat>
   其中 SubjectStat = { subject: String, count: i64, unmastered: i64 }

5. 在应用启动的 `run_migrations` 中新增建表 SQL：

   CREATE TABLE IF NOT EXISTS wrong_questions (
     id TEXT PRIMARY KEY,
     subject TEXT NOT NULL DEFAULT '其他',
     tags_json TEXT NOT NULL DEFAULT '[]',
     question_content TEXT NOT NULL,
     question_image_path TEXT,
     ai_solution TEXT NOT NULL,
     user_note TEXT,
     source TEXT NOT NULL DEFAULT 'ai_chat',
     ai_session_id TEXT,
     ai_message_ids_json TEXT,
     difficulty INTEGER NOT NULL DEFAULT 3,
     mastery_level INTEGER NOT NULL DEFAULT 0,
     review_count INTEGER NOT NULL DEFAULT 0,
     next_review_date TEXT,
     last_review_date TEXT,
     ease_factor REAL NOT NULL DEFAULT 2.5,
     interval_days INTEGER NOT NULL DEFAULT 1,
     is_archived INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     FOREIGN KEY(ai_session_id) REFERENCES ai_sessions(id) ON DELETE SET NULL
   );

   以及索引 SQL：
   CREATE INDEX IF NOT EXISTS idx_wrong_questions_subject ON wrong_questions(subject);
   CREATE INDEX IF NOT EXISTS idx_wrong_questions_mastery ON wrong_questions(mastery_level);
   CREATE INDEX IF NOT EXISTS idx_wrong_questions_next_review ON wrong_questions(next_review_date);
   CREATE INDEX IF NOT EXISTS idx_wrong_questions_archived ON wrong_questions(is_archived);
   CREATE INDEX IF NOT EXISTS idx_wrong_questions_created ON wrong_questions(created_at DESC);

   追加周清单表：
   CREATE TABLE IF NOT EXISTS weekly_review_items (
     id TEXT PRIMARY KEY,
     week_start TEXT NOT NULL,
     week_end TEXT NOT NULL,
     wrong_question_id TEXT NOT NULL,
     title_snapshot TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',
     carried_from_week TEXT,
     completed_at TEXT,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     FOREIGN KEY(wrong_question_id) REFERENCES wrong_questions(id) ON DELETE CASCADE
   );

   CREATE INDEX IF NOT EXISTS idx_weekly_review_items_week ON weekly_review_items(week_start, week_end);
   CREATE INDEX IF NOT EXISTS idx_weekly_review_items_status ON weekly_review_items(status);

6. 为 ai_messages 表执行安全迁移：
   在 run_migrations 中新增：
   ALTER TABLE ai_messages ADD COLUMN image_path TEXT;
   （用 .execute().ok() 忽略已存在错误）

7. 运行 cargo check 并汇报结果。
```

### Prompt 2：实现错题 Tauri Commands（含周清单机制）

```text
请在 src-tauri/src/lib.rs 中实现并注册以下 Tauri Commands：

1. `get_wrong_questions(filter: WrongQuestionFilter) -> Vec<WrongQuestion>`
   - 根据 filter 各字段动态拼接 WHERE 条件
   - subject 非空时 WHERE subject = ?
   - mastery_level 非空时 WHERE mastery_level = ?
   - search_keyword 非空时 WHERE (question_content LIKE '%keyword%' OR ai_solution LIKE '%keyword%' OR user_note LIKE '%keyword%')
   - is_archived 默认 0
   - ORDER BY created_at DESC

2. `create_wrong_question(question: WrongQuestion) -> WrongQuestion`
   - 自动生成 UUID id
   - 自动填充 created_at / updated_at
   - 仅在“加入本周清单”开启时自动写入 current_week 的 weekly_review_items
   - 触发 SYNC_WRONG_QUESTIONS 广播

3. `update_wrong_question(id: String, question: WrongQuestion) -> WrongQuestion`
   - 更新除 id/created_at 外的所有字段
   - updated_at 设为当前时间
   - 触发 SYNC_WRONG_QUESTIONS 广播

4. `archive_wrong_question(id: String) -> ()`
   - SET is_archived = 1, updated_at = now
   - 触发 SYNC_WRONG_QUESTIONS 广播

5. `get_weekly_review_items(week_start: String) -> Vec<WeeklyReviewItem>`
   - week_start 必须是周一（后端校验）
   - 自动计算 week_end = week_start + 6 天
   - 返回该周全部清单项（pending/done）

6. `toggle_weekly_review_item_done(item_id: String, done: bool) -> WeeklyReviewItem`
   - done=true: status='done', completed_at=now
   - done=false: status='pending', completed_at=NULL
   - 触发 SYNC_WEEKLY_REVIEW_ITEMS 广播

7. `carry_weekly_review_items_to_next_week(item_ids: Vec<String>, from_week_start: String) -> ()`
   - 计算 next_week_start = from_week_start + 7 天（周一）
   - 将选中项写入 next_week_start 对应清单，title_snapshot 沿用（若目标周已存在同 wrong_question_id 则跳过）
   - carried_from_week = from_week_start
   - 触发 SYNC_WEEKLY_REVIEW_ITEMS 广播

8. `get_wrong_question_stats() -> WrongQuestionStats`
   - total_count: SELECT COUNT(*) WHERE is_archived = 0
   - unmastered_count: SELECT COUNT(*) WHERE mastery_level = 0 AND is_archived = 0
   - weekly_pending_count: SELECT COUNT(*) FROM weekly_review_items WHERE week_start=current_week_start AND status='pending'
   - weekly_done_count: SELECT COUNT(*) FROM weekly_review_items WHERE week_start=current_week_start AND status='done'
   - this_week_new: SELECT COUNT(*) WHERE created_at >= date('now','localtime','weekday 0','-6 days') AND is_archived = 0
   - by_subject: SELECT subject, COUNT(*), SUM(CASE WHEN mastery_level=0 THEN 1 ELSE 0 END) FROM wrong_questions WHERE is_archived=0 GROUP BY subject

9. `save_chat_image(image_data: Vec<u8>, ext: String) -> String`
   - 构建目标路径：Documents/EVA_Knowledge_Base/ErrorImages/{YYYY-MM}/{uuid}.{ext}
   - 创建目录（如不存在）
   - 写入文件
   - 返回相对路径 "ErrorImages/2026-02/{uuid}.{ext}"

请在 .invoke_handler 的 generate_handler 宏中注册所有新命令。
运行 cargo check 并汇报结果。
```

### Prompt 3：补齐 Axum HTTP 路由（含周清单）

```text
请为 LAN/Web 模式新增路由（在 src-tauri/src/lib.rs 的 Axum router 中）：

1. GET  /api/wrong-questions
   - Query 参数: subject, mastery_level, search_keyword, is_archived
   - 调用与 get_wrong_questions 相同的底层查询

2. POST /api/wrong-questions
   - JSON body = WrongQuestion
   - 调用与 create_wrong_question 相同的底层逻辑

3. PUT  /api/wrong-questions/{id}
   - JSON body = WrongQuestion
   - 调用与 update_wrong_question 相同的底层逻辑

4. DELETE /api/wrong-questions/{id}
   - 软删除（archive）

5. GET  /api/wrong-questions/stats
   - 返回 WrongQuestionStats

6. GET  /api/weekly-review/items?week_start=YYYY-MM-DD
   - 返回本周清单项

7. POST /api/weekly-review/items/{id}/toggle
   - JSON body: { "done": true }
   - 勾选/取消勾选

8. POST /api/weekly-review/carry-next-week
   - JSON body: { "from_week_start": "2026-03-02", "item_ids": ["..."] }
   - 批量延续到下周

9. POST /api/images/upload
   - multipart/form-data，字段名 "file"
   - 调用 save_chat_image 逻辑
   - 返回 { "path": "ErrorImages/2026-02/xxx.png" }

10. GET  /api/images/{*path}
   - 读取 Documents/EVA_Knowledge_Base/{path} 文件
   - 返回对应 Content-Type 的图片字节

保持 CORS 与现有风格一致。
运行 cargo check 并汇报结果。
```

### Prompt 4：扩展 apiBridge 双模调用

```text
请在 src/utils/apiBridge.ts 中扩展：

1. 类型定义（直接导出）：
   - WrongQuestion（与 Rust 结构体字段一致）
   - WrongQuestionFilter
   - WrongQuestionStats / SubjectStat

2. 桥接函数（Tauri invoke / Web fetch 双模）：
   - fetchWrongQuestions(filter?: WrongQuestionFilter): Promise<WrongQuestion[]>
   - createWrongQuestion(question: Partial<WrongQuestion>): Promise<WrongQuestion>
   - updateWrongQuestion(id: string, question: Partial<WrongQuestion>): Promise<WrongQuestion>
   - archiveWrongQuestion(id: string): Promise<void>
   - fetchWrongQuestionStats(): Promise<WrongQuestionStats>
   - fetchWeeklyReviewItems(weekStart: string): Promise<WeeklyReviewItem[]>
   - toggleWeeklyReviewItemDone(itemId: string, done: boolean): Promise<WeeklyReviewItem>
   - carryWeeklyReviewItemsToNextWeek(itemIds: string[], fromWeekStart: string): Promise<void>
   - uploadChatImage(imageData: Uint8Array, ext: string): Promise<string>
     - 桌面端：invoke("save_chat_image", { imageData: Array.from(imageData), ext })
     - Web 端：POST /api/images/upload (FormData)
   - getImageUrl(relativePath: string): string
     - 桌面端：拼接绝对路径
     - Web 端：`/api/images/${relativePath}`

3. 同步事件常量：
   - SYNC_WRONG_QUESTIONS = "SYNC_WRONG_QUESTIONS"
   - SYNC_WEEKLY_REVIEW_ITEMS = "SYNC_WEEKLY_REVIEW_ITEMS"

请确保错误处理与现有 focus 系列函数风格一致。
运行 npm run build 汇报结果。
```

### Prompt 5：aiClient 多模态扩展

```text
请修改 src/utils/aiClient.ts：

1. 扩展消息内容类型：
   - 新增类型 TextContent = { type: "text"; text: string }
   - 新增类型 ImageContent = { type: "image_url"; image_url: { url: string } }
   - 新增类型 MessageContent = string | Array<TextContent | ImageContent>
   - 修改 OpenAIChatMessage.content 类型为 MessageContent

2. 新增视觉模型常量：
   const VISION_MODELS: Record<string, string> = {
     "qwen-vl-7b": "Pro/Qwen/Qwen2.5-VL-7B-Instruct",
   };
   const DEFAULT_VISION_MODEL = "Pro/Qwen/Qwen2.5-VL-7B-Instruct";

3. 确保 chatCompletion 函数兼容多模态消息：
   - body.messages 已经支持 content 为数组的情况（OpenAI 兼容格式）
   - 无需额外改动 fetch 逻辑，SiliconFlow 原生支持

4. 新增导出函数 visionChatCompletion：
   export async function* visionChatCompletion(options: {
     imageBase64: string;
     userPrompt: string;
     visionModel?: string;
     reasoningModel?: string;
     mode: "single" | "pipeline";
     signal?: AbortSignal;
   }): AsyncGenerator<string, void, unknown>

   单模型模式（mode = "single"）：
   - 构建多模态消息 [{ type: "text", text: systemPrompt + userPrompt }, { type: "image_url", image_url: { url: imageBase64 } }]
   - systemPrompt = "你是一位考研辅导名师。请仔细看图中的题目，用 LaTeX 格式写出题目原文，然后给出完整详细的解题步骤。所有数学公式使用 LaTeX（行内 $...$ ，行间 $$...$$）。"
   - 调用 chatCompletion({ model: visionModel, messages, ... })
   - yield 所有 chunk

   流水线模式（mode = "pipeline"）：
   - Step 1：用 visionModel + 多模态消息提取题目
     - systemPrompt1 = "请仔细看图中的题目，精确提取题目全文。所有数学公式用 LaTeX 格式（行内 $...$，行间 $$...$$）。只输出题目内容，不要解题。"
     - 收集全部输出为 extractedQuestion
     - yield "**【题目识别】**\n\n" + extractedQuestion + "\n\n---\n\n**【详细解答】**\n\n"
   - Step 2：用 reasoningModel + 纯文本消息解题
     - systemPrompt2 = "你是一位考研辅导名师。以下是学生的题目，请给出完整详细的解题步骤..."
     - yield 所有 chunk

5. 新增设置相关辅助函数：
   export function resolveVisionModel(): string
   - 读取 localStorage "eva.ai.visionModel" 或返回 DEFAULT_VISION_MODEL

6. 确保现有 chatCompletion 行为不变（纯文本向后兼容）。

运行 npm run build 汇报结果。
```

### Prompt 6：Settings 扩展视觉模型配置

```text
请修改设置相关文件：

1. src/lib/settings.ts：
   - AppSettings 新增字段：
     - aiVisionModel: string     // 默认 "Pro/Qwen/Qwen2.5-VL-7B-Instruct"
     - aiVisionMode: "single" | "pipeline"  // 默认 "single"
   - defaultSettings 中补充默认值

2. Settings 页面（定位到 AI 配置区域）新增：
   - "视觉模型"下拉选择：
     - Pro/Qwen/Qwen2.5-VL-7B-Instruct（默认）
     - 允许手动输入自定义模型名
   - "图片识题模式"选择：
     - 单步模式（视觉模型直接解题）
     - 流水线模式（先提取题目，再用推理模型详解）
   - 简短说明文案："发送图片时使用的视觉模型。若识别不准确，可手动编辑后重新提问。"

运行 npm run build 汇报结果。
```

### Prompt 7：Notes AI 对话图片上传（默认不存图）

```text
请修改 src/pages/Notes.tsx，在 AI 对话区域增加图片上传能力：

1. 新增状态：
   - pendingImage: { file: File; previewUrl: string; base64: string } | null
   
2. 将底部输入框从 <input type="text"> 改为 <textarea>（支持多行 + 粘贴）：
   - 保持样式一致（圆角、边框、主题色）
   - 支持 Ctrl+Enter / Enter 发送
   - 高度自适应（min 1行，max 4行）

3. 新增图片附件区（输入框上方，仅当 pendingImage 存在时显示）：
   - 缩略图预览（64x64 圆角）+ 文件名 + 大小
   - 删除按钮（X）
   - EVA 主题虚线边框

4. 新增图片上传按钮（输入框左侧，📎 ImageIcon）：
   - 桌面端：调用 Tauri open() 对话框，过滤 png/jpg/jpeg/webp
   - Web 端：创建隐藏 <input type="file"> 触发

5. 支持 Ctrl+V 粘贴截图：
   - 在 textarea 上监听 paste 事件
   - 检测 clipboardData.items 中 image/* 类型
   - 读取为 File → 生成预览 URL + base64

6. 发送逻辑改造（handleAiSubmit）：
   - 如果 pendingImage 存在：
   a. 增加“保留原图”开关（默认关）
   b. 若开关开启，调用 uploadChatImage 保存图片到磁盘；若关闭则仅内存传 base64 给模型
   c. 读取视觉模型配置（settings.aiVisionModel / aiVisionMode）
   d. 调用 visionChatCompletion 替代 chatCompletion
   e. 用户消息持久化按需附带 image_path（仅保留原图时写入）
   f. 发送完成后清空 pendingImage
   - 如果无图片：保持现有纯文本流程不变

7. 消息气泡渲染增强：
   - 用户消息若有 image_path → 在文字上方渲染图片缩略图
   - 图片可点击放大（简单全屏 modal）
   - 加载图片路径通过 getImageUrl(relativePath) 获取

8. add_ai_message Tauri Command 扩展可选 image_path 参数：
   - 仅当“保留原图”开启时写入 image_path
   - 默认为 NULL

图片大小限制：前端校验 ≤ 10MB，超过提示"图片过大，请压缩后重试"。

运行 npm run build 汇报结果。
```

### Prompt 8：AI 消息"收录为错题"按钮与弹窗

```text
请修改 src/pages/Notes.tsx，为 AI 回复消息添加"收录为错题"功能：

1. 在每条 assistant 消息气泡右下角新增按钮：
   - 图标：📝 或 BookmarkPlus（lucide-react）
   - 文案提示（title）："收录为错题"
   - 样式：opacity-0 group-hover:opacity-100，EVA 蓝色主题

2. 新增状态：
   - captureTarget: { userMsg: ChatMessage | null; assistantMsg: ChatMessage; sessionId: string } | null
   - captureForm: { subject, tags, difficulty, userNote, syncToBlog }

3. 点击"收录为错题"后打开收录弹窗（Modal）：
   - 弹窗标题："收录为错题"
   - 表单字段：
     a. 科目（必选）：数学 | 408 | 英语 | 政治 | 其他（Radio 或 Select）
     b. 标签（可选）：逗号分隔输入
     c. 难度评级（必选）：1-5 星交互组件
     d. 题目内容（自动填充）：取触发消息的前一条 user 消息文本 + 图片引用，可编辑
     e. AI 解答（自动填充）：取 assistant 消息文本，可编辑
     f. 补充笔记（可选）：textarea
     g. 同步到留痕（开关，默认开）
   - 确认按钮："收录"
   - 取消按钮："取消"

4. 确认收录逻辑：
   a. 调用 createWrongQuestion 写入 wrong_questions 表
   b. 如果"同步到留痕"开启：
      - 自动构建 Markdown 内容（题目 + 解答 + 笔记）
      - 调用 DailyLogService.create 创建一条留痕
      - Tags: ["错题", subject, ...customTags]
      - Title: `错题 · ${subject} · ${today}`
   c. 显示成功 Toast
   d. 关闭弹窗

5. 弹窗 UI 遵守 EVA 主题：
   - 背景：glass-card / dark overlay
   - 按钮：EVA 蓝渐变
   - 星级组件：#FF9900 激活色

运行 npm run build 汇报结果。
```

### Prompt 9：错题本独立页面（ErrorBook）

```text
请新增 src/pages/ErrorBook.tsx 并接入路由：

【一、页面结构】

1. 页面 Header：
   - 标题："错题本"
   - 右侧："本周待复习 N 道"按钮（点击进入复习模式）
   - 手动新增按钮（+）

2. 筛选栏：
   - 学科筛选：全部 / 数学 / 408 / 英语 / 政治 / 其他
   - 掌握程度：全部 / 未掌握 / 模糊 / 基本掌握 / 熟练
   - 搜索关键词输入框
   - 排序：最新 / 最早 / 待复习优先

3. 统计摘要卡片行：
   - 总计 X 道 | 未掌握 Y 道 | 本周新增 Z 道
   - 使用 fetchWrongQuestionStats 数据

4. 错题列表（卡片模式）：
   - 每张卡片结构：
     - 左侧：科目色标（EVA 主题色映射）
     - 标题区：题目前50字摘要
     - 标签 Chips
     - 难度星级
     - 掌握程度标签（颜色编码：未掌握=橙，模糊=蓝灰，基本掌握=蓝，熟练=绿）
   - 本周清单状态（pending/done）
     - 操作按钮：查看 | 复习 | 编辑 | 归档

5. 分页控件（每页 20 条）

【二、查看详情 Modal】

点击"查看"打开全屏 Modal：
- 顶部：科目 + 标签 + 难度 + 掌握程度
- 题目区（Markdown + LaTeX 渲染，含图片展示）
- 分隔线
- AI 解答区（Markdown + LaTeX 渲染）
- 用户笔记区
- 底部操作：编辑 / 归档 / 溯源（跳转 /notes 并定位到对应 AI 会话）

【三、复习模式】

点击"本周待复习"或"复习"按钮：
- 获取 fetchWeeklyReviewItems(currentWeekStart)
- 进入清单复习 UI：
   - 标题列表 + checkbox
   - 点击题目可展开题面与解答
   - 勾选后调用 toggleWeeklyReviewItemDone
   - 支持多选后 carryWeeklyReviewItemsToNextWeek
   - 全部完成后显示统计（已完成/待延续）

【四、手动录入】

点击"+"按钮打开录入弹窗：
- 与 Notes 的"收录为错题"弹窗复用组件
- source 标记为 "manual"
- 无 AI 会话关联

【五、路由与导航】

- App.tsx 新增 /error-book 路由
- Sidebar.tsx 新增"错题本"入口（位于"专注成就"下方）
- 移动端通过 Dashboard 卡片跳转，不新增底部栏

【六、配色规范】

- 严格遵循 EVA 主题 token
- 卡片：glass-card + border-[#88B5D3]/30
- 学科色标：数学=#FF9900, 408=#88B5D3, 英语=#6F9FBE, 政治=#4F708F, 其他=#2a3b52
- Markdown/LaTeX 渲染使用 ReactMarkdown + remarkGfm + remarkMath + rehypeKatex + rehypeHighlight

运行 npm run build 汇报结果。
```

### Prompt 10：Blog 留痕 LaTeX 渲染增强

```text
请修改 src/pages/Blog.tsx 和 src/pages/BlogPost.tsx，增强 Markdown 渲染能力：

1. Blog.tsx 的文章摘要/预览区域：
   - 将现有手写 markdownToHtml 函数替换为 ReactMarkdown 组件（参考 Notes 已有实现）
   - 引入 remarkGfm / remarkMath / rehypeKatex / rehypeHighlight
   - 确保错题留痕中的 LaTeX 公式正确渲染
   - import "katex/dist/katex.min.css"

2. BlogPost.tsx（详情页）：
   - 同样替换为 ReactMarkdown 渲染
   - 引入相同插件集
   - 确保全屏查看错题留痕时公式、代码高亮正常

3. 样式适配：
   - prose 样式类与 Notes AI 气泡保持一致
   - 深色模式下 LaTeX 公式可读性达标

4. 向后兼容：
   - 不破坏现有非 LaTeX 留痕的渲染效果
   - 保留 video timestamp 链接替换能力

运行 npm run build 汇报结果。
```

### Prompt 11：Dashboard 错题速览卡片

```text
请修改 src/pages/Dashboard.tsx，新增"错题速览"卡片：

1. 位置：在番茄卡片区域下方（或 NERV 监控区域之后）

2. 卡片内容：
   - 标题：📝 错题速览
   - 数据来源：fetchWrongQuestionStats()
   - 展示字段：
     - 总计 X 道 · 未掌握 Y 道
       - 本周待复习: N 道（N > 0 时橙色强调）
       - 本周已完成: D 道
     - 本周新增: M 道
   - 行动按钮："开始复习"（Link to /error-book?mode=review）
               "查看错题本"（Link to /error-book）

3. 样式：
   - glass-card 风格，border-[#88B5D3]/30
   - 待复习数 > 0 时，数字用 #FF9900 强调
   - 按钮使用 EVA 蓝渐变

4. 数据加载：
   - 在 Dashboard useEffect 中调用 fetchWrongQuestionStats
   - 加载失败静默降级（不展示卡片或显示"--"）

运行 npm run build 汇报结果。
```

### Prompt 12：WeeklyReview 错题清单与真实周改造

```text
请修改 src/pages/WeeklyReview.tsx：

1. 在"各科目精力分布"section 上方新增"本周待复习错题清单"卡片：
   - 数据来源：fetchWeeklyReviewItems(weekStart)
   - 展示：
     - 错题标题列表（checkbox）
     - 勾选即完成（done）
     - 支持多选后“延续到下周”
   - 样式：glass-card + EVA 主题

2. 周边界改造为真实自然周：
   - 以周一为 week_start、周日为 week_end
   - 不再使用“end_date 往前 7 天”窗口口径

3. 增强 AI 周诊断 Prompt：
   - 在 systemPrompt 中注入错题数据维度：
     "本周错题清单：待复习 {pending} 道，已完成 {done} 道；可延续到下周 {carryable} 道。"
   - 如果 total_count == 0 则不注入该段

运行 npm run build 汇报结果。
```

### Prompt 13：文档更新与收尾

```text
请更新以下文档：

1. docs/PRD_Roadmap.md：
   - 新增 "3.x 错题快录与智能复习（Error Book）" 模块描述
   - 包含：AI 图片识题、一键收录、真实周清单勾选与延续、留痕联动
   - 更新 Dashboard/WeeklyReview 模块描述，标注已集成错题速览

2. docs/数据存储白皮书.md：
   - SQLite 表清单新增 wrong_questions
   - ai_messages 表新增 image_path 列说明
   - 文件系统新增 ErrorImages/ 目录及用途
   - localStorage 新增键（如有）说明
   - Settings 新增 aiVisionModel / aiVisionMode 字段说明

3. docs/CHANGELOG_2026-02-25.md：
   - 新增 v1.4.0-dev 开发版条目
   - 列出错题系统全部改动点

执行 npm run build 验证前端无报错。
```

---

## 13. 建议实施顺序

```
阶段 1：数据基座（Prompt 1-3）
  → 数据库表 + Tauri Commands + Axum 路由
  → cargo check 通过即可推进

阶段 2：AI 多模态能力（Prompt 4-6）
  → apiBridge 扩展 + aiClient 多模态 + Settings 配置
  → npm run build 通过即可推进

阶段 3：核心交互（Prompt 7-8）
  → Notes 图片上传 + 一键收录
  → 这是用户感知最强的改动

阶段 4：独立页面（Prompt 9-10）
  → ErrorBook 错题本 + Blog LaTeX 增强
  → 功能闭环

阶段 5：集成与收尾（Prompt 11-13）
  → Dashboard / WeeklyReview 联动 + 文档
  → 发布 v1.4.0
```

---

## 14. 版本标记建议

- 里程碑版本：`v1.4.0-error-book`
- CHANGELOG 关键词：
  - `feat(ai): vision model support for image-based question recognition`
   - `feat(error-book): wrong question capture and weekly checklist review`
  - `feat(blog): LaTeX rendering in daily logs`
  - `feat(dashboard): error question summary card`
  - `feat(review): weekly review error question analytics integration`
