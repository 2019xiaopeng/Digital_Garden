# QCB's Digital Garden - EVA Rei Edition

一个面向考研场景的本地优先学习操作系统（React + Tauri + SQLite），聚焦“少操作、强闭环”：任务执行、错题快录、周复盘、知识沉淀一体化。

## 当前核心能力（v1.4.0）
- Dashboard：学习总览、专注统计、错题速览与复习入口。
- Tasks：任务计划、状态流转、专注计时（番茄钟/倒计时）。
- Notes：知识库树管理 + AI 对话（支持图片题上传、识题与解答）。
- ErrorBook：错题收录、详情查看、归档/删除、掌握度与筛选。
- WeeklyReview：本周待复习清单、完成勾选、延续到下周、AI 周诊断。
- Blog：每日留痕（Markdown + LaTeX），支持错题同步生成留痕。
- Resources / Quiz：学习资料管理与题目生成、复习调度。

## 技术栈
- 前端：React 19 + TypeScript + Vite + Tailwind CSS v4。
- 桌面容器：Tauri v2（Rust + Axum 本地服务）。
- 数据：SQLite（主事实源）+ localStorage（设置与 UI 缓存）。

## 本地数据目录
默认初始化在：`~/Documents/EVA_Knowledge_Base`

- `Database`：`eva.db`（任务、错题、周清单、AI 会话等）
- `Notes`：知识库文件
- `Resources`：资料文件
- `Logs`：日志
- `ErrorImages`：AI 对话题图与错题题图

## 开发启动

### Web 模式（跨端阅读/轻操作）
```bash
npm install
npm run dev
```

### Tauri 桌面模式（完整能力）
```bash
npm install
npm run tauri:dev
```

## 构建
```bash
npm run build
npm run tauri:build
```

## 运行说明
- 桌面模式为完整功能形态；Web 模式以阅读与轻操作为主。
- 错题与周复盘采用真实自然周口径（周一至周日）。
- Markdown/LaTeX 在 Notes、Blog、ErrorBook、WeeklyReview 保持统一渲染链路。
