import { Link, useLocation } from "react-router-dom";
import { Home, Clock, BookOpen, FolderOpen, CalendarDays, Github, Moon, Sun, Settings, Target, BarChart3 } from "lucide-react";
import { cn } from "../lib/utils";
import { useState, useEffect } from "react";
import { getSettings } from "../lib/settings";

const navItems = [
  { name: "首页", path: "/", icon: Home },
  { name: "任务与计划", path: "/tasks", icon: CalendarDays },
  { name: "每日留痕", path: "/blog", icon: Clock },
  { name: "知识库", path: "/notes", icon: BookOpen },
  { name: "资源站", path: "/resources", icon: FolderOpen },
  { name: "周复盘", path: "/weekly", icon: Target },
  { name: "专注成就", path: "/focus-insights", icon: BarChart3 },
  { name: "设置", path: "/settings", icon: Settings },
];

export function Sidebar() {
  const location = useLocation();
  const [avatarUrl, setAvatarUrl] = useState(getSettings().avatarUrl);
  const [bgUrl, setBgUrl] = useState(getSettings().backgroundUrl);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    const onSettings = () => {
      const s = getSettings();
      setAvatarUrl(s.avatarUrl);
      setBgUrl(s.backgroundUrl);
    };
    window.addEventListener("eva:settings-updated", onSettings);
    return () => window.removeEventListener("eva:settings-updated", onSettings);
  }, []);

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className="hidden md:flex flex-col w-64 h-screen fixed left-0 top-0 border-r border-white/50 dark:border-[#2a3b52] bg-white/68 dark:bg-[#0e1724]/66 backdrop-blur-xl p-6 z-40 transition-colors overflow-hidden"
        style={bgUrl ? { backgroundImage: `url(${bgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        {bgUrl && <div className="absolute inset-0 bg-white/60 dark:bg-[#0e1724]/75 backdrop-blur-sm" />}
        <div className={bgUrl ? "relative z-10 flex flex-col h-full" : "flex flex-col h-full"}>
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <img 
              src="/pic/head.png"
              alt="Avatar" 
              className="w-10 h-10 rounded-full object-cover shadow-sm ring-2 ring-white dark:ring-gray-800"
              referrerPolicy="no-referrer"
            />
            <h1 className="font-semibold text-gray-900 dark:text-white text-lg tracking-tight">QCB's Space</h1>
          </div>
          <button 
            onClick={() => setIsDark(!isDark)}
            className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="切换主题"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive 
                    ? "bg-[#88B5D3]/12 dark:bg-[#88B5D3]/24 text-[#88B5D3] dark:text-[#88B5D3] shadow-sm" 
                    : "text-gray-600 dark:text-gray-400 hover:bg-white/65 dark:hover:bg-[#1a2738] hover:text-gray-900 dark:hover:text-white"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-[#88B5D3] dark:text-[#88B5D3]" : "text-gray-400 dark:text-gray-500")} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-6 border-t border-gray-200/60 dark:border-gray-800">
          <a 
            href="https://github.com" 
            target="_blank" 
            rel="noreferrer"
            className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors px-2"
          >
            <Github className="w-4 h-4" />
            <span>GitHub</span>
          </a>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3 px-2">© {new Date().getFullYear()} QCB. All rights reserved.</p>
        </div>
        </div>
      </aside>

    </>
  );
}
