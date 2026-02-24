/**
 * Data Service Layer - Bridges Tauri backend with React frontend.
 * Provides unified CRUD operations for Tasks, DailyLogs, FocusSessions.
 * Falls back to localStorage when Tauri is not available (web-only mode).
 */

// ═══════════════════════════════════════════════════════════
// Type Definitions (mirror Rust structs)
// ═══════════════════════════════════════════════════════════

export interface Task {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in-progress" | "done";
  priority: "low" | "medium" | "high";
  date: string;        // YYYY-MM-DD
  start_time: string;  // HH:mm (snake_case for Rust compat)
  duration: number;    // hours
  tags: string;        // comma-separated
  repeat_type: string;
  timer_type: string;
  timer_duration: number;
  created_at: string;
  updated_at: string;
}

export interface DailyLog {
  id: string;
  date: string;
  title: string;
  content: string;
  mood: "happy" | "sad" | "neutral" | "focused";
  sync_rate: number;
  tags: string;
  auto_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface FocusSession {
  id: string;
  date: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  total_focus_seconds: number;
  active_task_id: string | null;
}

export interface AiProxyRequest {
  api_url: string;
  api_key: string;
  model: string;
  system_prompt: string;
  user_message: string;
  temperature?: number;
  max_tokens?: number;
}

export interface AiProxyResponse {
  content: string;
  model: string;
  usage?: Record<string, unknown>;
}

export interface ImportedTask {
  title: string;
  date: string;
  priority: string;
  tags: string[];
  status: string;
}

export interface ImportReport {
  total: number;
  created: number;
  skipped: number;
  tasks: ImportedTask[];
}

// ── Legacy Frontend Task type (for backward compat) ──
export interface LegacyTask {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in-progress" | "done";
  priority: "low" | "medium" | "high";
  date: string;
  startTime: string;
  duration: number;
  tags: string[];
  repeat?: "none" | "daily" | "weekly";
  repeatDays?: number[];
  timerType?: "none" | "pomodoro" | "countdown";
  timerDuration?: number;
}

// ═══════════════════════════════════════════════════════════
// Tauri Detection & Invoke
// ═══════════════════════════════════════════════════════════

let _invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;

async function getInvoke() {
  if (_invoke) return _invoke;
  try {
    const mod = await import("@tauri-apps/api/core");
    _invoke = mod.invoke;
    return _invoke;
  } catch {
    return null;
  }
}

export function isTauriAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

// ═══════════════════════════════════════════════════════════
// Conversion Helpers
// ═══════════════════════════════════════════════════════════

export function legacyToDbTask(t: LegacyTask): Task {
  const now = new Date().toISOString();
  return {
    id: t.id,
    title: t.title,
    description: t.description || "",
    status: t.status,
    priority: t.priority,
    date: t.date,
    start_time: t.startTime || "09:00",
    duration: t.duration || 1,
    tags: (t.tags || []).join(","),
    repeat_type: t.repeat || "none",
    timer_type: t.timerType || "none",
    timer_duration: t.timerDuration || 25,
    created_at: now,
    updated_at: now,
  };
}

export function dbToLegacyTask(t: Task): LegacyTask {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status as LegacyTask["status"],
    priority: t.priority as LegacyTask["priority"],
    date: t.date,
    startTime: t.start_time,
    duration: t.duration,
    tags: t.tags ? t.tags.split(",").filter(Boolean) : [],
    repeat: (t.repeat_type || "none") as LegacyTask["repeat"],
    timerType: (t.timer_type || "none") as LegacyTask["timerType"],
    timerDuration: t.timer_duration || 25,
  };
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ═══════════════════════════════════════════════════════════
// localStorage Fallback Keys
// ═══════════════════════════════════════════════════════════

const LS_TASKS = "qcb.tasks.v1";
const LS_ATTENDANCE = "qcb.attendance.v1";
const LS_POSTS = "qcb.posts.v1";

// ═══════════════════════════════════════════════════════════
// Task Service
// ═══════════════════════════════════════════════════════════

export const TaskService = {
  async getAll(): Promise<LegacyTask[]> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        const tasks = (await invoke("get_tasks")) as Task[];
        return tasks.map(dbToLegacyTask);
      } catch (e) {
        console.warn("Tauri get_tasks failed, falling back to localStorage:", e);
      }
    }
    // Fallback
    try {
      const raw = localStorage.getItem(LS_TASKS);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  async getByDate(date: string): Promise<LegacyTask[]> {
    const all = await this.getAll();
    return all.filter(t => t.date === date);
  },

  async create(task: LegacyTask): Promise<LegacyTask> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        const dbTask = legacyToDbTask(task);
        await invoke("create_task", { task: dbTask });
        return task;
      } catch (e) {
        console.warn("Tauri create_task failed:", e);
      }
    }
    // Fallback
    const all = await this.getAll();
    all.push(task);
    localStorage.setItem(LS_TASKS, JSON.stringify(all));
    return task;
  },

  async update(task: LegacyTask): Promise<LegacyTask> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        const dbTask = legacyToDbTask(task);
        dbTask.updated_at = nowIso();
        await invoke("update_task", { task: dbTask });
        return task;
      } catch (e) {
        console.warn("Tauri update_task failed:", e);
      }
    }
    // Fallback
    const all = await this.getAll();
    const idx = all.findIndex(t => t.id === task.id);
    if (idx >= 0) all[idx] = task;
    localStorage.setItem(LS_TASKS, JSON.stringify(all));
    return task;
  },

  async delete(id: string): Promise<void> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        await invoke("delete_task", { id });
        return;
      } catch (e) {
        console.warn("Tauri delete_task failed:", e);
      }
    }
    // Fallback
    const all = await this.getAll();
    localStorage.setItem(LS_TASKS, JSON.stringify(all.filter(t => t.id !== id)));
  },

  async batchCreate(tasks: LegacyTask[]): Promise<number> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        const dbTasks = tasks.map(legacyToDbTask);
        return (await invoke("batch_create_tasks", { tasks: dbTasks })) as number;
      } catch (e) {
        console.warn("Tauri batch_create_tasks failed:", e);
      }
    }
    // Fallback
    const all = await this.getAll();
    const existingIds = new Set(all.map(t => t.id));
    let count = 0;
    for (const task of tasks) {
      if (!existingIds.has(task.id)) {
        all.push(task);
        count++;
      }
    }
    localStorage.setItem(LS_TASKS, JSON.stringify(all));
    return count;
  },

  /** Sync all localStorage tasks to DB (migration helper) */
  async migrateFromLocalStorage(): Promise<number> {
    try {
      const raw = localStorage.getItem(LS_TASKS);
      if (!raw) return 0;
      const tasks: LegacyTask[] = JSON.parse(raw);
      if (!tasks.length) return 0;
      return await this.batchCreate(tasks);
    } catch { return 0; }
  }
};

