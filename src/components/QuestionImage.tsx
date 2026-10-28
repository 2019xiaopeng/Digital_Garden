import { useState } from "react";
import { cn } from "../lib/utils";

type QuestionImageProps = {
  src: string;
  alt?: string;
  className?: string;
};

// A3-P1-4: 题图加载失败时显示可诊断占位（G1.1 根因修复前的止血）
export function QuestionImage({ src, alt = "题图", className }: QuestionImageProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={cn("flex items-center justify-center px-4 py-6 rounded-xl border border-dashed border-gray-300 dark:border-[#30435c] text-xs text-gray-400 bg-gray-50 dark:bg-[#0f1826]/60", className)}>
        图片未找到（可能已被移动或删除）
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}
