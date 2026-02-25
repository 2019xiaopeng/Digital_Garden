import { Calendar, Clock, ArrowRight, Search, Filter, Plus, X, Tag as TagIcon, ChevronLeft, ChevronRight, Eye, Edit3, Save, Smile, Frown, Meh, Zap, Loader2, Sparkles, Trash2 } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "../lib/utils";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { DailyLogService, TaskService, AiService, isTauriAvailable } from "../lib/dataService";
import { buildVideoUrlWithTimestamp, getVideoUrlFromMarkdown, openExternalUrl, parseFrontmatter, replaceTimestampTagsWithLinks } from "../lib/videoBookmark";
import type { LegacyPost } from "../lib/dataService";

const POSTS_PER_PAGE = 10;

export function Blog() {
  const [posts, setPosts] = useState<LegacyPost[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  
  // Editor State
  const [isWriting, setIsWriting] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"edit" | "preview">("edit");
  const [newPost, setNewPost] = useState({ 
    title: "", 
    content: "", 
    tags: "", 
    mood: "neutral" as "happy" | "sad" | "neutral" | "focused",
    syncRate: 80 
  });
  
  const [currentPage, setCurrentPage] = useState(1);
  
  // AI Review State
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [expandedPostIds, setExpandedPostIds] = useState<Set<string>>(new Set());
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const DRAFT_KEY = "eva.blog.draft.v1";

  // Load posts from dataService
  useEffect(() => {
    DailyLogService.getAll().then((loaded) => {
      setPosts(loaded);
      setDataLoaded(true);
    });
  }, []);

  // Handle incoming editId from BlogPost page
  const location = useLocation();
  useEffect(() => {
    const state = location.state as { editId?: string } | null;
    if (state?.editId && posts.length > 0) {
      const post = posts.find(p => p.id === state.editId);
      if (post) {
        handleEdit(post);
        // Clear the state so refresh doesn't re-trigger
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, posts]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const ctrlOrCmd = event.ctrlKey || event.metaKey;
      if (!ctrlOrCmd) return;

      if (event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        setEditingPostId(null);
        setNewPost({ title: `留痕 ${new Date().toISOString().split('T')[0]}`, content: "", tags: "", mood: "neutral", syncRate: 80 });
        setIsWriting(true);
      }

      if (event.key === "Enter" && isWriting) {
        event.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isWriting, newPost, editingPostId, posts]);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    posts.forEach(post => post.tags.forEach(tag => tags.add(tag)));
    return Array.from(tags);
  }, [posts]);

  const filteredPosts = useMemo(() => {
    return posts
      .filter(post => {
        const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              post.excerpt.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesTag = selectedTag ? post.tags.includes(selectedTag) : true;
        return matchesSearch && matchesTag;
      })
      .sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) {
          return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
        }
        return sortOrder === "desc" ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id);
      });
  }, [posts, searchQuery, sortOrder, selectedTag]);

  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);
  const currentPosts = filteredPosts.slice((currentPage - 1) * POSTS_PER_PAGE, currentPage * POSTS_PER_PAGE);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortOrder, selectedTag]);

  const markdownToHtml = (md: string) => {
    const { body, frontmatter } = parseFrontmatter(md);
    const escaped = body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const html = escaped
      .replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
      .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
      .replace(/^#\s+(.+)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/^-\s+(.+)$/gm, "<li>$1</li>")
      .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
      .replace(/\n\n/g, "<br/><br/>")
      .replace(/\n/g, "<br/>");

    return replaceTimestampTagsWithLinks(html, frontmatter.video || null);
  };

  const handleTimestampClick = async (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    const tag = target.closest("[data-video-seconds]") as HTMLElement | null;
    if (!tag) return;
    e.preventDefault();

    const videoUrl = (tag.closest("[data-video-url]") as HTMLElement | null)?.dataset.videoUrl;
    if (!videoUrl) return;

    const seconds = Number(tag.dataset.videoSeconds || "0");
    if (!Number.isFinite(seconds) || seconds < 0) return;

    await openExternalUrl(buildVideoUrlWithTimestamp(videoUrl, seconds));
  };

  const handleEdit = (post: LegacyPost) => {
    setEditingPostId(post.id);
    setNewPost({
      title: post.title,
      content: post.excerpt, // In real app, this would be full content
      tags: post.tags.join(", "),
      mood: post.mood as any,
      syncRate: post.syncRate
    });
    setIsWriting(true);
  };

  const handleSave = async () => {
    if (!newPost.title.trim() || !newPost.content.trim()) {
      alert("标题和正文不能为空");
      return;
    }
    if (editingPostId) {
      const updated: LegacyPost = {
        ...posts.find(p => p.id === editingPostId)!,
        title: newPost.title,
        excerpt: newPost.content,
        tags: newPost.tags.split(',').map(t => t.trim()).filter(Boolean),
        mood: newPost.mood,
        syncRate: newPost.syncRate
      };
      const saved = await DailyLogService.update(updated);
      setPosts(posts.map(p => p.id === editingPostId ? saved : p));
    } else {
      const post: LegacyPost = {
        id: `post-${Date.now()}`,
        title: newPost.title,
        excerpt: newPost.content,
        date: new Date().toISOString().split('T')[0],
        readTime: "1 min read",
        category: "Uncategorized",
        tags: newPost.tags.split(',').map(t => t.trim()).filter(Boolean),
        mood: newPost.mood,
        syncRate: newPost.syncRate
      };
      const saved = await DailyLogService.create(post);
      setPosts([saved, ...posts]);
    }
    setIsWriting(false);
    setEditingPostId(null);
    setNewPost({ title: "", content: "", tags: "", mood: "neutral", syncRate: 80 });
    localStorage.removeItem(DRAFT_KEY);
  };

  const handleDelete = async (id: string) => {
    setDeletingPostId(id);
  };
  const confirmDeletePost = async () => {
    if (!deletingPostId) return;
    await DailyLogService.delete(deletingPostId);
    setPosts(prev => prev.filter(p => p.id !== deletingPostId));
    setDeletingPostId(null);
  };

  useEffect(() => {
    if (!isWriting) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(newPost));
  }, [newPost, isWriting]);

  useEffect(() => {
    if (!isWriting) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (!editingPostId && (draft.title || draft.content)) {
          setNewPost((prev) => ({ ...prev, ...draft }));
        }
      }
    } catch {}
  }, [isWriting, editingPostId]);

  // AI 一键复盘
  const handleAiReview = async () => {
    const settings = (await import("../lib/settings")).getSettings();
    // Prefer Kimi key for blog review; fall back to DeepSeek
    const apiKey = settings.aiKimiKey || settings.aiApiKey || localStorage.getItem("eva.ai.apiKey") || "";
    if (!apiKey) {
      alert("请先在设置页配置 AI API Key（支持 DeepSeek / Kimi / MiniMax）");
      return;
    }
    setAiReviewLoading(true);
    try {
      const allTasks = await TaskService.getAll();
      const today = new Date().toISOString().split('T')[0];
      const completedToday = allTasks.filter(t => t.date === today && t.status === "done");
      
      // Get focus hours from attendance (approximate)
      let focusHours = 0;
      try {
        const raw = localStorage.getItem("qcb.attendance.v1");
        if (raw) {
          const map = JSON.parse(raw);
          focusHours = (map[today]?.totalFocusSeconds || 0) / 3600;
        }
      } catch {}

      if (completedToday.length === 0) {
        // Still generate but with basic info
        const review = await DailyLogService.generateDailyReview([], focusHours);
        setPosts([review, ...posts]);
      } else {
        // Use AI for richer review
        const aiContent = await AiService.generateReview(completedToday, focusHours, apiKey);
        const post: LegacyPost = {
          id: `ai-review-${Date.now()}`,
          title: `留痕 ${today}`,
          excerpt: aiContent,
          date: today,
          readTime: "1 min read",
          category: "Auto",
          tags: ["auto-review", "ai"],
          mood: "focused",
          syncRate: Math.min(100, Math.round((completedToday.length / Math.max(1, completedToday.length + 2)) * 100)),
        };
        const saved = await DailyLogService.create(post);
        setPosts([saved, ...posts]);
      }
    } catch (e) {
      console.error("AI review failed:", e);
      // Fallback: generate without AI
      const allTasks = await TaskService.getAll();
      const today = new Date().toISOString().split('T')[0];
      const completedToday = allTasks.filter(t => t.date === today && t.status === "done");
      const review = await DailyLogService.generateDailyReview(completedToday, 0);
      setPosts([review, ...posts]);
    }
    setAiReviewLoading(false);
  };

  const getMoodIcon = (mood: string) => {
    switch(mood) {
      case "happy": return <Smile className="w-4 h-4 text-emerald-500" />;
      case "sad": return <Frown className="w-4 h-4 text-blue-500" />;
      case "focused": return <Zap className="w-4 h-4 text-amber-500" />;
      default: return <Meh className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out max-w-4xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">每日留痕</h1>
          <p className="mt-3 text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
            记录学习过程中的思考与总结。Writing is thinking.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAiReview}
            disabled={aiReviewLoading}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-500/10 to-[#88B5D3]/10 border border-purple-300/30 dark:border-purple-500/20 hover:from-purple-500/20 hover:to-[#88B5D3]/20 text-purple-600 dark:text-purple-300 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all disabled:opacity-50"
          >
            {aiReviewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            一键 AI 复盘
          </button>
          <button
            onClick={() => {
              const today = new Date().toISOString().split('T')[0];
              const post: LegacyPost = {
                id: `post-${Date.now()}`,
                title: `留痕 ${today}`,
                excerpt: "今日同步率记录：",
                date: today,
                readTime: "1 min read",
                category: "Daily",
                tags: [],
                mood: "focused",
                syncRate: 80,
              };
              DailyLogService.create(post).then((saved) => {
                setPosts((prev) => [saved, ...prev]);
              }).catch(console.error);
            }}
            className="bg-white/90 dark:bg-[#111b29]/85 border border-[#88B5D3]/35 hover:bg-[#88B5D3]/10 text-[#88B5D3] px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
          >
            一键生成今日留痕
          </button>
          <button 
            onClick={() => {
              setEditingPostId(null);
              setNewPost({ title: "", content: "", tags: "", mood: "neutral", syncRate: 80 });
              setIsWriting(true);
            }}
            className="bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 px-5 py-2.5 rounded-2xl text-sm font-semibold flex items-center gap-2 transition-all shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4" />
            新留痕
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between glass-card p-4 rounded-3xl transition-colors">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="搜索文章..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white transition-all"
          />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
          <button 
            onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")}
            className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors whitespace-nowrap"
          >
            <Filter className="w-4 h-4" />
            {sortOrder === "desc" ? "最新优先" : "最早优先"}
          </button>
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-800 mx-1 hidden sm:block"></div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedTag(null)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                selectedTag === null ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              )}
            >
              全部
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1",
                  selectedTag === tag ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                )}
              >
                <TagIcon className="w-3 h-3" />
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {currentPosts.length === 0 ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-400 glass-soft rounded-3xl">
            <p className="font-medium">当前暂无留痕，开始你的第一篇同步记录吧</p>
            <p className="text-xs mt-2">快捷键：Ctrl/Cmd + Shift + L 打开编辑器</p>
          </div>
        ) : (
          currentPosts.map((post) => (
            <article key={post.id} className="group relative glass-card rounded-3xl p-8 hover:shadow-md transition-all duration-300">
              <div className="absolute top-8 right-8 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button 
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleEdit(post); }}
                  className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                  title="编辑"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDelete(post.id); }}
                  className="p-2 bg-red-50 dark:bg-red-500/10 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 text-red-500"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-4 mb-4 text-xs font-medium text-gray-500 dark:text-gray-400">
                <span className="text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full uppercase tracking-wider">
                  {post.category}
                </span>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <time>{post.date}</time>
                </div>
                <div className="flex items-center gap-1.5" title={`Mood: ${post.mood}, Sync: ${post.syncRate}%`}>
                  {getMoodIcon(post.mood)}
                  <span className="font-mono">{post.syncRate}% Sync</span>
                </div>
              </div>
              
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-3 tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                <Link to={`/blog/${post.id}`}>
                  <span className="absolute inset-0 rounded-3xl" />
                  {post.title}
                </Link>
              </h2>
              
              <p className={cn("text-gray-600 dark:text-gray-400 leading-relaxed text-sm mb-3", !expandedPostIds.has(post.id) && "line-clamp-3")}>
                {expandedPostIds.has(post.id) ? (
                  <span
                    data-video-url={getVideoUrlFromMarkdown(post.excerpt) || undefined}
                    onClick={handleTimestampClick}
                    dangerouslySetInnerHTML={{ __html: markdownToHtml(post.excerpt) }}
                  />
                ) : (
                  post.excerpt.replace(/[#*`\-\[\]]/g, '').slice(0, 200) + (post.excerpt.length > 200 ? '...' : '')
                )}
              </p>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setExpandedPostIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(post.id)) next.delete(post.id); else next.add(post.id);
                    return next;
                  });
                }}
                className="relative z-10 text-xs text-[#88B5D3] hover:text-[#6f9fbe] mb-4"
              >
                {expandedPostIds.has(post.id) ? "收起正文" : "展开正文"}
              </button>
              
              <div className="flex flex-wrap items-center gap-2 mb-6">
                {post.tags.map(tag => (
                  <span key={tag} className="text-[10px] bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 px-2.5 py-1 rounded-md">#{tag}</span>
                ))}
              </div>

              <div className="flex items-center text-sm font-semibold text-gray-900 dark:text-white group-hover:translate-x-1 transition-transform">
                阅读全文 <ArrowRight className="w-4 h-4 ml-1.5" />
              </div>
            </article>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-8">
          <button 
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-2 rounded-xl border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i + 1)}
                className={cn(
                  "w-10 h-10 rounded-xl text-sm font-medium transition-colors",
                  currentPage === i + 1 
                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900" 
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button 
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="p-2 rounded-xl border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Write Modal - Modern Editor Design */}
      {isWriting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6 bg-white dark:bg-gray-950 sm:bg-gray-900/40 sm:dark:bg-black/60 sm:backdrop-blur-sm transition-colors">
          <div className="relative bg-white dark:bg-gray-950 sm:rounded-[2rem] shadow-2xl w-full h-full sm:h-[90vh] max-w-5xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-200/50 dark:border-gray-800">
            {/* Editor Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
              <div className="flex items-center gap-4">
                <button onClick={() => setIsWriting(false)} className="p-2 -ml-2 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
                <div className="flex bg-gray-100 dark:bg-gray-900 p-1 rounded-lg">
                  <button 
                    onClick={() => setEditorMode("edit")}
                    className={cn("px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5", editorMode === "edit" ? "bg-white dark:bg-gray-800 shadow-sm text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400")}
                  >
                    <Edit3 className="w-3.5 h-3.5" /> 编辑
                  </button>
                  <button 
                    onClick={() => setEditorMode("preview")}
                    className={cn("px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5", editorMode === "preview" ? "bg-white dark:bg-gray-800 shadow-sm text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400")}
                  >
                    <Eye className="w-3.5 h-3.5" /> 预览
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Ctrl/Cmd + Enter 快速保存 · {newPost.content.length} 字符</span>
                <button onClick={handleSave} className="px-5 py-2 text-sm font-semibold text-white bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 rounded-xl transition-colors shadow-sm">
                  {editingPostId ? "保存修改" : "发布"}
                </button>
              </div>
            </div>

            {/* Editor Body */}
            <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-950">
              <div className="max-w-4xl mx-auto p-8 md:p-12 h-full flex flex-col">
                {editorMode === "edit" ? (
                  <>
                    <input 
                      type="text" 
                      placeholder="文章标题" 
                      value={newPost.title}
                      onChange={e => setNewPost({...newPost, title: e.target.value})}
                      className="w-full text-4xl md:text-5xl font-bold bg-transparent border-none focus:outline-none placeholder-gray-200 dark:placeholder-gray-800 text-gray-900 dark:text-white mb-6 tracking-tight"
                    />
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                      <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl">
                        <TagIcon className="w-4 h-4 text-gray-400" />
                        <input 
                          type="text" 
                          placeholder="标签 (逗号分隔)" 
                          value={newPost.tags}
                          onChange={e => setNewPost({...newPost, tags: e.target.value})}
                          className="w-full text-sm bg-transparent border-none focus:outline-none placeholder-gray-400 text-gray-600 dark:text-gray-300"
                        />
                      </div>
                      
                      <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl">
                        <span className="text-sm text-gray-400">Mood:</span>
                        <select 
                          value={newPost.mood}
                          onChange={e => setNewPost({...newPost, mood: e.target.value as any})}
                          className="bg-transparent border-none text-sm text-gray-600 dark:text-gray-300 focus:outline-none w-full"
                        >
                          <option value="neutral">😐 平静 (Neutral)</option>
                          <option value="happy">😄 开心 (Happy)</option>
                          <option value="focused">⚡ 专注 (Focused)</option>
                          <option value="sad">😔 低落 (Sad)</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl">
                        <span className="text-sm text-gray-400">Sync:</span>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          value={newPost.syncRate}
                          onChange={e => setNewPost({...newPost, syncRate: parseInt(e.target.value)})}
                          className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="text-sm font-mono text-gray-600 dark:text-gray-300 w-8 text-right">{newPost.syncRate}%</span>
                      </div>
                    </div>

                    <MarkdownEditor 
                      value={newPost.content}
                      onChange={(val) => setNewPost({...newPost, content: val})}
                      placeholder="从这里开始记录你的思考... (支持 Markdown快捷键: Ctrl+B 加粗, Ctrl+I 斜体)"
                      className="flex-1 min-h-[400px]"
                    />
                  </>
                ) : (
                  <div className="prose prose-lg dark:prose-invert max-w-none">
                    {newPost.title ? <h1>{newPost.title}</h1> : <h1 className="text-gray-300 dark:text-gray-700">无标题</h1>}
                    <div className="flex items-center gap-4 mb-8 text-sm text-gray-500">
                      <span className="flex items-center gap-1">{getMoodIcon(newPost.mood)} {newPost.mood}</span>
                      <span>Sync Rate: {newPost.syncRate}%</span>
                      <div className="flex gap-2">
                        {newPost.tags.split(',').filter(Boolean).map(t => (
                          <span key={t} className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">#{t.trim()}</span>
                        ))}
                      </div>
                    </div>
                    {newPost.content ? (
                      <div
                        data-video-url={getVideoUrlFromMarkdown(newPost.content) || undefined}
                        onClick={handleTimestampClick}
                        className="text-sm leading-7"
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(newPost.content) }}
                      />
                    ) : (
                      <p className="text-gray-400 italic">没有内容可预览</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deletingPostId}
        title="确认删除这篇留痕？"
        description="删除后将无法恢复此留痕记录。"
        confirmText="删除"
        variant="danger"
        onConfirm={confirmDeletePost}
        onCancel={() => setDeletingPostId(null)}
      />
    </div>
  );
}
