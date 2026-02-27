import type { LegacyTask } from "../lib/dataService";
import { getSettings } from "../lib/settings";
import { convertFileSrc } from "@tauri-apps/api/core";

export type QuizQuestion = {
  id: string;
  subject: string;
  type: string;
  stem: string;
  options: string | null;
  answer: string;
  explanation: string;
  source_files: string;
  difficulty: number;
  created_at: string;
  next_review: string | null;
  review_count: number;
  correct_count: number;
  ease_factor: number;
  interval: number;
};

type DbTaskRow = {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in-progress" | "done";
  priority: "low" | "medium" | "high";
  date: string;
  start_time: string;
  duration: number;
  tags: string;
  repeat_type: string;
  timer_type: string;
  timer_duration: number;
  created_at: string;
  updated_at: string;
};

type FetchQuizQuestionsOptions = {
  mode: "all" | "due";
  subject?: string;
};

export type NotesFsNode = {
  name: string;
  path: string;
  is_dir: boolean;
  children: NotesFsNode[];
};

export type ResourceItem = {
  id: string;
  name: string;
  path: string;
  file_type: string;
  subject: string;
  size_bytes: number;
  created_at: string;
};

export type DashboardStats = {
  tasks: LegacyTask[];
  dueCount: number;
};

export type WeeklyStats = {
  total_focus_minutes: number;
  completion_rate: number;
  subject_distribution: Record<string, number>;
};

export type FocusTemplate = {
  id: string;
  name: string;
  timer_type: "pomodoro" | "countdown";
  duration_minutes: number;
  tags_json: string;
  linked_task_title?: string | null;
  color_token?: string | null;
  is_archived: 0 | 1;
  created_at: string;
  updated_at: string;
};

export type StartFocusRunPayload = {
  source: "dashboard" | "tasks" | "weekly_review" | "mobile";
  template_id?: string | null;
  task_id?: string | null;
  timer_type: "pomodoro" | "countdown";
  planned_minutes: number;
  date?: string | null;
  tags_json?: string | null;
  note?: string | null;
};

export type FinishFocusRunPayload = {
  actual_seconds: number;
  status: "completed" | "aborted";
  ended_at?: string | null;
  tags_json?: string | null;
  note?: string | null;
};

export type FocusRun = {
  id: string;
  source: string;
  template_id?: string | null;
  task_id?: string | null;
  timer_type: "pomodoro" | "countdown";
  planned_minutes: number;
  actual_seconds: number;
  status: "running" | "completed" | "aborted";
  started_at: string;
  ended_at?: string | null;
  date: string;
  tags_json: string;
  note?: string | null;
  created_at: string;
  updated_at: string;
};

export type FocusStatsSummary = {
  total_focus_minutes: number;
  completed_runs: number;
  completion_rate: number;
};

export type FocusStatsSlice = {
  key: string;
  minutes: number;
  percent: number;
  runs: number;
};

export type FocusStatsResult = {
  start_date: string;
  end_date: string;
  dimension: "tag" | "template" | "timer_type";
  summary: FocusStatsSummary;
  slices: FocusStatsSlice[];
};

export type FetchFocusStatsOptions = {
  startDate?: string;
  endDate?: string;
  dimension?: "tag" | "template" | "timer_type";
};

export type WrongQuestion = {
  id: string;
  subject: string;
  tags_json: string;
  question_content: string;
  question_image_path?: string | null;
  ai_solution: string;
  user_note?: string | null;
  source: "ai_chat" | "manual" | string;
  ai_session_id?: string | null;
  ai_message_ids_json?: string | null;
  difficulty: number;
  mastery_level: number;
  review_count: number;
  next_review_date?: string | null;
  last_review_date?: string | null;
  ease_factor: number;
  interval_days: number;
  is_archived: 0 | 1 | number;
  created_at: string;
  updated_at: string;
};

export type WrongQuestionFilter = {
  subject?: string;
  mastery_level?: number;
  search_keyword?: string;
  is_archived?: number;
};

export type WeeklyReviewItem = {
  id: string;
  week_start: string;
  week_end: string;
  wrong_question_id: string;
  title_snapshot: string;
  status: "pending" | "done" | string;
  carried_from_week?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type SubjectStat = {
  subject: string;
  count: number;
  unmastered: number;
};

export type WrongQuestionStats = {
  total_count: number;
  unmastered_count: number;
  weekly_pending_count: number;
  weekly_done_count: number;
  this_week_new: number;
  by_subject: SubjectStat[];
};

export const SYNC_WRONG_QUESTIONS = "SYNC_WRONG_QUESTIONS";
export const SYNC_WEEKLY_REVIEW_ITEMS = "SYNC_WEEKLY_REVIEW_ITEMS";

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown; __TAURI_IPC__?: unknown };
  if (win.__TAURI__ || win.__TAURI_INTERNALS__ || win.__TAURI_IPC__) return true;
  const protocol = window.location.protocol.toLowerCase();
  const host = window.location.hostname.toLowerCase();
  return protocol === "tauri:" || host.endsWith(".localhost") || host === "tauri.localhost";
}

