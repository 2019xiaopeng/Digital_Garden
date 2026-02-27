import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, BookOpenCheck, Plus, Search, Trash2 } from "lucide-react";
import {
  archiveWrongQuestion,
  carryWeeklyReviewItemsToNextWeek,
  createWrongQuestion,
  deleteWrongQuestion,
  fetchWeeklyReviewItems,
  fetchWrongQuestionStats,
  fetchWrongQuestions,
  getImageUrl,
  toggleWeeklyReviewItemDone,
  type WeeklyReviewItem,
  type WrongQuestion,
  type WrongQuestionStats,
} from "../utils/apiBridge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { useNavigate, useSearchParams } from "react-router-dom";
import { extractQuestionType, extractReviewSummary, formatQuestionLayout, normalizeMathDelimiters } from "../lib/markdown";
import { useSync } from "../hooks/useSync";
import "katex/dist/katex.min.css";

const subjects = ["全部", "数学", "408", "英语", "政治", "其他"];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekStart(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  const day = parsed.getDay();
  const offset = day === 0 ? 6 : day - 1;
  parsed.setDate(parsed.getDate() - offset);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function masteryLabel(level: number) {
  if (level <= 0) return "未掌握";
  if (level === 1) return "模糊";
  if (level === 2) return "基本掌握";
  return "熟练";
}

export function ErrorBook() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [list, setList] = useState<WrongQuestion[]>([]);
  const [stats, setStats] = useState<WrongQuestionStats | null>(null);
  const [subject, setSubject] = useState("全部");
  const [questionTypeFilter, setQuestionTypeFilter] = useState("全部题型");
  const [showArchived, setShowArchived] = useState(false);
  const [mastery, setMastery] = useState<string>("全部");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [weeklyItems, setWeeklyItems] = useState<WeeklyReviewItem[]>([]);
  const [detail, setDetail] = useState<WrongQuestion | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    subject: "数学",
    questionType: "",
    tags: "",
    question: "",
    solution: "",
    note: "",
    difficulty: 3,
  });

  const weekStart = useMemo(() => getWeekStart(todayStr()), []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, summary, weekly] = await Promise.all([
        fetchWrongQuestions({ is_archived: showArchived ? 1 : 0 }),
        fetchWrongQuestionStats(),
        fetchWeeklyReviewItems(weekStart),
      ]);
      setList(rows);
      setStats(summary);
      setWeeklyItems(weekly);
    } finally {
      setLoading(false);
    }
  }, [showArchived, weekStart]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useSync("SYNC_WEEKLY_REVIEW_ITEMS", () => { void loadData(); });
  useSync("SYNC_WRONG_QUESTIONS", () => { void loadData(); });

  const weeklyMap = useMemo(() => {
    const map = new Map<string, WeeklyReviewItem>();
    weeklyItems.forEach((item) => map.set(item.wrong_question_id, item));
    return map;
  }, [weeklyItems]);

  const filtered = useMemo(() => {
    return list.filter((item) => {
      if (subject !== "全部" && item.subject !== subject) return false;
      if (questionTypeFilter !== "全部题型") {
        const itemType = extractQuestionType(item.ai_solution) || "未分类";
        if (itemType !== questionTypeFilter) return false;
      }
      if (mastery !== "全部") {
        const target = mastery === "未掌握" ? 0 : mastery === "模糊" ? 1 : mastery === "基本掌握" ? 2 : 3;
        if (item.mastery_level !== target) return false;
      }
      if (keyword.trim()) {
        const merged = `${item.question_content}\n${item.ai_solution}\n${item.user_note || ""}`.toLowerCase();
        if (!merged.includes(keyword.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [keyword, list, mastery, questionTypeFilter, subject]);

  const questionTypeOptions = useMemo(() => {
    const set = new Set<string>();
    list.forEach((item) => {
      const t = extractQuestionType(item.ai_solution);
      if (t) set.add(t);
    });
    return ["全部题型", ...Array.from(set)];
  }, [list]);

  const pendingWeekly = useMemo(() => weeklyItems.filter((item) => item.status === "pending"), [weeklyItems]);

  useEffect(() => {
    const questionId = (searchParams.get("questionId") || "").trim();
    if (!questionId || list.length === 0) return;
    const target = list.find((item) => item.id === questionId);
    if (target) {
      setDetail(target);
      setShowSolution(false);
    }
  }, [searchParams, list]);

  const closeDetail = () => {
    setDetail(null);
    setShowSolution(false);
    if (searchParams.get("questionId")) {
      const next = new URLSearchParams(searchParams);
      next.delete("questionId");
      setSearchParams(next, { replace: true });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">错题本</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">本周待复习 {pendingWeekly.length} 道</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#88B5D3] hover:bg-[#6f9fbe] text-white text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> 手动新增
          </button>
          <button
            onClick={() => setShowArchived((prev) => !prev)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#88B5D3]/35 text-[#88B5D3] hover:bg-[#88B5D3]/10 text-sm font-semibold"
          >
            {showArchived ? "查看进行中错题" : "查看已归档"}
          </button>
        </div>
      </header>

      <section className="glass-card rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-semibold text-gray-500">学科筛选</span>
          <select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-xl border border-gray-200/80 dark:border-[#30435c] bg-white/90 dark:bg-[#0f1826]/80 px-3 py-2 text-sm">
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-gray-500">题型筛选</span>
          <select value={questionTypeFilter} onChange={(e) => setQuestionTypeFilter(e.target.value)} className="w-full rounded-xl border border-gray-200/80 dark:border-[#30435c] bg-white/90 dark:bg-[#0f1826]/80 px-3 py-2 text-sm">
            {questionTypeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-gray-500">熟练度筛选</span>
          <select value={mastery} onChange={(e) => setMastery(e.target.value)} className="w-full rounded-xl border border-gray-200/80 dark:border-[#30435c] bg-white/90 dark:bg-[#0f1826]/80 px-3 py-2 text-sm">
            {["全部", "未掌握", "模糊", "基本掌握", "熟练"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div className="md:col-span-3 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索题目/解答/笔记"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200/80 dark:border-[#30435c] bg-white/90 dark:bg-[#0f1826]/80 text-sm"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="glass-card rounded-2xl p-4">总计 <span className="font-bold text-[#88B5D3]">{stats?.total_count || 0}</span> 道</div>
        <div className="glass-card rounded-2xl p-4">未掌握 <span className="font-bold text-[#FF9900]">{stats?.unmastered_count || 0}</span> 道</div>
        <div className="glass-card rounded-2xl p-4">本周新增 <span className="font-bold text-gray-900 dark:text-white">{stats?.this_week_new || 0}</span> 道</div>
      </section>

      {!showArchived && (
        <section className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><BookOpenCheck className="w-4 h-4 text-[#88B5D3]" /> 本周待复习清单</h2>
            <button
              onClick={async () => {
                const ids = pendingWeekly.map((item) => item.id);
                if (!ids.length) return;
                await carryWeeklyReviewItemsToNextWeek(ids, weekStart);
                await loadData();
              }}
              className="text-xs px-3 py-1.5 rounded-lg border border-[#88B5D3]/30 text-[#88B5D3] hover:bg-[#88B5D3]/10"
            >
              延续未完成到下周
            </button>
          </div>
          <div className="space-y-2">
            {pendingWeekly.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">本周待复习项为空</p>
            ) : pendingWeekly.map((item) => {
              const q = list.find((x) => x.id === item.wrong_question_id);
              return (
                <label key={item.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.status === "done"}
                    onChange={async (e) => {
                      await toggleWeeklyReviewItemDone(item.id, e.target.checked);
                      await loadData();
                    }}
                  />
                  <button
                    className="text-left flex-1 hover:text-[#88B5D3] leading-relaxed break-words"
                    onClick={() => {
                      if (q) {
                        setDetail(q);
                        setShowSolution(false);
                      }
                    }}
                  >
                    {q ? extractReviewSummary(q.question_content, q.ai_solution, 48) : item.title_snapshot}
                  </button>
                </label>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-3">
        {loading ? (
          <div className="glass-card rounded-2xl p-6 text-sm text-gray-500">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="glass-card rounded-2xl p-6 text-sm text-gray-500">暂无符合条件的错题</div>
        ) : filtered.map((item) => {
          const weekly = weeklyMap.get(item.id);
          return (
            <article key={item.id} className="glass-card rounded-2xl p-4 border border-[#88B5D3]/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-gray-900 dark:text-white leading-relaxed break-words">[{item.subject}] {extractReviewSummary(item.question_content, item.ai_solution, 42)}</h3>
                <span className="text-xs text-gray-500">{masteryLabel(item.mastery_level)}</span>
              </div>
              <p className="mt-2 text-xs text-gray-500">状态：{weekly?.status || "未加入本周清单"} · 难度 {item.difficulty} 星</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => { setDetail(item); setShowSolution(false); navigate(`/error-book?questionId=${encodeURIComponent(item.id)}${showArchived ? "" : "&mode=review"}`); }} className="px-3 py-1.5 text-xs rounded-lg border border-[#88B5D3]/30 text-[#88B5D3] hover:bg-[#88B5D3]/10">查看</button>
                {!showArchived && weekly && (
                  <button
                    onClick={async () => {
                      await toggleWeeklyReviewItemDone(weekly.id, weekly.status !== "done");
                      await loadData();
                    }}
                    className="px-3 py-1.5 text-xs rounded-lg border border-gray-200/80 dark:border-[#30435c]"
                  >
                    {weekly.status === "done" ? "标记未完成" : "标记完成"}
                  </button>
                )}
                {!showArchived ? (
                  <button
                    onClick={async () => {
                      await archiveWrongQuestion(item.id);
                      await loadData();
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-red-300/60 text-red-500 hover:bg-red-500/10"
                  >
                    <Archive className="w-3.5 h-3.5" /> 归档
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      await deleteWrongQuestion(item.id);
                      await loadData();
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-red-400/70 text-red-600 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> 删除
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {detail && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeDetail} />
          <div className="relative w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#0f1826] border border-[#88B5D3]/25 p-6 space-y-4">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">[{detail.subject}] 错题详情</h3>
            {detail.question_image_path && (
              <img src={getImageUrl(detail.question_image_path)} alt="题图" className="max-h-72 rounded-xl border border-[#88B5D3]/30" />
            )}
            <article className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex, rehypeHighlight]}>
                {normalizeMathDelimiters(`### 题目\n${formatQuestionLayout(detail.question_content)}`)}
              </ReactMarkdown>
            </article>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSolution((prev) => !prev)}
                className="px-3 py-1.5 text-xs rounded-lg border border-[#88B5D3]/30 text-[#88B5D3] hover:bg-[#88B5D3]/10"
              >
                {showSolution ? "隐藏解析" : "显示解析与答案"}
              </button>
            </div>
            {showSolution && (
              <article className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex, rehypeHighlight]}>
                  {normalizeMathDelimiters(`### 解答\n${detail.ai_solution}\n\n### 笔记\n${detail.user_note || "（暂无）"}`)}
                </ReactMarkdown>
              </article>
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/55" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-2xl rounded-3xl bg-white dark:bg-[#0f1826] border border-[#88B5D3]/25 p-6 space-y-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">手动新增错题</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select value={createForm.subject} onChange={(e) => setCreateForm({ ...createForm, subject: e.target.value })} className="rounded-xl border border-gray-200/80 dark:border-[#30435c] bg-white/90 dark:bg-[#0f1826]/80 px-3 py-2 text-sm">
                {subjects.filter((s) => s !== "全部").map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input value={createForm.questionType} onChange={(e) => setCreateForm({ ...createForm, questionType: e.target.value })} placeholder="题目类型（如：函数根的存在性与实数根个数）" className="rounded-xl border border-gray-200/80 dark:border-[#30435c] bg-white/90 dark:bg-[#0f1826]/80 px-3 py-2 text-sm" />
              <input value={createForm.tags} onChange={(e) => setCreateForm({ ...createForm, tags: e.target.value })} placeholder="标签，逗号分隔" className="rounded-xl border border-gray-200/80 dark:border-[#30435c] bg-white/90 dark:bg-[#0f1826]/80 px-3 py-2 text-sm" />
            </div>
            <textarea rows={4} value={createForm.question} onChange={(e) => setCreateForm({ ...createForm, question: e.target.value })} placeholder="题目（支持 Markdown + LaTeX）" className="w-full rounded-xl border border-gray-200/80 dark:border-[#30435c] bg-white/90 dark:bg-[#0f1826]/80 px-3 py-2 text-sm" />
            <textarea rows={5} value={createForm.solution} onChange={(e) => setCreateForm({ ...createForm, solution: e.target.value })} placeholder="解答（支持 Markdown + LaTeX）" className="w-full rounded-xl border border-gray-200/80 dark:border-[#30435c] bg-white/90 dark:bg-[#0f1826]/80 px-3 py-2 text-sm" />
            <textarea rows={3} value={createForm.note} onChange={(e) => setCreateForm({ ...createForm, note: e.target.value })} placeholder="补充笔记（可选）" className="w-full rounded-xl border border-gray-200/80 dark:border-[#30435c] bg-white/90 dark:bg-[#0f1826]/80 px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl border border-gray-200/80 dark:border-[#30435c] text-sm">取消</button>
              <button
                onClick={async () => {
                  if (!createForm.question.trim() || !createForm.solution.trim()) return;
                  const now = new Date().toISOString();
                  await createWrongQuestion({
                    id: "",
                    subject: createForm.subject,
                    tags_json: JSON.stringify(createForm.tags.split(",").map((x) => x.trim()).filter(Boolean)),
                    question_content: createForm.question,
                    question_image_path: null,
                    ai_solution: createForm.questionType.trim()
                      ? `题型总结：${createForm.questionType.trim()}\n\n${createForm.solution}`
                      : createForm.solution,
                    user_note: createForm.note || null,
                    source: "manual",
                    ai_session_id: null,
                    ai_message_ids_json: null,
                    difficulty: createForm.difficulty,
                    mastery_level: 0,
                    review_count: 0,
                    next_review_date: null,
                    last_review_date: null,
                    ease_factor: 2.5,
                    interval_days: 1,
                    is_archived: 0,
                    created_at: now,
                    updated_at: now,
                  }, true);
                  setShowCreate(false);
                  await loadData();
                }}
                className="px-4 py-2 rounded-xl bg-[#88B5D3] hover:bg-[#6f9fbe] text-white text-sm font-semibold"
              >保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
