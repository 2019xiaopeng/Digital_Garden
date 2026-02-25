# 更新日志（2026-02-25）

## 概览
本次更新完成 Phase 1（桩代码补全）下半场的核心内容，重点是：
- 知识库（Notes）从本地缓存树升级为“可从磁盘真实重建”的文件树
- 知识库搜索从纯 UI 升级为可用的递归过滤
- 设置中心 Sync / Exam / Privacy 三个占位页替换为真实骨架 UI

---

## 新增与改进

### 1) Notes：物理目录同步（Rust + Frontend）
- 新增 Tauri Command：`scan_notes_directory`
- Rust 端递归扫描 `Documents/EVA_Knowledge_Base/Notes`
- 返回树节点结构：`name`、`path`、`is_dir`、`children`
- 前端在 `Notes.tsx` 挂载时调用扫描命令，使用磁盘结果覆盖旧缓存树
- 新增「刷新磁盘目录」按钮，可手动触发重新扫描

### 2) Notes：搜索过滤逻辑落地
- 搜索框新增受控状态：`searchKeyword`
- 新增递归过滤算法：
  - 命中文件/文件夹会被保留
  - 命中节点的父级文件夹会自动展开
- 搜索结果为空时展示「未找到匹配结果」提示

### 3) Settings：三个占位标签页替换为真实骨架
- **同步与备份（Sync）**
  - 启用局域网共享开关
  - 内网 IP:端口占位卡片
  - Tailscale 状态占位卡片
- **考研目标（Exam）**
  - 目标院校、总分目标、考试日期输入框
  - 408 / 数一 / 英一 / 政治目标分数卡片
- **隐私与安全（Privacy）**
  - 存储用量面板（占位数值）
  - 分类清理按钮（草稿、树缓存、文件缓存、任务回退）
  - 红色“一键清空”按钮

---

## 关联实现文件
- `src-tauri/src/lib.rs`
  - 新增 `NotesFsNode` 结构
  - 新增 `scan_notes_directory_sync`
  - 新增 `scan_notes_directory` 命令并注册到 `invoke_handler`
- `src/pages/Notes.tsx`
  - 新增磁盘同步加载逻辑（挂载 + 刷新）
  - 搜索状态与递归过滤逻辑
  - 工具栏新增刷新按钮
- `src/pages/Settings.tsx`
  - 新增 `renderSync` / `renderExam` / `renderPrivacy`
  - 用真实骨架替换 `sync/exam/privacy` 三个 placeholder

---

## 已知边界
- Settings 三个新标签页当前为“骨架层”，未接真实后端逻辑（符合当前阶段目标）
- Notes 搜索为“树名匹配”，全文检索（文件内容级）尚未接入

---

## 下一步建议（用于下次 Release）
1. 将 Sync 页接入真实 LAN 服务状态与地址检测
2. 将 Privacy 页接入真实存储统计与清理命令
3. 将 Notes 搜索扩展为文件内容级全文检索

---

## AI 赋能阶段（SiliconFlow）补充记录

### 4) Settings：AI 配置已激活
- API Key 输入与模型选择已可持久化保存
- 默认模型改为 `deepseek-ai/DeepSeek-V3.2`
- 保留密码掩码与 👁️ 显示/隐藏

### 5) 新增统一 AI 客户端（流式）
- 新增 `src/utils/aiClient.ts`
- 提供 `chatCompletion`（AsyncGenerator）与 `chatCompletionToText`
- 兼容 OpenAI 协议，Endpoint：`https://api.siliconflow.cn/v1/chat/completions`
- 支持 SSE 流式解析与增量输出

### 6) Notes：最小连通测试已落地
- 知识库 AI 面板已接入 `chatCompletion` 流式函数
- 输入「你好」可看到流式打字机效果并得到 DeepSeek 回复
- 模型下拉切换已与本地缓存联动

### 7) SiliconFlow 模型名兼容修复
- 修复历史缓存模型名 `deepseek-v3` 导致的 400 报错（Model does not exist）
- `aiClient` 新增模型别名归一化：旧值会自动映射到 `deepseek-ai/DeepSeek-V3.2`
- 启动请求时会自愈写回 `eva.ai.model`，避免后续重复触发同类错误

### 8) Notes：AI 对话渲染升级（LaTeX + 代码高亮）
- AI 对话区宽度扩展，聊天内容区可视空间更大
- 新增 Markdown 渲染增强：
  - 数学公式支持：`remark-math` + `rehype-katex`
  - 代码高亮支持：`rehype-highlight` + `highlight.js`
- AI 回复从纯文本展示升级为 Markdown 流式展示，便于阅读公式与代码片段

### 9) Phase 2 启动：Quiz 题库数据库基座
- SQLite 新增 `questions` 表（题目主体、选项、答案、解析、来源、难度、复习统计字段）
- 新增索引：
  - `idx_questions_subject`
  - `idx_questions_next_review`
- 新增 Tauri 命令：
  - `create_question`
  - `get_questions`
- 已注册到 `invoke_handler`，为 Quiz 页面重构与 AI 生成入库打通后端基础
