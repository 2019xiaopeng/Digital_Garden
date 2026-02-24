import { CheckCircle2, XCircle, HelpCircle, RefreshCw, Sparkles, ArrowLeft } from "lucide-react";
import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";

const options = [
  { id: "A", text: "O(1)" },
  { id: "B", text: "O(log n)" },
  { id: "C", text: "O(n)" },
  { id: "D", text: "O(n log n)" },
];

export function Quiz() {
  const [selected, setSelected] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isGenerated = new URLSearchParams(location.search).get("generated") === "true";
  const subjects = ["408", "数一", "英一", "政治"];
  
  const correctAnswer = "B";

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
          {isGenerated ? "基于所选资源生成的专属测试题" : "今日随机题 · 数据结构"}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          {subjects.map(subject => (
            <span
              key={subject}
              className="text-[11px] font-semibold px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 bg-white/80 dark:bg-gray-900/70"
            >
              {subject}
            </span>
          ))}
        </div>
      </div>

      <div className="w-full max-w-2xl glass-card rounded-[2rem] p-8 md:p-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-emerald-500" />
        
        <div className="flex items-center justify-between mb-8">
          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1.5 rounded-full uppercase tracking-widest">Question 1 of 10</span>
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full uppercase tracking-widest">Hard</span>
        </div>

        <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-10 leading-relaxed tracking-tight">
          在一棵含有 n 个节点的 AVL 树中，查找一个元素的最坏时间复杂度是多少？
        </h2>

        <div className="space-y-4">
          {options.map((option) => {
            const isSelected = selected === option.id;
            const isCorrect = option.id === correctAnswer;
            const showResult = selected !== null;
            
            let stateClass = "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-indigo-300 dark:hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10 text-gray-700 dark:text-gray-200";
            
            if (showResult) {
              if (isCorrect) {
                stateClass = "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-900 dark:text-emerald-200";
              } else if (isSelected) {
                stateClass = "bg-red-50 dark:bg-red-500/10 border-red-500 text-red-900 dark:text-red-200";
              } else {
                stateClass = "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-600 opacity-50";
              }
            }

            return (
              <button
                key={option.id}
                onClick={() => !showResult && setSelected(option.id)}
                disabled={showResult}
                className={cn(
                  "w-full flex items-center p-5 rounded-2xl border-2 transition-all duration-300 text-left font-medium text-lg",
                  stateClass,
                  !showResult && "active:scale-[0.98]"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center mr-5 font-bold text-lg transition-colors",
                  showResult && isCorrect ? "bg-emerald-500 text-white" : 
                  showResult && isSelected ? "bg-red-500 text-white" : 
                  "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300"
                )}>
                  {option.id}
                </div>
                <span className="flex-1">{option.text}</span>
                
                {showResult && isCorrect && <CheckCircle2 className="w-6 h-6 text-emerald-500 ml-4" />}
                {showResult && isSelected && !isCorrect && <XCircle className="w-6 h-6 text-red-500 ml-4" />}
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="mt-10 pt-8 border-t border-gray-200/60 dark:border-gray-800 flex items-center justify-between animate-in slide-in-from-bottom-4 fade-in duration-500">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
              {selected === correctAnswer ? "🎉 回答正确！AVL 树是严格平衡的二叉搜索树。" : "💡 回答错误。AVL 树的高度始终保持在 O(log n)。"}
            </p>
            <button 
              onClick={() => setSelected(null)}
              className="flex items-center gap-2 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-sm hover:shadow-md active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
              下一题
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
