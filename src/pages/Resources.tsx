import { FileText, Image as ImageIcon, FileArchive, Download, Search, Filter, CheckSquare, Square, Swords, Upload, Folder, Trash2 } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import { isTauriAvailable } from "../lib/dataService";
import { extractBilibiliVideoUrl, openExternalUrl } from "../lib/videoBookmark";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";

type ResourceItem = {
  id: string;
  name: string;
  path: string;
  file_type: string;
  subject: string;
  size_bytes: number;
  created_at: string;
};

type VideoBookmark = {
  id: string;
  bvid: string;
  title: string;
  pic: string;
  ownerName: string;
  duration: number;
  createdAt: string;
};

type DbVideoBookmark = {
  id: string;
  bvid: string;
  title: string;
  pic: string;
  owner_name: string;
  duration: number;
  created_at: string;
};

type BilibiliApiResponse = {
  bvid: string;
  title: string;
  pic: string;
  owner_name: string;
  duration: number;
};

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function getIcon(type: string) {
  switch (type) {
    case "pdf": return <FileText className="w-8 h-8 text-red-500" />;
    case "image": return <ImageIcon className="w-8 h-8 text-emerald-500" />;
    case "archive": return <FileArchive className="w-8 h-8 text-amber-500" />;
    default: return <FileText className="w-8 h-8 text-indigo-500" />;
  }
}

