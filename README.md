# QCB's Digital Garden - EVA Rei Edition

一个面向考研场景的本地优先学习操作系统（React + Tauri + SQLite），聚焦“少操作、强闭环”：任务执行、错题闭环、周复盘、知识沉淀一体化。

## 当前核心能力（v1.4.1）
- Dashboard：学习总览、番茄钟、自习室签到、错题速览与复习入口；专注统计全站统一口径（focus_runs 有效专注）。
- Tasks：任务计划、状态流转、专注计时（番茄钟/倒计时）、日历与甘特视图。
- Notes：知识库树管理 + AI 对话（图片题上传、识题与解答）。
- ErrorBook：错题收录、周复习清单（自动顺延、计数可回退）、归档/删除（均有确认框）。
- WeeklyReview：本周待复习清单（周一~周日口径）、完成勾选、AI 周诊断。
- Blog：每日留痕（Markdown + LaTeX），支持错题同步生成留痕。
- Resources：学习资料管理。
- Settings：本地工作区、一键备份、局域网共享、自启动等。

## 技术栈
- 前端：React 19 + TypeScript + Vite + Tailwind CSS v4。
- 桌面容器：Tauri v2（Rust + Axum 本地服务）。
- 数据：SQLite（主事实源）+ localStorage（设置与 UI 缓存）。

## 本地数据目录
固定在 `~/Documents/EVA_Knowledge_Base`（不支持更换根目录；迁移请用设置页「一键备份」导出）：

- `Database`：`eva.db`（任务、错题、周清单、专注记录、AI 会话等）
- `Notes`：知识库文件
- `Resources`：资料文件
- `Logs`：每日留痕
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

## 构建与检查
```bash
npm run lint    # tsc 类型检查
npm run build   # vite 前端构建
npm run tauri:build
```

## 文档
- 功能规划（当前）：[docs/FEATURE_PLAN_2026-10-27.md](docs/FEATURE_PLAN_2026-10-27.md)
- 质量审计报告：[docs/AUDIT_2026-10-26.md](docs/AUDIT_2026-10-26.md)
- 架构与存储：[docs/Local_App_Architecture.md](docs/Local_App_Architecture.md)、[docs/数据存储白皮书.md](docs/数据存储白皮书.md)
- 历史文档（PRD、旧版说明等）已归档至 `docs/archive/`

## 运行说明
- 桌面模式为完整功能形态；Web 模式以阅读与轻操作为主。
- 错题与周复盘采用真实自然周口径（周一至周日）。
- Markdown/LaTeX 在 Notes、Blog、ErrorBook、WeeklyReview 保持统一渲染链路。