// ═══════════════════════════════════════════════════════════
// Daily Log Service
// ═══════════════════════════════════════════════════════════

export interface LegacyPost {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  category: string;
  tags: string[];
  mood: string;
  syncRate: number;
}

export const DailyLogService = {
  async getAll(): Promise<LegacyPost[]> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        const logs = (await invoke("get_daily_logs")) as DailyLog[];
        return logs.map(l => ({
          id: l.id,
          title: l.title,
          excerpt: l.content,
          date: l.date,
          readTime: "1 min read",
          category: l.auto_generated ? "Auto" : "Manual",
          tags: l.tags ? l.tags.split(",").filter(Boolean) : [],
          mood: l.mood,
          syncRate: l.sync_rate,
        }));
      } catch (e) {
        console.warn("Tauri get_daily_logs failed:", e);
      }
    }
    try {
      const raw = localStorage.getItem(LS_POSTS);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  async create(post: LegacyPost): Promise<LegacyPost> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        const log: DailyLog = {
          id: post.id,
          date: post.date,
          title: post.title,
          content: post.excerpt,
          mood: post.mood as DailyLog["mood"],
          sync_rate: post.syncRate,
          tags: post.tags.join(","),
          auto_generated: post.category === "Auto",
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        await invoke("create_daily_log", { log });
        return post;
      } catch (e) {
        console.warn("Tauri create_daily_log failed:", e);
      }
    }
    const all = await this.getAll();
    all.unshift(post);
    localStorage.setItem(LS_POSTS, JSON.stringify(all));
    return post;
  },

  async update(post: LegacyPost): Promise<LegacyPost> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        const log: DailyLog = {
          id: post.id,
          date: post.date,
          title: post.title,
          content: post.excerpt,
          mood: post.mood as DailyLog["mood"],
          sync_rate: post.syncRate,
          tags: post.tags.join(","),
          auto_generated: false,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        await invoke("update_daily_log", { log });
        return post;
      } catch (e) {
        console.warn("Tauri update_daily_log failed:", e);
      }
    }
    const all = await this.getAll();
    const idx = all.findIndex(p => p.id === post.id);
    if (idx >= 0) all[idx] = post;
    localStorage.setItem(LS_POSTS, JSON.stringify(all));
    return post;
  },

  /** Auto-generate today's review entry from completed tasks */
  async generateDailyReview(completedTasks: LegacyTask[], focusHours: number): Promise<LegacyPost> {
    const today = todayStr();
    const taskSummary = completedTasks.map(t => `- ✅ ${t.title}`).join("\n");
    const content = `## 今日复盘 ${today}\n\n**专注时长**: ${focusHours.toFixed(1)}h\n**完成任务**: ${completedTasks.length} 项\n\n${taskSummary}\n\n---\n*系统自动生成*`;
    
    const post: LegacyPost = {
      id: `auto-${Date.now()}`,
      title: `留痕 ${today}`,
      excerpt: content,
      date: today,
      readTime: "1 min read",
      category: "Auto",
      tags: ["auto-review"],
      mood: "focused",
      syncRate: Math.min(100, Math.round((completedTasks.length / Math.max(1, completedTasks.length + 2)) * 100)),
    };
    
    return await this.create(post);
  }
};