export function Resources() {
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [bilibiliInput, setBilibiliInput] = useState("");
  const [bookmarkToast, setBookmarkToast] = useState<string | null>(null);
  const [videoBookmarks, setVideoBookmarks] = useState<VideoBookmark[]>([]);
  const navigate = useNavigate();

  // Load resources + video bookmarks from SQLite on mount
  React.useEffect(() => {
    const loadData = async () => {
      if (!isTauriAvailable()) return;
      try {
        const [resRows, bmRows] = await Promise.all([
          invoke<ResourceItem[]>("get_resources"),
          invoke<DbVideoBookmark[]>("get_video_bookmarks"),
        ]);
        setResources(resRows);
        setVideoBookmarks(bmRows.map((row) => ({
          id: row.id,
          bvid: row.bvid,
          title: row.title,
          pic: row.pic,
          ownerName: row.owner_name,
          duration: row.duration,
          createdAt: row.created_at,
        })));
      } catch (error) {
        console.error("[Resources] failed to load data:", error);
      }
    };
    loadData();
  }, []);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleDeleteResource = useCallback(async (id: string) => {
    try {
      await invoke("delete_resource", { id });
      setResources(prev => prev.filter(r => r.id !== id));
      setSelectedIds(prev => prev.filter(x => x !== id));
    } catch (error) {
      console.error("[Resources] delete resource failed:", error);
    }
  }, []);

  const handleOpenResource = useCallback(async (resource: ResourceItem) => {
    try {
      const resourcesDir = await invoke<string>("get_resources_dir");
      const fullPath = `${resourcesDir}${resource.path.startsWith("/") || resource.path.startsWith("\\") ? "" : "/"}${resource.path}`;
      // Normalise to OS path separators
      const normalised = fullPath.replace(/\//g, "\\");
      await openPath(normalised);
    } catch (error) {
      console.error("[Resources] open resource failed:", error);
      setBookmarkToast(`打开文件失败：${error}`);
      setTimeout(() => setBookmarkToast(null), 2000);
    }
  }, []);

  const handleGenerateQuiz = () => {
    if (selectedIds.length === 0) return;
    // In a real app, we would pass the selected resource IDs to the quiz generator
    navigate("/quiz?generated=true");
  };

  const handleFileUpload = async () => {
    try {
      const picked = await open({ multiple: true, filters: [{ name: "All", extensions: ["*"] }] });
      const list = Array.isArray(picked) ? picked : picked ? [picked] : [];
      if (list.length === 0) return;

      type CopiedFileResult = { source_path: string; file_name: string; dest_path: string };
      const copied = await invoke<CopiedFileResult[]>("copy_files_to_resources", {
        sourcePaths: list.map((p) => String(p)),
        relativeDir: "",
      });

      const resourcesDir = await invoke<string>("get_resources_dir");
      const newResources: ResourceItem[] = [];

      for (const item of copied) {
        const ext = item.file_name.includes(".") ? item.file_name.split('.').pop()?.toLowerCase() || "file" : "file";
        // Compute relative path from Resources/ root
        const relPath = item.dest_path.startsWith(resourcesDir)
          ? item.dest_path.slice(resourcesDir.length).replace(/^\/|^\\/, "")
          : item.file_name;
        const now = new Date().toISOString();
        const res: ResourceItem = {
          id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: item.file_name,
          path: relPath,
          file_type: ext,
          subject: "",
          size_bytes: 0,
          created_at: now,
        };
        // Persist to SQLite
        await invoke("add_resource", { resource: res });
        newResources.push(res);
      }

      setResources(prev => [...newResources, ...prev]);
    } catch (error) {
      console.error("[Resources] file upload failed:", error);
    }
  };

  const handleFolderUpload = async () => {
    try {
      const picked = await open({ directory: true, multiple: false });
      if (!picked || typeof picked !== "string") return;

      setBookmarkToast("正在导入文件夹，请稍候…");
      const imported = await invoke<ResourceItem[]>("batch_copy_folder_to_resources", {
        folderPath: picked,
      });

      setResources(prev => [...imported, ...prev]);
      setBookmarkToast(`已导入 ${imported.length} 个文件`);
      setTimeout(() => setBookmarkToast(null), 2000);
    } catch (error) {
      console.error("[Resources] folder upload failed:", error);
      setBookmarkToast(`文件夹导入失败：${error}`);
      setTimeout(() => setBookmarkToast(null), 2500);
    }
  };

  const parseBvid = (input: string): string | null => {
    const direct = input.match(/BV[0-9A-Za-z]+/i);
    if (direct) return direct[0];
    const maybeUrl = extractBilibiliVideoUrl(input);
    if (!maybeUrl) return null;
    const fromUrl = maybeUrl.match(/BV[0-9A-Za-z]+/i);
    return fromUrl ? fromUrl[0] : null;
  };

  const formatDuration = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) return "--:--";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const fetchBilibiliMetadata = async (bvid: string): Promise<VideoBookmark | null> => {
    if (!isTauriAvailable()) return null;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const payload = await invoke<BilibiliApiResponse>("fetch_bilibili_metadata", { bvid });
      return {
        id: `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        bvid: payload.bvid || bvid,
        title: payload.title || bvid,
        pic: payload.pic || "",
        ownerName: payload.owner_name || "未知UP主",
        duration: payload.duration || 0,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[Resources] Rust metadata proxy failed detail:", error);
      throw error;
    }
  };

  const addVideoBookmark = async () => {
    const bvid = parseBvid(bilibiliInput.trim());
    if (!bvid) {
      setBookmarkToast("请输入有效 B 站链接或 BV 号");
      setTimeout(() => setBookmarkToast(null), 1200);
      return;
    }

    if (videoBookmarks.some((x) => x.bvid.toLowerCase() === bvid.toLowerCase())) {
      setBookmarkToast("该视频已存在书签");
      setTimeout(() => setBookmarkToast(null), 1200);
      return;
    }

    let metadata: VideoBookmark | null = null;
    try {
      metadata = await fetchBilibiliMetadata(bvid);
    } catch (error: any) {
      const message = error?.message || String(error);
      setBookmarkToast(`元数据获取失败：${message}`);
      setTimeout(() => setBookmarkToast(null), 2200);
    }

    const bookmark: VideoBookmark = metadata || {
      id: `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      bvid,
      title: bvid,
      pic: "",
      ownerName: "未知UP主",
      duration: 0,
      createdAt: new Date().toISOString(),
    };

    try {
      const payload: DbVideoBookmark = {
        id: bookmark.id,
        bvid: bookmark.bvid,
        title: bookmark.title,
        pic: bookmark.pic,
        owner_name: bookmark.ownerName,
        duration: bookmark.duration,
        created_at: bookmark.createdAt,
      };
      const saved = await invoke<DbVideoBookmark>("add_video_bookmark", { bookmark: payload });
      setVideoBookmarks((prev) => [{
        id: saved.id,
        bvid: saved.bvid,
        title: saved.title,
        pic: saved.pic,
        ownerName: saved.owner_name,
        duration: saved.duration,
        createdAt: saved.created_at,
      }, ...prev]);
    } catch (error: any) {
      setBookmarkToast(`保存书签失败：${error?.message || String(error)}`);
      setTimeout(() => setBookmarkToast(null), 2200);
      return;
    }

    setBookmarkToast(metadata ? "已添加视频书签" : "已添加书签（元数据获取失败）");
    setTimeout(() => setBookmarkToast(null), 1400);
    setBilibiliInput("");
  };

  const removeVideoBookmark = async (id: string) => {
    try {
      await invoke("delete_video_bookmark", { id });
      setVideoBookmarks((prev) => prev.filter((x) => x.id !== id));
    } catch (error) {
      console.error("[Resources] delete video bookmark failed:", error);
      setBookmarkToast("删除书签失败");
      setTimeout(() => setBookmarkToast(null), 1500);
    }
  };

  const subjects = useMemo(() => {
    const set = new Set<string>(["all"]);
    resources.forEach(item => { if (item.subject) set.add(item.subject); });
    return Array.from(set);
  }, [resources]);

  const visibleResources = useMemo(() => {
    let list = resources;
    if (subjectFilter !== "all") {
      list = list.filter(r => r.subject === subjectFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q) || r.subject.toLowerCase().includes(q));
    }
    return list;
  }, [resources, subjectFilter, searchQuery]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">资源站</h1>
          <p className="mt-3 text-lg text-gray-600 dark:text-gray-400 leading-relaxed">收集整理的学习资料与工具包。</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={handleFileUpload}
            className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-2xl text-sm font-semibold shadow-sm transition-all active:scale-95"
          >
            <Upload className="w-4 h-4" />
            上传文件
          </button>
          <button 
            onClick={handleFolderUpload}
            className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-2xl text-sm font-semibold shadow-sm transition-all active:scale-95"
          >
            <Folder className="w-4 h-4" />
            上传目录
          </button>
          {selectedIds.length > 0 && (
            <button 
              onClick={handleGenerateQuiz}
              className="animate-in fade-in zoom-in duration-300 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-2xl text-sm font-semibold shadow-sm transition-all active:scale-95"
            >
              <Swords className="w-4 h-4" />
              生成练功房 ({selectedIds.length})
            </button>
          )}
          <div className="flex items-center gap-1.5 rounded-2xl bg-white/80 dark:bg-gray-900/80 border border-gray-200 dark:border-gray-800 px-2 py-1 overflow-x-auto max-w-[420px]">
            {subjects.map((subject) => {
              const count = subject === "all" ? resources.length : resources.filter(r => r.subject === subject).length;
              const active = subjectFilter === subject;
              return (
                <button
                  key={subject}
                  onClick={() => setSubjectFilter(subject)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors",
                    active ? "bg-[#88B5D3] text-white" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                >
                  {subject === "all" ? "全部" : subject} · {count}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input 
              type="text" 
              placeholder="搜索资料…" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-800 rounded-2xl text-sm font-medium text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all w-full md:w-64 shadow-sm"
            />
          </div>
        </div>
      </header>

      <section className="glass-card rounded-3xl p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">外部视频书签</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">保存 B 站链接，点击后使用系统默认浏览器打开。</p>
          </div>
          <div className="w-full md:w-[460px] flex gap-2">
            <input
              value={bilibiliInput}
              onChange={(e) => setBilibiliInput(e.target.value)}
              placeholder="粘贴 B 站视频链接 (https://www.bilibili.com/video/BV...)"
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
            <button
              onClick={addVideoBookmark}
              className="px-4 py-2.5 rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold"
            >
              添加
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {videoBookmarks.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">暂无视频书签</div>
          ) : videoBookmarks.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2.5 bg-gray-50/70 dark:bg-gray-950/70">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-24 h-14 rounded-md overflow-hidden bg-gray-200 dark:bg-gray-800 flex-shrink-0">
                  {item.pic ? (
                    <img src={item.pic} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">No Cover</div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.ownerName} · {formatDuration(item.duration)} · {item.bvid}</div>
                  <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{`https://www.bilibili.com/video/${item.bvid}`}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openExternalUrl(`https://www.bilibili.com/video/${item.bvid}`)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#88B5D3] hover:bg-[#88B5D3]/10"
                >
                  打开
                </button>
                <button
                  onClick={() => removeVideoBookmark(item.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>

        {bookmarkToast && (
          <div className="mt-3 inline-flex px-2.5 py-1 rounded-md text-xs bg-gray-900 text-white dark:bg-white dark:text-gray-900">
            {bookmarkToast}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleResources.length === 0 && (
          <div className="col-span-full glass-soft rounded-3xl py-16 text-center text-gray-500 dark:text-gray-400">
            <Folder className="w-10 h-10 mx-auto mb-3 text-[#88B5D3]/70" />
            <p className="font-medium">当前暂无资料，上传后即可在此管理与生成练功房</p>
          </div>
        )}
        {visibleResources.map((file) => {
          const isSelected = selectedIds.includes(file.id);
          return (
            <div 
              key={file.id} 
              onClick={() => toggleSelection(file.id)}
              className={cn(
                "bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-sm border flex flex-col group transition-all duration-300 cursor-pointer relative overflow-hidden",
                isSelected ? "border-indigo-500 ring-1 ring-indigo-500 shadow-md" : "border-gray-200/60 dark:border-gray-800 hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-500/40"
              )}
            >
              {isSelected && (
                <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500 transform rotate-45 translate-x-8 -translate-y-8 z-0"></div>
              )}
              <div className="flex justify-between items-start mb-8 relative z-10">
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-sm border",
                  isSelected ? "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-100 dark:border-indigo-500/30" : "bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-800 group-hover:scale-110 group-hover:-rotate-3"
                )}>
                  {getIcon(file.file_type)}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleOpenResource(file); }}
                    title="在系统中打开文件"
                    className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-indigo-600 hover:text-white shadow-sm hover:scale-105 active:scale-95"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteResource(file.id); }}
                    title="删除此资源"
                    className="w-10 h-10 bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-red-600 hover:text-white shadow-sm hover:scale-105 active:scale-95"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300",
                    isSelected ? "text-indigo-600 dark:text-indigo-300" : "text-gray-300 dark:text-gray-600 group-hover:text-indigo-400"
                  )}>
                    {isSelected ? <CheckSquare className="w-6 h-6" /> : <Square className="w-6 h-6" />}
                  </button>
                </div>
              </div>
              
              <div className="mt-auto relative z-10">
                <h3 className={cn(
                  "font-semibold mb-3 tracking-tight line-clamp-1 transition-colors text-lg",
                  isSelected ? "text-indigo-900 dark:text-indigo-200" : "text-gray-900 dark:text-white group-hover:text-indigo-600"
                )} title={file.name}>
                  {file.name}
                </h3>
                <div className="flex items-center justify-between text-xs font-bold text-gray-500 dark:text-gray-400">
                  <span className={cn(
                    "px-3 py-1.5 rounded-lg uppercase tracking-widest text-[10px]",
                    isSelected ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300" : "bg-gray-100 dark:bg-gray-800"
                  )}>{formatFileSize(file.size_bytes)}</span>
                  <span className="font-medium">{file.created_at?.split("T")[0] ?? ""}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={cn(
                    "text-[10px] font-semibold px-2.5 py-1 rounded-full border",
                    isSelected ? "border-indigo-200 text-indigo-600 dark:text-indigo-300" : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
                  )}>
                    {file.file_type.toUpperCase()}
                  </span>
                  {file.subject && (
                    <span className={cn(
                      "text-[10px] font-semibold px-2.5 py-1 rounded-full border",
                      isSelected ? "border-indigo-200 text-indigo-600 dark:text-indigo-300" : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
                    )}>
                      {file.subject}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