async function getInvoke() {
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke;
}

export async function invokeDesktop<T = unknown>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error("局域网模式下仅支持跨端阅读，请在桌面端进行文件管理");
  }
  const invoke = await getInvoke();
  return await invoke<T>(command, args);
}

function getLanBaseUrl(): string {
  const host = window.location.hostname || "127.0.0.1";
  return `http://${host}:9527`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function dbToLegacyTask(t: DbTaskRow): LegacyTask {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    date: t.date,
    startTime: t.start_time,
    duration: t.duration,
    tags: t.tags ? t.tags.split(",").filter(Boolean) : [],
    repeat: (t.repeat_type || "none") as LegacyTask["repeat"],
    timerType: (t.timer_type || "none") as LegacyTask["timerType"],
    timerDuration: t.timer_duration || 25,
  };
}

function legacyToDbTask(t: LegacyTask): DbTaskRow {
  const now = nowIso();
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

function hasCompleteTaskFields(task: Partial<LegacyTask>): task is LegacyTask {
  return Boolean(
    task.id &&
      task.title &&
      task.status &&
      task.priority &&
      task.date &&
      task.startTime &&
      typeof task.duration === "number" &&
      Array.isArray(task.tags)
  );
}

async function normalizeTaskUpdate(id: string, updates: Partial<LegacyTask>): Promise<LegacyTask> {
  if (hasCompleteTaskFields(updates)) {
    return { ...updates, id };
  }

  const allTasks = await fetchTasks();
  const existing = allTasks.find((item) => item.id === id);
  if (!existing) {
    throw new Error("未找到要更新的任务记录");
  }

  return {
    ...existing,
    ...updates,
    id,
  };
}

export async function fetchTasks(date?: string): Promise<LegacyTask[]> {
  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    const rows = (date
      ? await invoke<DbTaskRow[]>("get_tasks_by_date", { date })
      : await invoke<DbTaskRow[]>("get_tasks")) || [];
    return rows.map(dbToLegacyTask);
  }

  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  const response = await fetch(`${getLanBaseUrl()}/api/tasks${query}`);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  const rows = (await response.json()) as DbTaskRow[];
  return Array.isArray(rows) ? rows.map(dbToLegacyTask) : [];
}

export async function addTask(task: LegacyTask): Promise<LegacyTask> {
  const payload = legacyToDbTask(task);

  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    const row = await invoke<DbTaskRow>("create_task", { task: payload });
    return dbToLegacyTask(row || payload);
  }

  const response = await fetch(`${getLanBaseUrl()}/api/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  const row = (await response.json()) as DbTaskRow;
  return dbToLegacyTask(row || payload);
}

export async function modifyTask(id: string, updates: Partial<LegacyTask>): Promise<LegacyTask> {
  const merged = await normalizeTaskUpdate(id, updates);
  const payload = legacyToDbTask({ ...merged, id });
  payload.updated_at = nowIso();

  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    const row = await invoke<DbTaskRow>("update_task", { task: payload });
    return dbToLegacyTask(row || payload);
  }

  const response = await fetch(`${getLanBaseUrl()}/api/tasks/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  const row = (await response.json()) as DbTaskRow;
  return dbToLegacyTask(row || payload);
}

