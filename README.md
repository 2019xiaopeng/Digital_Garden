#  QCB's Digital Garden - EVA Rei Edition

> **"这是我的心之壁，也是我的灵魂温室。"**
>
> 这是一个基于 **React 19 + Vite + Tauri v2** 构建的超高效率个人数字花园，深度集成 **EVA Ayanami Rei (绫波丽)** 主题美学，采用极简磨砂玻璃 (Glassmorphism) 交互设计。

---

##  核心愿景：零摩擦效率 (Zero-Friction UX)
为了追求极致的生产力，本项目摒弃了所有冗余的点击，全面转向 **快捷键驱动 + 一键式流转** 的操作模式。

- **磨砂玻璃质感**: 3% 极轻微背景模糊，消除视觉厚重感。
- **快捷键矩阵**:
  - Ctrl + N: 快速创建任务/笔记/博文。
  - Ctrl + Shift + L: 在博客页一键开启每日追踪模式。
  - Ctrl + Enter: 提交/确认。
- **一键生产力**:
  - **延期 +1d**: 任务系统深度集成快速延期逻辑。
  - **每日复盘**: 自动聚合当日数据生成追踪博文。

##  技术规格
- **前端**: React 19 (Beta/Latest), TypeScript, Tailwind CSS 4.0.
- **容器**: Tauri v2 (跨平台桌面支持: Windows/macOS/Linux).
- **AI 智库**: 集成 **DeepSeek / Kimi / MiniMax** 多模型切换，支持会话历史持久化。
- **可视化**: Recharts (统计), 自定义 Gantt 引擎 (甘特图), Tailwind Animations.

##  功能模块
1. ** 总览 (Dashboard)**: 状态看板，磨砂卡片布局，实时统计与时钟。
2. ** 任务 (Tasks)**: 
   - 三位一体视图：甘特图 (Gantt) + 日历 (Calendar) + 待办 (To-Do)。
   - 深度适配暗黑模式，自定义滚动条。
3. ** 知识库 (Notes)**: 
   - 树形知识点结构。
   - 分屏 AI 助手：实时模型切换，心之壁 (Mental Walls) 级别的对话隔离。
4. ** 博客 (Blog)**: 极简 Markdown 编辑器。
5. ** 练功房 (Quiz)**: 模拟记忆卡片，基于数据清空后的干净闭环设计。

##  快速开始

### 桌面端开发 (Tauri)
`powershell
# 安装 Rust 及相关依赖
npm install
npm run tauri:dev
`

### 网页端开发
`powershell
npm run dev
`

### 构建与发布
`powershell
npm run tauri:build # 构建桌面安装包
npm run build       # 构建纯网页版
`

##  视觉风格指南 (Theming)
- **Primary**: gb(165, 180, 252) - 淡淡的初号机/绫波蓝色。
- **Glass**: .glass-card - 结合 ackdrop-blur-md 与半透明边框。
- **Icons**: Lucide React - 确保所有交互图标语义清晰。

---

*人是不可能完全互相理解的，但我们可以通过数字花园记录脆弱的联结。*