// ═══════════════════════════════════════════════════════════
// Focus Session Service
// ═══════════════════════════════════════════════════════════

export const FocusService = {
  async getAll(): Promise<Record<string, FocusSession>> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        const sessions = (await invoke("get_focus_sessions")) as FocusSession[];
        const map: Record<string, FocusSession> = {};
        for (const s of sessions) { map[s.date] = s; }
        return map;
      } catch (e) {
        console.warn("Tauri get_focus_sessions failed:", e);
      }
    }
    try {
      const raw = localStorage.getItem(LS_ATTENDANCE);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  },

  async upsert(session: FocusSession): Promise<void> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        await invoke("upsert_focus_session", { session });
        return;
      } catch (e) {
        console.warn("Tauri upsert_focus_session failed:", e);
      }
    }
    const all = await this.getAll();
    all[session.date] = session;
    localStorage.setItem(LS_ATTENDANCE, JSON.stringify(all));
  }
};

// ═══════════════════════════════════════════════════════════
// Markdown Import Service
// ═══════════════════════════════════════════════════════════

export const MarkdownImportService = {
  async parseFile(filePath: string): Promise<ImportReport> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        const content = (await invoke("read_file_content", { path: filePath })) as string;
        return (await invoke("parse_markdown_plan", { content })) as ImportReport;
      } catch (e) {
        console.warn("Tauri parse failed:", e);
      }
    }
    // Web fallback - parse in JS
    return { total: 0, created: 0, skipped: 0, tasks: [] };
  },

  async parseContent(content: string): Promise<ImportReport> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        return (await invoke("parse_markdown_plan", { content })) as ImportReport;
      } catch (e) {
        console.warn("Tauri parse failed:", e);
      }
    }
    // Local JS parsing fallback
    return this.parseMarkdownLocally(content);
  },

  parseMarkdownLocally(content: string): ImportReport {
    const tasks: ImportedTask[] = [];
    let currentDate = "";

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      
      // Date headers
      const headerMatch = trimmed.match(/^#{1,2}\s+(.+)/);
      if (headerMatch) {
        const dateMatch = headerMatch[1].match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) currentDate = dateMatch[1];
      }

      // Task lines
      const taskMatch = trimmed.match(/^- \[([ xX])\]\s+(.+)/);
      if (taskMatch) {
        const isDone = taskMatch[1] !== " ";
        let rest = taskMatch[2];
        
        let taskDate = currentDate;
        const dateInline = rest.match(/@(\d{4}-\d{2}-\d{2})/);
        if (dateInline) {
          taskDate = dateInline[1];
          rest = rest.replace(/@\d{4}-\d{2}-\d{2}/, "").trim();
        }

        const tags: string[] = [];
        let priority = "medium";
        const titleParts: string[] = [];

        for (const word of rest.split(/\s+/)) {
          if (word.startsWith("#")) {
            const tag = word.slice(1).toLowerCase();
            if (["high", "urgent"].includes(tag)) priority = "high";
            else if (tag === "low") priority = "low";
            else if (tag !== "medium") tags.push(tag);
          } else {
            titleParts.push(word);
          }
        }

        if (titleParts.length) {
          tasks.push({
            title: titleParts.join(" "),
            date: taskDate || todayStr(),
            priority,
            tags,
            status: isDone ? "done" : "todo",
          });
        }
      }
    }

    return { total: tasks.length, created: 0, skipped: 0, tasks };
  },

  /** Convert parsed tasks to LegacyTask format and batch create */
  async importTasks(importedTasks: ImportedTask[]): Promise<number> {
    const legacyTasks: LegacyTask[] = importedTasks.map(t => ({
      id: genId(),
      title: t.title,
      description: "",
      status: t.status as LegacyTask["status"],
      priority: t.priority as LegacyTask["priority"],
      date: t.date,
      startTime: "09:00",
      duration: 1,
      tags: t.tags,
      repeat: "none" as const,
      timerType: "none" as const,
      timerDuration: 25,
    }));
    return await TaskService.batchCreate(legacyTasks);
  }
};

