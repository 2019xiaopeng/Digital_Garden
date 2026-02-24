import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { GlobalClock } from "./GlobalClock";

export function Layout() {
  return (
    <div className="min-h-screen bg-[#eef3f8] dark:bg-[#070d16] text-gray-900 dark:text-gray-100 font-sans selection:bg-[#88B5D3]/30 dark:selection:bg-[#88B5D3]/40 selection:text-[#88B5D3] dark:selection:text-[#88B5D3] transition-colors relative overflow-hidden">
      {/* EVA Rei Theme Background */}
      <div 
        className="fixed inset-0 z-0 opacity-100 dark:opacity-100 pointer-events-none bg-cover bg-center bg-no-repeat transition-all duration-500"
        style={{ backgroundImage: 'var(--bg-image)' }}
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
        <main className="md:ml-64 min-h-screen pb-20 md:pb-0">
          <div className="max-w-5xl mx-auto p-6 md:p-10 lg:p-12">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
