import { Calendar, ArrowLeft, Edit3, Trash2, Smile, Frown, Meh, Zap } from "lucide-react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { DailyLogService } from "../lib/dataService";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { LegacyPost } from "../lib/dataService";

const markdownToHtml = (md: string) => {
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/^###\s+(.+)$/gm, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2 class="text-xl font-bold mt-8 mb-3">$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm">$1</code>')
    .replace(/^- \[x\]\s+(.+)$/gm, '<div class="flex items-center gap-2 py-0.5"><span class="text-emerald-500">\u2705</span><span class="line-through text-gray-400">$1</span></div>')
    .replace(/^- \[ \]\s+(.+)$/gm, '<div class="flex items-center gap-2 py-0.5"><span class="text-gray-400">\u2610</span><span>$1</span></div>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^---$/gm, '<hr class="my-6 border-gray-200 dark:border-gray-800" />')
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
};

const getMoodIcon = (mood: string) => {
  switch(mood) {
    case "happy": return <Smile className="w-4 h-4 text-emerald-500" />;
    case "sad": return <Frown className="w-4 h-4 text-blue-500" />;
    case "focused": return <Zap className="w-4 h-4 text-amber-500" />;
    default: return <Meh className="w-4 h-4 text-gray-500" />;
  }
};

export function BlogPost() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<LegacyPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    DailyLogService.getAll().then((posts) => {
      const found = posts.find(p => p.id === id);
      setPost(found || null);
      setLoading(false);
    });
  }, [id]);

  const handleDelete = async () => {
    if (!post) return;
    await DailyLogService.delete(post.id);
    navigate("/blog");
  };

  const htmlContent = useMemo(() => {
    return post ? markdownToHtml(post.excerpt) : "";
  }, [post]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center text-gray-500 dark:text-gray-400 animate-pulse">
        加载中…
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out pb-20">
        <header className="mb-10">
          <Link to="/blog" className="inline-flex items-center gap-1 text-sm text-[#88B5D3] hover:text-[#6f9fbe] mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> 返回留痕列表
          </Link>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl mb-6 leading-tight">
            未找到文章
          </h1>
        </header>
        <article className="glass-card rounded-3xl p-10 text-center text-gray-500 dark:text-gray-400">
          该留痕不存在或已被删除。
        </article>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out pb-20">
      <header className="mb-10">
        <Link to="/blog" className="inline-flex items-center gap-1 text-sm text-[#88B5D3] hover:text-[#6f9fbe] mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> 返回留痕列表
        </Link>
        <div className="flex flex-wrap items-center gap-4 mb-6 text-xs font-medium text-gray-500 dark:text-gray-400">
          <span className="text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full uppercase tracking-widest">
            {post.category}
          </span>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            <time>{post.date}</time>
          </div>
          <div className="flex items-center gap-1.5">
            {getMoodIcon(post.mood)}
            <span className="font-mono">{post.syncRate}% Sync</span>
          </div>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl mb-6 leading-tight">
          {post.title}
        </h1>
        <div className="flex items-center gap-2">
          {post.tags.map(tag => (
            <span key={tag} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-3 py-1 rounded-lg">#{tag}</span>
          ))}
        </div>
      </header>

      <article className="glass-card rounded-3xl p-10">
        <div className="flex justify-end gap-2 mb-6">
          <Link
            to="/blog"
            state={{ editId: post.id }}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1.5 transition-colors"
          >
            <Edit3 className="w-4 h-4" /> 编辑
          </Link>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> 删除
          </button>
        </div>
        <div
          className="prose prose-lg dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </article>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="确认删除这篇留痕？"
        description="删除后将无法恢复此留痕记录。"
        confirmText="删除"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
