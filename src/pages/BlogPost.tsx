import { Calendar, Clock } from "lucide-react";

export function BlogPost() {
  return (
    <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out pb-20">
      <header className="mb-10">
        <div className="flex items-center gap-4 mb-6 text-xs font-medium text-gray-500 dark:text-gray-400">
          <span className="text-[#88B5D3] bg-[#88B5D3]/10 px-3 py-1.5 rounded-full uppercase tracking-widest">
            Empty
          </span>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            <time>--</time>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            <span>--</span>
          </div>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl mb-6 leading-tight">
          当前暂无文章内容
        </h1>
      </header>

      <article className="glass-card rounded-3xl p-10 text-center text-gray-500 dark:text-gray-400">
        在“每日留痕”中新建内容后，这里将展示完整正文。
      </article>


    </div>
  );
}
