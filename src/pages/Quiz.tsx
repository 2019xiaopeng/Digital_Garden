import { CheckCircle2, XCircle, HelpCircle, RefreshCw, Sparkles, ArrowLeft, Plus, X, Wand2 } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { chatCompletionToText } from "../utils/aiClient";
import "katex/dist/katex.min.css";

type Subject = "408" | "数一" | "英一" | "政治";

type Question = {
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

type NewQuestionForm = {
  subject: Subject;
  type: "choice";
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  answer: "A" | "B" | "C" | "D";
  explanation: string;
};

type QuizLocationState = {
  generateFromResources?: boolean;
  selectedResourcePaths?: string[];
};

type FormMode = "manual" | "smart";
type PracticeMode = "all" | "due";

const emptyForm: NewQuestionForm = {
  subject: "408",
  type: "choice",
  stem: "",
  optionA: "",
  optionB: "",
  optionC: "",
  optionD: "",
  answer: "A",
  explanation: "",
};

export function Quiz() {
  const [activeSubject, setActiveSubject] = useState<Subject>("408");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<NewQuestionForm>(emptyForm);
  const [isCreating, setIsCreating] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("manual");
  const [smartInput, setSmartInput] = useState("");
  const [smartParseError, setSmartParseError] = useState<string | null>(null);
  const [showGeneratingHint, setShowGeneratingHint] = useState(false);
  const [generatingText, setGeneratingText] = useState("正在呼叫 AI 根据资源生成题目...");
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("all");
  const [dueCount, setDueCount] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = (location.state || {}) as QuizLocationState;
  const isGenerated = new URLSearchParams(location.search).get("generated") === "true";
  const fromResourcesSignal =
    new URLSearchParams(location.search).get("fromResources") === "true" ||
    Boolean(locationState.generateFromResources);
  const resourcePaths = locationState.selectedResourcePaths || [];
  const subjects: Subject[] = ["408", "数一", "英一", "政治"];

  const getInvoke = async () => {
    const mod = await import("@tauri-apps/api/core");
    return mod.invoke;
  };

  const normalizeAiJsonText = (raw: string): string => {
    const trimmed = raw.trim();
    if (trimmed.startsWith("```")) {
      return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    }
    return trimmed;
  };

  const parseAiQuestions = (raw: string): Array<{ stem: string; options: string[]; answer: string; explanation: string }> => {
    const normalized = normalizeAiJsonText(raw);
    const parsed = JSON.parse(normalized) as Array<{
      stem?: string;
      options?: string[] | Record<string, string>;
      answer?: string;
      explanation?: string;
    }>;

    if (!Array.isArray(parsed)) return [];

    const toOptionsArray = (options: string[] | Record<string, string> | undefined): string[] => {
      if (!options) return [];
      if (Array.isArray(options)) return options;
      return ["A", "B", "C", "D"].map((key) => options[key] || "");
    };

    return parsed
      .map((item) => ({
        stem: String(item.stem || "").trim(),
        options: toOptionsArray(item.options).map((opt) => String(opt || "").trim()).slice(0, 4),
        answer: String(item.answer || "A").trim().toUpperCase(),
        explanation: String(item.explanation || "").trim(),
      }))
      .filter((item) => item.stem && item.options.length === 4 && ["A", "B", "C", "D"].includes(item.answer));
  };

  const parseOptions = (optionsJson: string | null): Array<{ id: string; text: string }> => {
    if (!optionsJson) {
      return [
        { id: "A", text: "" },
        { id: "B", text: "" },
        { id: "C", text: "" },
        { id: "D", text: "" },
      ];
    }

    try {
      const parsed = JSON.parse(optionsJson) as string[];
      const letters = ["A", "B", "C", "D"];
      return letters.map((letter, index) => ({
        id: letter,
        text: parsed[index] || "",
      }));
    } catch {
      return [
        { id: "A", text: "" },
        { id: "B", text: "" },
        { id: "C", text: "" },
        { id: "D", text: "" },
      ];
    }
  };

  const loadQuestions = async (subject: Subject, mode: PracticeMode = practiceMode) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const invoke = await getInvoke();
      const rows = mode === "due"
        ? await invoke<Question[]>("get_due_questions", { subject })
        : await invoke<Question[]>("get_questions");
      const filtered = rows.filter((item) => item.subject === subject && item.type === "choice");
      setQuestions(filtered);
      setCurrentIndex(0);
      setSelected(null);
    } catch (err: any) {
      setLoadError(`当前环境不支持本地数据库命令或 IPC 调用失败：${err?.message || String(err)}`);
      setQuestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshDueCount = async (subject: Subject) => {
    try {
      const invoke = await getInvoke();
      const dueRows = await invoke<Question[]>("get_due_questions", { subject });
      setDueCount(dueRows.length);
    } catch {
      setDueCount(0);
    }
  };

  useEffect(() => {
    loadQuestions(activeSubject, practiceMode);
    refreshDueCount(activeSubject);
  }, [activeSubject, practiceMode]);

  useEffect(() => {
    if (!fromResourcesSignal) return;
    if (isAiGenerating) return;

    const run = async () => {
      if (resourcePaths.length === 0) return;

      setShowGeneratingHint(true);
      setIsAiGenerating(true);
      setGeneratingText("正在读取资源文本...");

      try {
        const invoke = await getInvoke();
        const textChunks: string[] = [];

        for (const path of resourcePaths.slice(0, 3)) {
          try {
            const content = await invoke<string>("read_local_file_text", { path });
            textChunks.push(`## 来源文件: ${path}\n${content.slice(0, 8000)}`);
          } catch (err) {
            console.warn("[Quiz] read_local_file_text failed:", path, err);
          }
        }

        if (textChunks.length === 0) {
          throw new Error("未读取到可用于出题的 .md/.txt 文本内容");
        }

        setGeneratingText("正在调用 AI 生成题目...");
        const aiRaw = await chatCompletionToText({
          messages: [
            {
              role: "system",
              content:
                "你是考研命题专家。请基于给定资料生成 3 道高质量单选题。必须严格只返回 JSON 数组，不要输出任何解释或 Markdown。每个元素字段固定为：stem(字符串), options(长度为4的字符串数组), answer(仅A/B/C/D), explanation(字符串)。",
            },
            {
              role: "user",
              content: `请根据以下资料生成题目：\n\n${textChunks.join("\n\n---\n\n")}`,
            },
          ],
          temperature: 0.4,
          maxTokens: 2200,
        });

        const generated = parseAiQuestions(aiRaw).slice(0, 3);
        if (generated.length === 0) {
          throw new Error("AI 返回内容无法解析为题目 JSON");
        }

        setGeneratingText("正在写入题库...");
        for (const item of generated) {
          const id = `q-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          await invoke("create_question", {
            question: {
              id,
              subject: activeSubject,
              type: "choice",
              stem: item.stem,
              options: JSON.stringify(item.options),
              answer: item.answer,
              explanation: item.explanation,
              source_files: JSON.stringify(resourcePaths),
              difficulty: 2,
              created_at: new Date().toISOString(),
              next_review: new Date().toISOString(),
              review_count: 0,
              correct_count: 0,
              ease_factor: 2.5,
              interval: 0,
            },
          });
        }

        await loadQuestions(activeSubject, practiceMode);
        await refreshDueCount(activeSubject);
        setGeneratingText("AI 出题完成，已写入练功房");
      } catch (err: any) {
        setLoadError(err?.message || String(err));
        setGeneratingText("AI 出题失败，请检查资料格式或 API 配置");
      } finally {
        const timer = window.setTimeout(() => {
          setShowGeneratingHint(false);
          setIsAiGenerating(false);
        }, 1400);

        navigate(location.pathname, {
          replace: true,
          state: {},
        });

        return () => window.clearTimeout(timer);
      }
    };

    run();
  }, [fromResourcesSignal]);

  const currentQuestion = questions[currentIndex] || null;
  const options = useMemo(() => parseOptions(currentQuestion?.options || null), [currentQuestion?.options]);
  const correctAnswer = (currentQuestion?.answer || "").toUpperCase();
  const hasAnswered = selected !== null;
  const isCurrentCorrect = selected !== null && selected === correctAnswer;

  const submitCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.stem.trim()) return;
    if (!createForm.optionA.trim() || !createForm.optionB.trim() || !createForm.optionC.trim() || !createForm.optionD.trim()) return;

    setIsCreating(true);
    try {
      const invoke = await getInvoke();
      const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await invoke("create_question", {
        question: {
          id,
          subject: createForm.subject,
          type: createForm.type,
          stem: createForm.stem.trim(),
          options: JSON.stringify([
            createForm.optionA.trim(),
            createForm.optionB.trim(),
            createForm.optionC.trim(),
            createForm.optionD.trim(),
          ]),
          answer: createForm.answer,
          explanation: createForm.explanation.trim(),
          source_files: "[]",
          difficulty: 2,
          created_at: new Date().toISOString(),
          next_review: null,
          review_count: 0,
          correct_count: 0,
          ease_factor: 2.5,
          interval: 0,
        },
      });

      setShowCreateModal(false);
      setCreateForm(emptyForm);
      setActiveSubject(createForm.subject);
      await loadQuestions(createForm.subject, practiceMode);
      await refreshDueCount(createForm.subject);
    } catch (err: any) {
      setLoadError(err?.message || String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const parseSmartQuestionInput = () => {
    setSmartParseError(null);
    const raw = smartInput.trim();
    if (!raw) {
      setSmartParseError("请先粘贴题目文本。");
      return;
    }

    const lines = raw.split(/\r?\n/);
    const optionRegex = /^\s*(?:[-*]\s*)?([A-D])[\.、:：\)\s]+(.+)$/i;
    const optionMap: Record<"A" | "B" | "C" | "D", string> = { A: "", B: "", C: "", D: "" };

    const optionLineIndexes: number[] = [];
    lines.forEach((line, index) => {
      const match = line.match(optionRegex);
      if (match) {
        const key = match[1].toUpperCase() as "A" | "B" | "C" | "D";
        optionMap[key] = match[2].trim();
        optionLineIndexes.push(index);
      }
    });

    const answerMatch = raw.match(/(?:答案|正确答案)\s*[:：]?\s*([A-D])/i);
    const answer = (answerMatch?.[1]?.toUpperCase() || "A") as "A" | "B" | "C" | "D";

    const explanationMatch = raw.match(/(?:解析|答案解析)\s*[:：]?\s*([\s\S]*)$/i);
    const explanation = explanationMatch?.[1]?.trim() || "";

    let stem = "";
    const explicitStemMatch = raw.match(/题干\s*[:：]?\s*([\s\S]*?)(?:\n\s*(?:[-*]\s*)?[A-D][\.、:：\)\s]|$)/i);
    if (explicitStemMatch?.[1]) {
      stem = explicitStemMatch[1].trim();
    } else if (optionLineIndexes.length > 0) {
      stem = lines.slice(0, optionLineIndexes[0]).join("\n").trim();
    } else {
      stem = raw;
    }

    if (!stem) {
      setSmartParseError("未识别到题干，请检查输入格式。");
      return;
    }

    if (!optionMap.A || !optionMap.B || !optionMap.C || !optionMap.D) {
      setSmartParseError("未识别完整的 A/B/C/D 选项，请检查输入格式。");
      return;
    }

    setCreateForm((prev) => ({
      ...prev,
      stem,
      optionA: optionMap.A,
      optionB: optionMap.B,
      optionC: optionMap.C,
      optionD: optionMap.D,
      answer,
      explanation,
    }));
    setFormMode("manual");
  };

  const handleAnswer = async (optionId: string) => {
    if (!currentQuestion || hasAnswered || isSubmittingAnswer) return;
    setSelected(optionId);

    setIsSubmittingAnswer(true);
    try {
      const invoke = await getInvoke();
      await invoke("answer_question", {
        id: currentQuestion.id,
        isCorrect: optionId === correctAnswer,
      });
    } catch (err: any) {
      setLoadError(err?.message || String(err));
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const goNext = () => {
    if (questions.length === 0) return;
    const next = (currentIndex + 1) % questions.length;
    setCurrentIndex(next);
    setSelected(null);
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-700 ease-out py-10">
      {isGenerated && (
        <button 
          onClick={() => navigate("/resources")}
          className="absolute top-8 left-8 flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回资源站
        </button>
      )}

      <div className="text-center mb-10">
        <div className={cn(
          "inline-flex items-center justify-center w-16 h-16 rounded-3xl mb-6 shadow-sm border",
          isGenerated ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-100/50 dark:border-emerald-500/20" : "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-100/50 dark:border-indigo-500/20"
        )}>
          {isGenerated ? <Sparkles className="w-8 h-8" /> : <HelpCircle className="w-8 h-8" />}
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl mb-4">
          {isGenerated ? "AI 生成练功房" : "练功房"}
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 font-medium">
          {isGenerated ? "基于所选资源生成的专属测试题" : "录题 - 刷题 - 判题闭环"}
        </p>
        {fromResourcesSignal && resourcePaths.length > 0 && (
          <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-300">
            已接收资源站信号：{resourcePaths.length} 个资源待生成题目
          </p>
        )}
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            onClick={() => setPracticeMode("all")}
            className={cn(
              "px-3 py-1.5 text-xs rounded-lg border",
              practiceMode === "all"
                ? "border-[#88B5D3] bg-[#88B5D3]/15 text-[#88B5D3]"
                : "border-gray-200 dark:border-gray-700"
            )}
          >
            全部题目
          </button>
          <button
            onClick={() => setPracticeMode("due")}
            className={cn(
              "px-3 py-1.5 text-xs rounded-lg border",
              practiceMode === "due"
                ? "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                : "border-gray-200 dark:border-gray-700"
            )}
          >
            今日待复习 ({dueCount})
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4 mb-4">
          {subjects.map(subject => (
            <button
              key={subject}
              onClick={() => setActiveSubject(subject)}
              className={cn(
                "text-[11px] font-semibold px-3 py-1 rounded-full border transition-colors",
                activeSubject === subject
                  ? "border-[#88B5D3] bg-[#88B5D3]/15 text-[#88B5D3]"
                  : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 bg-white/80 dark:bg-gray-900/70"
              )}
            >
              {subject}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-[#88B5D3] hover:bg-[#75a0be] px-4 py-2 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" /> 录入新题
        </button>
      </div>

      <div className="w-full max-w-4xl glass-card rounded-[2rem] p-8 md:p-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-emerald-500" />

        {loadError && (
          <div className="mb-6 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-3">
            {loadError}
          </div>
        )}

        {isLoading ? (
          <div className="py-20 text-center text-gray-500 dark:text-gray-400">题库加载中...</div>
        ) : !currentQuestion ? (
          <div className="py-20 text-center text-gray-500 dark:text-gray-400">
            当前科目暂无题目，请先点击「录入新题」添加。
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-8">
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1.5 rounded-full uppercase tracking-widest">
                Question {currentIndex + 1} of {questions.length}
              </span>
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full uppercase tracking-widest">
                {currentQuestion.subject} · 单选题
              </span>
            </div>

            <div className="text-gray-900 dark:text-white mb-8">
              <div className="prose prose-base dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {currentQuestion.stem}
                </ReactMarkdown>
              </div>
            </div>

            <div className="space-y-4">
              {options.map((option) => {
                const isSelected = selected === option.id;
                const isCorrect = option.id === correctAnswer;

                let stateClass = "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-indigo-300 dark:hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10 text-gray-700 dark:text-gray-200";
                if (hasAnswered) {
                  if (isCorrect) {
                    stateClass = "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-900 dark:text-emerald-200";
                  } else if (isSelected) {
                    stateClass = "bg-red-50 dark:bg-red-500/10 border-red-500 text-red-900 dark:text-red-200";
                  } else {
                    stateClass = "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-600 opacity-60";
                  }
                }

                return (
                  <button
                    key={option.id}
                    onClick={() => handleAnswer(option.id)}
                    disabled={hasAnswered || isSubmittingAnswer}
                    className={cn(
                      "w-full flex items-center p-5 rounded-2xl border-2 transition-all duration-300 text-left font-medium text-lg",
                      stateClass,
                      !hasAnswered && "active:scale-[0.98]"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center mr-5 font-bold text-lg transition-colors",
                      hasAnswered && isCorrect ? "bg-emerald-500 text-white" :
                      hasAnswered && isSelected ? "bg-red-500 text-white" :
                      "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300"
                    )}>
                      {option.id}
                    </div>
                    <span className="flex-1 whitespace-pre-wrap">{option.text}</span>

                    {hasAnswered && isCorrect && <CheckCircle2 className="w-6 h-6 text-emerald-500 ml-4" />}
                    {hasAnswered && isSelected && !isCorrect && <XCircle className="w-6 h-6 text-red-500 ml-4" />}
                  </button>
                );
              })}
            </div>

            {hasAnswered && (
              <div className="mt-8 border-t border-gray-200/60 dark:border-gray-800 pt-6 animate-in slide-in-from-bottom-3 fade-in duration-400">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                  {isCurrentCorrect ? "🎉 回答正确，已记录本次刷题结果。" : `💡 回答错误，正确答案是 ${correctAnswer}。已记录本次刷题结果。`}
                </p>
                <div className="bg-gray-50/70 dark:bg-[#0f1826]/55 border border-gray-200 dark:border-gray-800 rounded-2xl p-4">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">解析</div>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {currentQuestion.explanation || "暂无解析"}
                    </ReactMarkdown>
                  </div>
                </div>
                <div className="mt-5 flex justify-end">
                  <button
                    onClick={goNext}
                    className="flex items-center gap-2 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-sm hover:shadow-md active:scale-95"
                  >
                    <RefreshCw className="w-4 h-4" />
                    下一题
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <div className="relative w-full max-w-2xl bg-white dark:bg-[#0b1320] rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 z-10 bg-white/95 dark:bg-[#0b1320]/95 backdrop-blur border-b border-gray-100 dark:border-gray-800 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">录入新题</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submitCreateQuestion} className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormMode("manual")}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-lg border",
                    formMode === "manual"
                      ? "border-[#88B5D3] bg-[#88B5D3]/15 text-[#88B5D3]"
                      : "border-gray-200 dark:border-gray-700"
                  )}
                >
                  手动录入
                </button>
                <button
                  type="button"
                  onClick={() => setFormMode("smart")}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-lg border inline-flex items-center gap-1",
                    formMode === "smart"
                      ? "border-[#88B5D3] bg-[#88B5D3]/15 text-[#88B5D3]"
                      : "border-gray-200 dark:border-gray-700"
                  )}
                >
                  <Wand2 className="w-3.5 h-3.5" /> 智能文本识别
                </button>
              </div>

              {formMode === "smart" && (
                <div className="space-y-3 bg-gray-50/70 dark:bg-[#101929] rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
                  <textarea
                    value={smartInput}
                    onChange={(e) => setSmartInput(e.target.value)}
                    placeholder={"粘贴题目 Markdown 文本，例如：\n题干：...\nA. ...\nB. ...\nC. ...\nD. ...\n答案：B\n解析：..."}
                    className="w-full min-h-44 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                  />
                  {smartParseError && (
                    <div className="text-xs text-red-600 dark:text-red-400">{smartParseError}</div>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={parseSmartQuestionInput}
                      className="px-3 py-1.5 rounded-lg text-sm border border-[#88B5D3] text-[#88B5D3] hover:bg-[#88B5D3]/10"
                    >
                      解析到表单
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select
                  value={createForm.subject}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, subject: e.target.value as Subject }))}
                  className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                >
                  {subjects.map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
                <select
                  value={createForm.type}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, type: e.target.value as "choice" }))}
                  className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                >
                  <option value="choice">单选题</option>
                </select>
                <select
                  value={createForm.answer}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, answer: e.target.value as "A" | "B" | "C" | "D" }))}
                  className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                >
                  <option value="A">正确答案：A</option>
                  <option value="B">正确答案：B</option>
                  <option value="C">正确答案：C</option>
                  <option value="D">正确答案：D</option>
                </select>
              </div>

              <textarea
                value={createForm.stem}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, stem: e.target.value }))}
                placeholder="题干（支持 Markdown / LaTeX）"
                className="w-full min-h-28 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                required
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input value={createForm.optionA} onChange={(e) => setCreateForm((prev) => ({ ...prev, optionA: e.target.value }))} placeholder="选项 A" className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" required />
                <input value={createForm.optionB} onChange={(e) => setCreateForm((prev) => ({ ...prev, optionB: e.target.value }))} placeholder="选项 B" className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" required />
                <input value={createForm.optionC} onChange={(e) => setCreateForm((prev) => ({ ...prev, optionC: e.target.value }))} placeholder="选项 C" className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" required />
                <input value={createForm.optionD} onChange={(e) => setCreateForm((prev) => ({ ...prev, optionD: e.target.value }))} placeholder="选项 D" className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" required />
              </div>

              <textarea
                value={createForm.explanation}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, explanation: e.target.value }))}
                placeholder="解析（支持 Markdown / LaTeX）"
                className="w-full min-h-24 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
              />

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700">
                  取消
                </button>
                <button type="submit" disabled={isCreating} className="px-4 py-2 rounded-xl bg-[#88B5D3] hover:bg-[#75a0be] text-white disabled:opacity-60">
                  {isCreating ? "提交中..." : "一键保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGeneratingHint && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-[#0b1320] border border-gray-200 dark:border-gray-800 shadow-xl p-6 text-center">
            <div className="inline-flex w-12 h-12 rounded-2xl items-center justify-center bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 mb-3">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <h4 className="text-base font-semibold text-gray-900 dark:text-white">正在呼叫 AI 根据资源生成题目...</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{generatingText}</p>
          </div>
        </div>
      )}
    </div>
  );
}