export async function removeTask(id: string): Promise<void> {
  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    await invoke("delete_task", { id });
    return;
  }

  const response = await fetch(`${getLanBaseUrl()}/api/tasks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 204) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }
}

export async function fetchQuizQuestions(options: FetchQuizQuestionsOptions): Promise<QuizQuestion[]> {
  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    if (options.mode === "due") {
      return await invoke<QuizQuestion[]>("get_due_questions", {
        subject: options.subject,
      });
    }
    return await invoke<QuizQuestion[]>("get_questions");
  }

  const endpoint = options.mode === "due"
    ? `/api/quiz/due${options.subject ? `?subject=${encodeURIComponent(options.subject)}` : ""}`
    : "/api/quiz/all";

  const response = await fetch(`${getLanBaseUrl()}${endpoint}`);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  const data = (await response.json()) as QuizQuestion[];
  return Array.isArray(data) ? data : [];
}

export async function createQuizQuestion(question: QuizQuestion): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("当前 Web 模式暂不支持录题，请在桌面端执行。");
  }
  const invoke = await getInvoke();
  await invoke("create_question", { question });
}

export async function answerQuizQuestion(id: string, isCorrect: boolean): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("当前 Web 模式暂不支持判题写回，请在桌面端执行。");
  }
  const invoke = await getInvoke();
  await invoke("answer_question", { id, isCorrect });
}

export async function readLocalResourceText(path: string): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error("当前 Web 模式暂不支持读取本地资源文件。");
  }
  const invoke = await getInvoke();
  return await invoke<string>("read_local_file_text", { path });
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const [tasks, dueRows] = await Promise.all([
    fetchTasks(),
    fetchQuizQuestions({ mode: "due" }).catch(() => []),
  ]);

  return {
    tasks,
    dueCount: dueRows.length,
  };
}

export async function fetchNotesTree(): Promise<NotesFsNode[]> {
  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    return await invoke<NotesFsNode[]>("scan_notes_directory");
  }

  const response = await fetch(`${getLanBaseUrl()}/api/notes/tree`);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  const data = (await response.json()) as NotesFsNode[];
  return Array.isArray(data) ? data : [];
}

export async function fetchNoteContent(relativePath: string): Promise<string> {
  if (!relativePath.trim()) {
    throw new Error("文件路径不能为空");
  }

  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    return await invoke<string>("read_file_content", { path: relativePath });
  }

  const response = await fetch(`${getLanBaseUrl()}/api/notes/file?path=${encodeURIComponent(relativePath)}`);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  return await response.text();
}

export async function fetchResources(): Promise<ResourceItem[]> {
  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    return await invoke<ResourceItem[]>("get_resources");
  }

  const response = await fetch(`${getLanBaseUrl()}/api/resources`);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  const data = (await response.json()) as ResourceItem[];
  return Array.isArray(data) ? data : [];
}

export async function fetchWeeklyStats(endDate: string): Promise<WeeklyStats> {
  if (!endDate.trim()) {
    throw new Error("endDate 不能为空");
  }

  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    return await invoke<WeeklyStats>("get_weekly_stats", { endDate });
  }

  const response = await fetch(
    `${getLanBaseUrl()}/api/stats/weekly?end_date=${encodeURIComponent(endDate)}`
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  return (await response.json()) as WeeklyStats;
}

export async function fetchFocusTemplates(includeArchived = false): Promise<FocusTemplate[]> {
  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    const rows = await invoke<FocusTemplate[]>("get_focus_templates", { includeArchived });
    return Array.isArray(rows) ? rows : [];
  }

  const response = await fetch(`${getLanBaseUrl()}/api/focus/templates`);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  const rows = (await response.json()) as FocusTemplate[];
  if (!Array.isArray(rows)) return [];
  if (includeArchived) return rows;
  return rows.filter((item) => item.is_archived === 0);
}

export async function createFocusTemplate(template: FocusTemplate): Promise<FocusTemplate> {
  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    return await invoke<FocusTemplate>("create_focus_template", { template });
  }

  const response = await fetch(`${getLanBaseUrl()}/api/focus/templates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(template),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  return (await response.json()) as FocusTemplate;
}

export async function updateFocusTemplate(id: string, template: FocusTemplate): Promise<FocusTemplate> {
  if (!id.trim()) {
    throw new Error("模板 id 不能为空");
  }

  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    return await invoke<FocusTemplate>("update_focus_template", { id, template });
  }

  const response = await fetch(`${getLanBaseUrl()}/api/focus/templates/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...template, id }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  return (await response.json()) as FocusTemplate;
}

export async function archiveFocusTemplate(id: string): Promise<void> {
  if (!id.trim()) {
    throw new Error("模板 id 不能为空");
  }

  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    await invoke("archive_focus_template", { id });
    return;
  }

  const response = await fetch(`${getLanBaseUrl()}/api/focus/templates/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 204) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }
}

export async function startFocusRun(payload: StartFocusRunPayload): Promise<FocusRun> {
  if (payload.planned_minutes <= 0) {
    throw new Error("planned_minutes 必须大于 0");
  }

  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    return await invoke<FocusRun>("start_focus_run", { payload });
  }

  const response = await fetch(`${getLanBaseUrl()}/api/focus/runs/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  return (await response.json()) as FocusRun;
}

export async function finishFocusRun(runId: string, payload: FinishFocusRunPayload): Promise<FocusRun> {
  if (!runId.trim()) {
    throw new Error("runId 不能为空");
  }

  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    return await invoke<FocusRun>("finish_focus_run", { runId, payload });
  }

  const response = await fetch(`${getLanBaseUrl()}/api/focus/runs/${encodeURIComponent(runId)}/finish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  return (await response.json()) as FocusRun;
}