// ═══════════════════════════════════════════════════════════
// AI Service
// ═══════════════════════════════════════════════════════════

export const AiService = {
  async callApi(request: AiProxyRequest): Promise<AiProxyResponse> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        return (await invoke("ai_proxy", { request })) as AiProxyResponse;
      } catch (e) {
        throw new Error(`AI API call failed: ${e}`);
      }
    }
    throw new Error("AI features require the Tauri desktop app");
  },

  /** NLP Task Parsing - parse natural language into structured tasks */
  async parseNaturalLanguageTasks(input: string, apiKey: string): Promise<ImportedTask[]> {
    const systemPrompt = `你是一个任务解析助手。用户会输入一段混乱的自然语言日程描述。
请严格返回一个JSON数组，每个元素包含:
- title: 任务标题(简洁)
- date: 日期(YYYY-MM-DD格式，根据"今天"=${todayStr()}推算"明天""后天""下周一"等)
- priority: "high"/"medium"/"low"
- tags: 标签数组(从内容推断学科标签如"math","os","english"等)
- startTime: 建议开始时间(HH:mm格式)
- duration: 预计时长(小时,数字)

只返回JSON数组，不要返回任何其他内容。如果无法解析则返回空数组[]。`;

    const response = await this.callApi({
      api_url: "https://api.deepseek.com/v1/chat/completions",
      api_key: apiKey,
      model: "deepseek-chat",
      system_prompt: systemPrompt,
      user_message: input,
      temperature: 0.3,
      max_tokens: 1024,
    });

    try {
      // Try to extract JSON from response
      let content = response.content.trim();
      // Remove markdown code fences if present
      if (content.startsWith("```")) {
        content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item: Record<string, unknown>) => ({
        title: String(item.title || ""),
        date: String(item.date || todayStr()),
        priority: String(item.priority || "medium"),
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        status: "todo",
      }));
    } catch {
      console.error("Failed to parse AI response as JSON:", response.content);
      return [];
    }
  },

  /** Generate daily review summary */
  async generateReview(completedTasks: LegacyTask[], focusHours: number, apiKey: string): Promise<string> {
    const taskList = completedTasks.map(t => `- ${t.title} (${t.tags.join(",")})`).join("\n");

    const systemPrompt = `你是EVA系统的复盘助手，语调清冷、极简，像绫波丽。
用户今天完成了以下任务和专注时长，请生成一段极简的复盘日记(100-200字)。
要求:
1. 用Markdown格式
2. 包含鼓励但保持克制冷淡的语调
3. 总结关键成就
4. 简短建议明天的方向
不要加标题，直接输出正文内容。`;

    const userMessage = `今日日期: ${todayStr()}
专注时长: ${focusHours.toFixed(1)}小时
完成任务(${completedTasks.length}项):
${taskList || "无完成任务"}`;

    const response = await this.callApi({
      api_url: "https://api.deepseek.com/v1/chat/completions",
      api_key: apiKey,
      model: "deepseek-chat",
      system_prompt: systemPrompt,
      user_message: userMessage,
      temperature: 0.7,
      max_tokens: 512,
    });

    return response.content;
  }
};
