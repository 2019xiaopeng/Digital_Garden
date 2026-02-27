import { Calendar, ArrowLeft, Edit3, Trash2, Smile, Frown, Meh, Zap } from "lucide-react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { DailyLogService } from "../lib/dataService";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { buildVideoUrlWithTimestamp, getVideoUrlFromMarkdown, openExternalUrl, parseFrontmatter, TIMESTAMP_REGEX, timestampToSeconds } from "../lib/videoBookmark";
import type { LegacyPost } from "../lib/dataService";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

const toRenderableMarkdown = (md: string) => {
  const { body, frontmatter } = parseFrontmatter(md);
  const videoUrl = frontmatter.video || null;
  if (!videoUrl) return body;

  return body.replace(TIMESTAMP_REGEX, (full) => {
    const secs = timestampToSeconds(full);
    if (secs === null) return full;
    return `[${full}](#video-timestamp-${secs})`;
  });
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

  const handleTimestampClick = async (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    const tag = target.closest("a[href^='#video-timestamp-']") as HTMLAnchorElement | null;
    if (!tag || !post) return;
    e.preventDefault();

    const videoUrl = getVideoUrlFromMarkdown(post.excerpt);
    if (!videoUrl) return;

    const seconds = Number((tag.getAttribute("href") || "").replace("#video-timestamp-", ""));
    if (!Number.isFinite(seconds) || seconds < 0) return;
    await openExternalUrl(buildVideoUrlWithTimestamp(videoUrl, seconds));
  };

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
          data-video-url={getVideoUrlFromMarkdown(post.excerpt) || undefined}
          className="prose prose-lg dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 leading-relaxed"
          onClick={handleTimestampClick}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex, rehypeHighlight]}>
            {toRenderableMarkdown(post.excerpt)}
          </ReactMarkdown>
        </div>
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