export async function fetchFocusStats(options: FetchFocusStatsOptions = {}): Promise<FocusStatsResult> {
  const query = new URLSearchParams();
  if (options.startDate?.trim()) query.set("start_date", options.startDate.trim());
  if (options.endDate?.trim()) query.set("end_date", options.endDate.trim());
  if (options.dimension) query.set("dimension", options.dimension);

  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    return await invoke<FocusStatsResult>("get_focus_stats", {
      startDate: options.startDate,
      endDate: options.endDate,
      dimension: options.dimension,
    });
  }

  const qs = query.toString();
  const response = await fetch(`${getLanBaseUrl()}/api/focus/stats${qs ? `?${qs}` : ""}`);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  return (await response.json()) as FocusStatsResult;
}

export async function fetchWrongQuestions(filter: WrongQuestionFilter = {}): Promise<WrongQuestion[]> {
  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    const rows = await invoke<WrongQuestion[]>("get_wrong_questions", { filter });
    return Array.isArray(rows) ? rows : [];
  }

  const query = new URLSearchParams();
  if (filter.subject?.trim()) query.set("subject", filter.subject.trim());
  if (typeof filter.mastery_level === "number") query.set("mastery_level", String(filter.mastery_level));
  if (filter.search_keyword?.trim()) query.set("search_keyword", filter.search_keyword.trim());
  if (typeof filter.is_archived === "number") query.set("is_archived", String(filter.is_archived));
  const qs = query.toString();
  const response = await fetch(`${getLanBaseUrl()}/api/wrong-questions${qs ? `?${qs}` : ""}`);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }
  const rows = (await response.json()) as WrongQuestion[];
  return Array.isArray(rows) ? rows : [];
}

export async function createWrongQuestion(
  question: Partial<WrongQuestion>,
  addToCurrentWeek = false
): Promise<WrongQuestion> {
  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    return await invoke<WrongQuestion>("create_wrong_question", {
      question,
      addToCurrentWeek,
    });
  }

  const response = await fetch(`${getLanBaseUrl()}/api/wrong-questions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question,
      add_to_current_week: addToCurrentWeek,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  return (await response.json()) as WrongQuestion;
}

export async function updateWrongQuestion(id: string, question: Partial<WrongQuestion>): Promise<WrongQuestion> {
  if (!id.trim()) throw new Error("id 不能为空");

  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    return await invoke<WrongQuestion>("update_wrong_question", {
      id,
      question,
    });
  }

  const response = await fetch(`${getLanBaseUrl()}/api/wrong-questions/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...question, id }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  return (await response.json()) as WrongQuestion;
}

export async function archiveWrongQuestion(id: string): Promise<void> {
  if (!id.trim()) throw new Error("id 不能为空");

  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    await invoke("archive_wrong_question", { id });
    return;
  }

  const response = await fetch(`${getLanBaseUrl()}/api/wrong-questions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 204) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }
}

export async function deleteWrongQuestion(id: string): Promise<void> {
  if (!id.trim()) throw new Error("id 不能为空");

  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    await invoke("delete_wrong_question", { id });
    return;
  }

  const response = await fetch(`${getLanBaseUrl()}/api/wrong-questions/${encodeURIComponent(id)}/hard-delete`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 204) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }
}

export async function fetchWrongQuestionStats(): Promise<WrongQuestionStats> {
  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    return await invoke<WrongQuestionStats>("get_wrong_question_stats");
  }

  const response = await fetch(`${getLanBaseUrl()}/api/wrong-questions/stats`);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }
  return (await response.json()) as WrongQuestionStats;
}

export async function fetchWeeklyReviewItems(weekStart: string): Promise<WeeklyReviewItem[]> {
  if (!weekStart.trim()) throw new Error("weekStart 不能为空");

  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    const rows = await invoke<WeeklyReviewItem[]>("get_weekly_review_items", {
      weekStart,
    });
    return Array.isArray(rows) ? rows : [];
  }

  const response = await fetch(
    `${getLanBaseUrl()}/api/weekly-review/items?week_start=${encodeURIComponent(weekStart)}`
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }
  const rows = (await response.json()) as WeeklyReviewItem[];
  return Array.isArray(rows) ? rows : [];
}

export async function toggleWeeklyReviewItemDone(itemId: string, done: boolean): Promise<WeeklyReviewItem> {
  if (!itemId.trim()) throw new Error("itemId 不能为空");

  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    return await invoke<WeeklyReviewItem>("toggle_weekly_review_item_done", {
      itemId,
      done,
    });
  }

  const response = await fetch(`${getLanBaseUrl()}/api/weekly-review/items/${encodeURIComponent(itemId)}/toggle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ done }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }
  return (await response.json()) as WeeklyReviewItem;
}

