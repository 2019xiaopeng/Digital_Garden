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
- **前端**: React 19, TypeScript, Tailwind CSS 4.0.
- **容器**: Tauri v2 (跨平台桌面: Windows/macOS/Linux).
- **数据持久化**: SQLite (通过 sqlx + Tauri IPC)，存储于 `~/Documents/EVA_Knowledge_Base/Database/eva.db`，开发模式自动降级至 localStorage。
- **AI 集成**: DeepSeek Chat API，Tauri Rust 作为 CORS 代理，支持 NLP 任务解析与 AI 复盘。
- **可视化**: 自定义 Gantt 引擎, GitHub-style 30天热力图, SVG 番茄钟环.

##  功能模块
1. ** 总览 (Dashboard)**: NERV 数据大盘（连胜/今日/本周/完成率），30天专注热力图，全屏番茄钟沉浸模式，签到签退系统。
2. ** 任务 (Tasks)**: 
   - 四视图：待办 (To-Do) + 日历 + 时间轴 + 甘特图。
   - **MD 计划导入**: 从 `.md` 文件批量解析任务（支持 `@日期` `#标签` `#priority` 语法）。
   - **闪电灵感 Inbox**: AI 自然语言解析 → 结构化任务自动创建。
   - 一键顺延 +1d, 浮动番茄钟。
3. ** 每日留痕 (Blog)**: 
   - Markdown 编辑器 + 心情/同步率追踪。
   - **一键 AI 复盘**: 读取今日完成任务 → DeepSeek 生成绫波丽语调复盘日记。
4. ** 知识库 (Notes)**: 树形知识点结构 + AI 对话。
5. ** 练功房 (Quiz)**: 记忆卡片练习。
6. ** 资源 (Resources)**: 学习资料管理。

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
- **Primary**: 
gb(165, 180, 252) - 淡淡的初号机/绫波蓝色。
- **Glass**: .glass-card - 结合 ackdrop-blur-md 与半透明边框。
- **Icons**: Lucide React - 确保所有交互图标语义清晰。

---

*人是不可能完全互相理解的，但我们可以通过数字花园记录脆弱的联结。*
