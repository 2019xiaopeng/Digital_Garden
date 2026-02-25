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