export async function carryWeeklyReviewItemsToNextWeek(itemIds: string[], fromWeekStart: string): Promise<void> {
  if (!fromWeekStart.trim()) throw new Error("fromWeekStart 不能为空");
  if (!itemIds.length) return;

  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    await invoke("carry_weekly_review_items_to_next_week", {
      itemIds,
      fromWeekStart,
    });
    return;
  }

  const response = await fetch(`${getLanBaseUrl()}/api/weekly-review/carry-next-week`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ item_ids: itemIds, from_week_start: fromWeekStart }),
  });
  if (!response.ok && response.status !== 204) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }
}

export async function uploadChatImage(imageData: Uint8Array, ext: string): Promise<string> {
  if (!imageData?.length) {
    throw new Error("imageData 不能为空");
  }

  if (isTauriRuntime()) {
    const invoke = await getInvoke();
    return await invoke<string>("save_chat_image", {
      imageData: Array.from(imageData),
      ext,
    });
  }

  const blob = new Blob([imageData], { type: ext ? `image/${ext.replace(/^\./, "")}` : "application/octet-stream" });
  const formData = new FormData();
  formData.append("file", blob, `upload.${ext.replace(/^\./, "") || "png"}`);

  const response = await fetch(`${getLanBaseUrl()}/api/images/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  const result = (await response.json()) as { path?: string };
  if (!result.path) {
    throw new Error("图片上传成功但返回路径为空");
  }
  return result.path;
}

export function getImageUrl(relativePath: string): string {
  const raw = (relativePath || "").trim();
  if (!raw) return "";

  const assetMatch = raw.match(/^https?:\/\/asset\.localhost\/(.+)$/i);
  const decodedAssetPath = assetMatch ? decodeURIComponent(assetMatch[1] || "") : "";
  const source = (decodedAssetPath || raw).replace(/\\/g, "/").trim();

  const normalizedSource = source.replace(/^\/+/, "");
  const isAbsolutePath = /^[a-zA-Z]:\//.test(source) || source.startsWith("/");

  const parseApiRelative = (value: string): string => {
    const match = value.match(/\/api\/images\/(.+)$/i);
    return match ? decodeURIComponent(match[1] || "").replace(/^\/+/, "") : "";
  };

  const relativeFromApi = parseApiRelative(source);
  const clean = relativeFromApi || normalizedSource;
  if (!clean) return "";

  const absoluteFromInput = isAbsolutePath ? source : "";
  const settings = getSettings();
  const workspaceRoot = (settings.docRoot || localStorage.getItem("eva.workspace.root") || "").trim();
  const absolute = absoluteFromInput || (workspaceRoot
    ? `${workspaceRoot.replace(/[\\/]+$/, "")}/${clean}`.replace(/\\/g, "/")
    : "");

  const extractRelativeFromAbsolute = (abs: string): string => {
    const normalized = abs.replace(/\\/g, "/");
    const marker = "/EVA_Knowledge_Base/";
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex >= 0) {
      return normalized.slice(markerIndex + marker.length).replace(/^\/+/, "");
    }
    if (workspaceRoot) {
      const rootNormalized = workspaceRoot.replace(/\\/g, "/").replace(/[\\/]+$/, "");
      if (normalized.startsWith(`${rootNormalized}/`)) {
        return normalized.slice(rootNormalized.length + 1).replace(/^\/+/, "");
      }
    }
    return "";
  };

  const resolvedRelative = relativeFromApi || (isAbsolutePath
    ? extractRelativeFromAbsolute(source)
    : (absolute ? extractRelativeFromAbsolute(absolute) : clean));

  if (isTauriRuntime()) {
    const tauriAbsolute = absolute || (workspaceRoot
      ? `${workspaceRoot.replace(/[\\/]+$/, "")}/${resolvedRelative || clean}`.replace(/\\/g, "/")
      : "");
    if (!tauriAbsolute) return "";
    try {
      return convertFileSrc(tauriAbsolute);
    } catch {
      return "";
    }
  }

  if (resolvedRelative) {
    return `${getLanBaseUrl()}/api/images/${encodeURI(resolvedRelative)}`;
  }
  return `${getLanBaseUrl()}/api/images/${encodeURI(clean)}`;
}
