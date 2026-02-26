import { Link, Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { GlobalClock } from "./GlobalClock";
import { useEffect } from "react";
import { getSettings } from "../lib/settings";
import { useLocation } from "react-router-dom";
import { BookOpen, CalendarDays, Home, Target } from "lucide-react";
import { cn } from "../lib/utils";

const mobileNavItems = [
  { name: "首页", path: "/", icon: Home },
  { name: "任务", path: "/tasks", icon: CalendarDays },
  { name: "知识库", path: "/notes", icon: BookOpen },
  { name: "周复盘", path: "/weekly", icon: Target },
];

export function Layout() {
  const location = useLocation();
  const isNotesPage = location.pathname.startsWith("/notes");

  useEffect(() => {
    const apply = () => {
      const settings = getSettings();
      document.documentElement.style.fontSize = `${settings.fontScale}%`;
      if (settings.animationLevel === "reduced") {
        document.documentElement.classList.add("reduce-motion");
      } else {
        document.documentElement.classList.remove("reduce-motion");
      }
    };
    apply();
    window.addEventListener("eva:settings-updated", apply);
    return () => window.removeEventListener("eva:settings-updated", apply);
  }, []);

  return (
    <div className="min-h-screen bg-[#eef3f8] dark:bg-[#070d16] text-gray-900 dark:text-gray-100 font-sans selection:bg-[#88B5D3]/30 dark:selection:bg-[#88B5D3]/40 selection:text-[#88B5D3] dark:selection:text-[#88B5D3] transition-colors relative overflow-hidden">
      {/* EVA Rei Theme Background */}
      <div 
        className="fixed inset-0 z-0 opacity-100 dark:opacity-100 pointer-events-none bg-cover bg-no-repeat transition-all duration-500"
        style={{ backgroundImage: 'var(--bg-image)', backgroundPosition: '80% center' }}
      >
        <style>{`
          :root { --bg-image: url('/pic/background.png'); }
          .dark { --bg-image: url('/pic/background_deep.png'); }
        `}</style>
      </div>
      <div className="fixed inset-0 z-0 bg-gradient-to-br from-[#f7fbff]/30 via-[#c8d7e6]/8 to-[#88B5D3]/8 dark:from-[#0a121d]/45 dark:via-[#0a1526]/30 dark:to-[#88B5D3]/10 pointer-events-none" />
      <div className="fixed inset-0 z-0 backdrop-blur-[3px] pointer-events-none" />
      <div className="fixed inset-0 z-0 bg-[#f2f8ff]/12 dark:bg-[#0b111b]/22 pointer-events-none" />
      
      <div className="relative z-10">
        <GlobalClock />
        <Sidebar />
        <main className="md:ml-64 min-h-screen pb-24 md:pb-0">
          <div className={`${isNotesPage ? "max-w-[96rem]" : "max-w-5xl"} mx-auto p-4 md:p-8 lg:p-10`}>
            <Outlet />
          </div>
        </main>

        <nav className="fixed bottom-0 inset-x-0 md:hidden z-50 border-t border-white/55 dark:border-[#2a3b52] bg-white/66 dark:bg-[#0e1724]/74 backdrop-blur-xl shadow-[0_-6px_25px_rgba(15,23,42,0.15)]">
          <div className="grid grid-cols-4 gap-1 px-2 py-2">
            {mobileNavItems.map((item) => {
              const isActive = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-medium transition-colors",
                    isActive
                      ? "text-[#88B5D3] bg-[#88B5D3]/10"
                      : "text-gray-500 dark:text-gray-400"
                  )}
                >
                  <item.icon className={cn("w-5 h-5", isActive ? "text-[#88B5D3]" : "text-gray-400 dark:text-gray-500")} />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
