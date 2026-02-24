import { FileText, Image as ImageIcon, FileArchive, Download, Search, Filter, CheckSquare, Square, Swords, Upload, Folder } from "lucide-react";
import React, { useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";

type ResourceItem = {
  id: number;
  name: string;
  size: string;
  type: string;
  date: string;
  subject: string;
  folder?: string;
};

const initialResources: ResourceItem[] = [
  
];

function getIcon(type: string) {
  switch (type) {
    case "pdf": return <FileText className="w-8 h-8 text-red-500" />;
    case "image": return <ImageIcon className="w-8 h-8 text-emerald-500" />;
    case "archive": return <FileArchive className="w-8 h-8 text-amber-500" />;
    default: return <FileText className="w-8 h-8 text-indigo-500" />;
  }
}

export function Resources() {
  const [resources, setResources] = useState(initialResources);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [bilibiliInput, setBilibiliInput] = useState("https://www.bilibili.com/video/BV1iT411b7yB");
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const directoryInputProps = { webkitdirectory: "true" } as React.HTMLAttributes<HTMLInputElement>;

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleGenerateQuiz = () => {
    if (selectedIds.length === 0) return;
    // In a real app, we would pass the selected resource IDs to the quiz generator
    navigate("/quiz?generated=true");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const newResources: ResourceItem[] = Array.from(files).map((file: File, index) => ({
      id: Date.now() + index,
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(1) + " MB",
      type: file.name.split('.').pop()?.toLowerCase() || "unknown",
      date: new Date().toISOString().split('T')[0],
      subject: "未分类"
    }));

    setResources([...newResources, ...resources]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFolderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newResources: ResourceItem[] = Array.from(files).map((file: File, index) => {
      const relativePath = (file as any).webkitRelativePath || file.name;
      const folderName = relativePath.split("/").filter(Boolean)[0] || "本地目录";
      return {
        id: Date.now() + index,
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(1) + " MB",
        type: file.name.split('.').pop()?.toLowerCase() || "unknown",
        date: new Date().toISOString().split('T')[0],
        subject: "未分类",
        folder: folderName
      };
    });

    setResources([...newResources, ...resources]);
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  };

  const embedUrl = useMemo(() => {
    const raw = bilibiliInput.trim();
    if (!raw) return "";
    const bvidMatch = raw.match(/BV[A-Za-z0-9]+/);
    if (bvidMatch) {
      return `https://player.bilibili.com/player.html?bvid=${bvidMatch[0]}&autoplay=0`;
    }
    const aidMatch = raw.match(/av(\d+)/i);
    if (aidMatch) {
      return `https://player.bilibili.com/player.html?aid=${aidMatch[1]}&autoplay=0`;
    }
    return raw.startsWith("http") ? raw : "";
  }, [bilibiliInput]);

  const subjects = useMemo(() => {
    const set = new Set<string>(["all"]);
    resources.forEach(item => set.add(item.subject));
    return Array.from(set);
  }, [resources]);

  const visibleResources = resources.filter(resource => subjectFilter === "all" || resource.subject === subjectFilter);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">资源站</h1>
          <p className="mt-3 text-lg text-gray-600 dark:text-gray-400 leading-relaxed">收集整理的学习资料与工具包。</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-2xl text-sm font-semibold shadow-sm transition-all active:scale-95"
          >
            <Upload className="w-4 h-4" />
            上传文件
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            multiple 
            onChange={handleFileUpload} 
          />
          <button 
            onClick={() => folderInputRef.current?.click()}
            className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-2xl text-sm font-semibold shadow-sm transition-all active:scale-95"
          >
            <Folder className="w-4 h-4" />
            上传目录
          </button>
          <input 
            type="file" 
            ref={folderInputRef} 
            className="hidden" 
            multiple 
            onChange={handleFolderUpload}
            {...directoryInputProps}
          />
          {selectedIds.length > 0 && (
            <button 
              onClick={handleGenerateQuiz}
              className="animate-in fade-in zoom-in duration-300 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-2xl text-sm font-semibold shadow-sm transition-all active:scale-95"
            >
              <Swords className="w-4 h-4" />
              生成练功房 ({selectedIds.length})
            </button>
          )}
          <div className="relative">
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="appearance-none bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl text-sm font-semibold text-gray-700 dark:text-gray-200 pl-4 pr-10 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            >
              {subjects.map(subject => (
                <option key={subject} value={subject}>
                  {subject === "all" ? "全部科目" : subject}
                </option>
              ))}
            </select>
            <Filter className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input 
              type="text" 
              placeholder="Search files..." 
              className="pl-9 pr-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-800 rounded-2xl text-sm font-medium text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all w-full md:w-64 shadow-sm"
            />
          </div>
          <button className="p-2.5 bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-800 rounded-2xl text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm">
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </header>

      <section className="glass-card rounded-3xl p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">内置视频浏览器</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">支持直接输入 B 站链接或 BV 号进行播放。</p>
          </div>
          <div className="w-full md:w-[420px]">
            <input
              value={bilibiliInput}
              onChange={(e) => setBilibiliInput(e.target.value)}
              placeholder="粘贴 B 站链接或 BV 号"
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>
        </div>
        <div className="relative w-full overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 aspect-video">
          {embedUrl ? (
            <iframe
              key={embedUrl}
              src={embedUrl}
              className="w-full h-full"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-500">
              请输入有效的 B 站链接或 BV 号
            </div>
          )}
        </div>
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
                  {getIcon(file.type)}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); /* download logic */ }}
                    className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-indigo-600 hover:text-white shadow-sm hover:scale-105 active:scale-95"
                  >
                    <Download className="w-5 h-5" />
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
                  )}>{file.size}</span>
                  <span className="font-medium">{file.date}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={cn(
                    "text-[10px] font-semibold px-2.5 py-1 rounded-full border",
                    isSelected ? "border-indigo-200 text-indigo-600 dark:text-indigo-300" : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
                  )}>
                    {file.subject}
                  </span>
                  {file.folder && (
                    <span className={cn(
                      "text-[10px] font-semibold px-2.5 py-1 rounded-full border",
                      isSelected ? "border-indigo-200 text-indigo-600 dark:text-indigo-300" : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
                    )}>
                      {file.folder}
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
