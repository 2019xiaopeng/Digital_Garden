# QCB's Digital Garden - EVA Rei Edition

一个基于 React + Tauri 的个人学习与任务管理桌面应用，主题风格为 EVA Rei 的冷静机能风。

## 功能概览
- 总览 Dashboard：今日状态、专注统计、关键指标
- 任务管理 Tasks：计划安排、状态流转、批量导入
- 每日留痕 Blog：Markdown 记录、复盘与追踪
- 知识库 Notes：文档树、文件预览、AI 对话
- 练功房 Quiz：练习与记忆巩固
- 资源管理 Resources：学习材料归档

## 技术栈
- 前端：React 19 + TypeScript + Vite + Tailwind CSS v4
- 桌面容器：Tauri v2 (Rust)
- 数据：SQLite（Tauri 模式）/ localStorage（Web 退化模式）

## 本地数据目录
应用在首次启动时会自动初始化以下目录：

- `~/Documents/EVA_Knowledge_Base/Database`
- `~/Documents/EVA_Knowledge_Base/Logs`
- `~/Documents/EVA_Knowledge_Base/Notes`
- `~/Documents/EVA_Knowledge_Base/Resources`

## 开发启动

### Web 模式
```bash
npm install
npm run dev
```

### Tauri 桌面模式
```bash
npm install
npm run tauri:dev
```

## 构建
```bash
npm run build
npm run tauri:build
```

## 说明
- 知识库支持 Markdown 文档预览与文本文件预览
- PDF 在桌面模式下支持内嵌预览
- 若出现上传失败，请查看开发者控制台中的错误日志
