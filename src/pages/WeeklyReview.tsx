import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Target } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { questionRemarkPlugins, questionRehypePlugins } from "../lib/markdown";
import {
  fetchWeeklyReviewItems,
  fetchWeeklyStats,
  fetchWrongQuestions,
  toggleWeeklyReviewItemDone,
  type WeeklyReviewItem,
  type WrongQuestion,
} from "../utils/apiBridge";
import type { WeeklyStats } from "../utils/apiBridge";
import { AiService } from "../lib/dataService";
import { extractReviewSummary, normalizeMathDelimiters } from "../lib/markdown";
import { useSync } from "../hooks/useSync";

const COLORS = ["#88B5D3", "#6F9FBE", "#2A3B52", "#FF9900", "#C7851F"];

const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function formatFocusMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export function WeeklyReview() {
  const navigate = useNavigate();
  const [endDate, setEndDate] = useState(getTodayStr());
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string>("");
  const [weeklyItems, setWeeklyItems] = useState<WeeklyReviewItem[]>([]);
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);

  const weekStart = useMemo(() => {
    const date = new Date(`${endDate}T00:00:00`);
    const day = date.getDay();
    const offset = day === 0 ? 6 : day - 1;
    date.setDate(date.getDate() - offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }, [endDate]);

  const chartData = useMemo(() => {
    if (!stats?.subject_distribution) return [];
    return Object.entries(stats.subject_distribution)
      .map(([name, value]) => ({ name, value: Number((value || 0).toFixed(2)) }))
      .filter((item) => item.value > 0);
  }, [stats]);

  const completion = Math.max(0, Math.min(100, stats?.completion_rate || 0));

  const refreshWeeklyData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, items, wrongs] = await Promise.all([
        fetchWeeklyStats(endDate),
        fetchWeeklyReviewItems(weekStart),
        fetchWrongQuestions({ is_archived: 0 }),
      ]);
      setStats(data);
      setWeeklyItems(items);
      setWrongQuestions(wrongs);
    } catch (e) {
      setError(`加载周统计失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [endDate, weekStart]);

  useEffect(() => {
    void refreshWeeklyData();
  }, [refreshWeeklyData]);

  useSync("SYNC_WEEKLY_REVIEW_ITEMS", () => {
    void refreshWeeklyData();
  });
  useSync("SYNC_WRONG_QUESTIONS", () => {
    void refreshWeeklyData();
  });

  const handleGenerateAiReview = async () => {
    if (!stats) return;

    const { getSettings } = await import("../lib/settings");
    const { api_url, api_key, model } = await import("../lib/dataService").then((m) => m.AiService.currentVendorRequest());
    if (!api_key) {
      setAiResult("请先在设置页选择 AI 厂商并保存 API Key。");
      return;
    }

    const distText = Object.entries(stats.subject_distribution)
      .map(([k, v]) => `${k}:${v.toFixed(1)}%`)
      .join("，");

    const pending = weeklyItems.filter((item) => item.status === "pending").length;
    const done = weeklyItems.filter((item) => item.status === "done").length;
    const carryable = weeklyItems.filter((item) => item.status === "pending").length;
    const wrongSection = weeklyItems.length > 0
      ? `\n本周错题清单：待复习 ${pending} 道，已完成 ${done} 道；可延续到下周 ${carryable} 道。`
      : "";

    const systemPrompt = `你现在是一位极其严谨、数据驱动的资深考研学业规划导师。这是该考生过去一周的真实学习数据：[总专注时长: ${stats.total_focus_minutes} 分钟, 完成率: ${stats.completion_rate.toFixed(1)}%, 科目分布: ${distText}]。${wrongSection}
请根据数据进行极度理性的周度学情诊断。拒绝任何客套话与心灵鸡汤，直接指出核心问题并给出战术指导。严格使用 Markdown 输出以下结构：
### 📊 数据表现诊断
(根据专注时长和任务完成率，客观评价本周的执行力，直接点透伪勤奋或真实效率)
### ⚠️ 学科短板与偏科预警
(根据科目时间分布，犀利指出哪个关键科目投入严重不足，或精力分配失衡导致的潜在风险)
### 🎯 下周核心行动指南
(给出 1-2 条下周必须执行的、具体的纪律性调整建议，语言简练、严厉、切中要害)`;

    setAiLoading(true);
    setAiResult("");
    try {
      const response = await AiService.callApi({
        api_url,
        api_key,
        model,
        system_prompt: systemPrompt,
        user_message: `endDate=${endDate}`,
        temperature: 0.35,
        max_tokens: 1024,
      });
      setAiResult(response.content || "AI 未返回内容");
    } catch (e) {
      setAiResult(`生成失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">周复盘</h1>
          <p className="mt-3 text-lg text-gray-600 dark:text-gray-400 leading-relaxed">系统多算计，用户少操作。直接看本周作战数据与学情诊断。</p>
        </div>
        <div className="glass-soft rounded-2xl px-4 py-3">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">查看周（周一~周日）</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-white/90 dark:bg-[#0f1826]/80 border border-gray-200/80 dark:border-[#30435c] rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#88B5D3]/25 focus:border-[#88B5D3]"
          />
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">选择任意一天，系统自动按该周周一到周日聚合。</p>
        </div>
      </header>

      {error && <div className="glass-soft rounded-2xl px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div>}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card rounded-3xl p-6 border border-[#88B5D3]/30">
          <p className="text-sm text-gray-500 dark:text-gray-400">本周总专注时长</p>
          <p className="mt-2 text-4xl font-bold text-[#FF9900] dark:text-[#FF9900] tracking-tight">
            {loading ? "..." : formatFocusMinutes(stats?.total_focus_minutes || 0)}
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">累计番茄钟专注分钟已自动聚合</p>
        </div>

        <div className="glass-card rounded-3xl p-6 border border-[#88B5D3]/30 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">本周任务完成率</p>
            <p className="mt-2 text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
              {loading ? "..." : `${completion.toFixed(1)}%`}
            </p>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">done / total（本周一~周日）</p>
          </div>
          <div className="w-24 h-24 rounded-full" style={{
            background: `conic-gradient(#FF9900 ${completion}%, rgba(136,181,211,0.25) ${completion}% 100%)`
          }}>
            <div className="w-full h-full scale-[0.72] rounded-full bg-white dark:bg-[#0f1826] flex items-center justify-center text-sm font-semibold text-gray-700 dark:text-gray-200">
              {completion.toFixed(0)}%
            </div>
          </div>
        </div>
      </section>

      <section className="glass-card rounded-3xl p-6 md:p-8 border border-[#88B5D3]/30">
        <div className="mb-6 rounded-2xl border border-[#88B5D3]/25 bg-[#88B5D3]/6 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="font-semibold text-gray-900 dark:text-white">本周待复习错题（标题清单）</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">未完成项会在下周自动顺延</p>
          </div>
          <div className="space-y-2">
            {weeklyItems.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">本周暂无错题清单项</p>
            ) : weeklyItems.map((item) => {
              const target = wrongQuestions.find((q) => q.id === item.wrong_question_id);
              return (
                <div key={item.id} className="flex items-center gap-2 text-sm">
                  <button
                    onClick={() => navigate(`/error-book?questionId=${encodeURIComponent(item.wrong_question_id)}`)}
                    className={`flex-1 text-left hover:text-[#88B5D3] leading-relaxed break-words ${item.status === "done" ? "line-through text-gray-400 dark:text-gray-500" : ""}`}
                  >
                    {target ? extractReviewSummary(target.question_content, target.ai_solution, 48) : item.title_snapshot}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await toggleWeeklyReviewItemDone(item.id, item.status !== "done");
                        const items = await fetchWeeklyReviewItems(weekStart);
                        setWeeklyItems(items);
                      } catch (e) {
                        console.error("[WeeklyReview] toggle failed:", e);
                        setError(`操作失败：${e instanceof Error ? e.message : String(e)}`);
                      }
                    }}
                    className="px-2 py-1 rounded-md border border-gray-200/80 dark:border-[#30435c] text-xs text-gray-600 dark:text-gray-300"
                  >
                    {item.status === "done" ? "改为未完成" : "标记完成"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">各科目精力分布（周）</h2>
        <div className="h-[340px]">
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">加载中...</div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">暂无可视化数据</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={120}
                  paddingAngle={2}
                  label={(entry) => `${entry.name} ${entry.value.toFixed(0)}%`}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `${Number(value).toFixed(2)}%`} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="glass-card rounded-3xl p-6 md:p-8 border border-[#88B5D3]/30 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">周度学情深度剖析</h2>
          <button
            onClick={handleGenerateAiReview}
            disabled={aiLoading || !stats}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#2a3b52] via-[#88B5D3] to-[#FF9900] hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            生成本周学情深度复盘
          </button>
        </div>

        <div className="glass-soft rounded-2xl p-4 md:p-5 min-h-[220px]">
          {aiLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" /> 正在生成剖析...
            </div>
          ) : aiResult ? (
            <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-gray-900 dark:prose-headings:text-white prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-strong:text-[#FF9900]">
              <ReactMarkdown remarkPlugins={questionRemarkPlugins} rehypePlugins={questionRehypePlugins}>{normalizeMathDelimiters(aiResult)}</ReactMarkdown>
            </article>
          ) : (
            <div className="h-full flex items-center text-sm text-gray-500 dark:text-gray-400">
              <Target className="w-4 h-4 mr-2" /> 点击上方按钮生成本周学情深度复盘
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
