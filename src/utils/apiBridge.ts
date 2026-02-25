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

type FetchQuizQuestionsOptions = {
  mode: "all" | "due";
  subject?: string;
};

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return Boolean(win.__TAURI__ || win.__TAURI_INTERNALS__);
}

async function getInvoke() {
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke;
}

function getLanBaseUrl(): string {
  const host = window.location.hostname || "127.0.0.1";
  return `http://${host}:9527`;
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
