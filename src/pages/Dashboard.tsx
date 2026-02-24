import React, { useState, useEffect } from "react";
import { ArrowRight, BookOpen, Target, Clock, Flame, Play, Square, Award, BarChart3, Calendar, Activity } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";

// Pie Chart Component (CSS-based)
const PieChart = ({ data }: { data: { label: string; value: number; color: string }[] }) => {
  const total = data.reduce((acc, cur) => acc + cur.value, 0);
  if (total === 0) {
    return (
      <div className="relative w-32 h-32 rounded-full bg-gray-200/80 dark:bg-gray-700/40">
        <div className="absolute inset-0 m-auto w-20 h-20 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center">
          <span className="text-xs font-bold text-gray-500">暂无<br/>统计</span>
        </div>
      </div>
    );
  }
  let currentAngle = 0;

  const gradient = data.map(item => {
    const start = currentAngle;
    const percentage = (item.value / total) * 100;
    currentAngle += percentage;
    return `${item.color} ${start}% ${currentAngle}%`;
  }).join(', ');

  return (
    <div className="relative w-32 h-32 rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
      <div className="absolute inset-0 m-auto w-20 h-20 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center">
        <span className="text-xs font-bold text-gray-500">Total<br/>{total}h</span>
      </div>
    </div>
  );
};

export function Dashboard() {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0 });
  const examDate = new Date("2026-12-20T00:00:00");
  
  // Study Timer State
  const [isStudying, setIsStudying] = useState(false);
  const [sessionStart, setSessionStart] = useState<Date | null>(null);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [todayDuration, setTodayDuration] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const difference = examDate.getTime() - now.getTime();
      
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60)
        });
      }

      if (isStudying && sessionStart) {
        setSessionDuration(Math.floor((now.getTime() - sessionStart.getTime()) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isStudying, sessionStart]);

  const handleToggleStudy = () => {
    if (isStudying) {
      // Stop
      setIsStudying(false);
      setTodayDuration(prev => prev + Math.floor(sessionDuration / 60));
      setSessionDuration(0);
      setSessionStart(null);
    } else {
      // Start
      setIsStudying(true);
      setSessionStart(new Date());
    }
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl flex items-center gap-3">
            <span className="text-[#88B5D3]">EVA-00</span> 
            <span className="font-mono font-light text-gray-400 dark:text-gray-500 text-2xl">|</span>
            <span>考研辅助终端</span>
          </h1>
          <p className="mt-2 text-lg text-gray-600 dark:text-gray-400 font-mono text-sm tracking-wider uppercase">
            Project: Instrumentality of Knowledge
          </p>
        </div>
        <div className="glass-card rounded-2xl px-6 py-3 flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Target Date</span>
            <span className="font-mono font-semibold text-gray-900 dark:text-white">2026.12.20</span>
          </div>
          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700"></div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[#FF9900] tracking-tighter">{timeLeft.days}</span>
            <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Days</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[minmax(180px,auto)]">
        {/* Study Timer Card (New Design 1) */}
        <div className="glass-card rounded-3xl p-8 flex flex-col items-center justify-center text-center relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-[#88B5D3]"></div>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4">当前状态</h3>
          
          <div className="mb-6">
            <div className={cn(
              "text-5xl font-mono font-bold tracking-tighter transition-colors",
              isStudying ? "text-emerald-500" : "text-gray-900 dark:text-white"
            )}>
              {isStudying ? formatDuration(sessionDuration) : formatDuration(todayDuration * 60)}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {isStudying ? "本次专注时长" : "今日累计时长"}
            </p>
          </div>

          <button 
            onClick={handleToggleStudy}
            className={cn(
              "w-full py-3 rounded-xl font-bold text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2",
              isStudying 
                ? "bg-red-500 hover:bg-red-600 shadow-red-500/20" 
                : "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20"
            )}
          >
            {isStudying ? (
              <>
                <Square className="w-4 h-4 fill-current" /> 签退 (Check Out)
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" /> 签到 (Check In)
              </>
            )}
          </button>
        </div>

        {/* Study Distribution Pie Chart (New Design 2) */}
        <div className="glass-card rounded-3xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#88B5D3]" /> 科目分布
            </h3>
          </div>
          <div className="flex items-center gap-6 flex-1">
            <PieChart data={[
              { label: "408", value: 0, color: "#88B5D3" },
              { label: "Math", value: 0, color: "#38bdf8" },
              { label: "Eng", value: 0, color: "#a78bfa" },
              { label: "Pol", value: 0, color: "#fb7185" },
            ]} />
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#88B5D3]"></div>408 (0%)</div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-sky-400"></div>数学 (0%)</div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-violet-400"></div>英语 (0%)</div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-400"></div>政治 (0%)</div>
            </div>
          </div>
        </div>

        {/* Streak & Freeze (New Design 3 & 5) */}
        <div className="glass-card rounded-3xl p-8 flex flex-col items-center justify-center text-center group hover:border-[#FF9900]/50 transition-colors relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#FF9900] to-red-500"></div>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-[#FF9900]/10 text-[#FF9900] rounded-2xl flex items-center justify-center shadow-sm">
              <Flame className="w-6 h-6" />
            </div>
            <div className="text-left">
              <div className="text-3xl font-mono font-bold text-gray-900 dark:text-white leading-none">0</div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Day Streak</div>
            </div>
          </div>
          
          <div className="w-full bg-gray-100 dark:bg-gray-900 rounded-xl p-3 flex items-center justify-between">
             <div className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
               <div className="w-6 h-6 bg-sky-100 dark:bg-sky-900/50 text-sky-500 rounded-lg flex items-center justify-center">
                 <div className="w-2 h-2 bg-sky-400 rounded-full"></div>
               </div>
               <span>Streak Freeze</span>
             </div>
             <span className="font-mono font-bold text-gray-900 dark:text-white">0 left</span>
          </div>
        </div>

        {/* Weekly Heatmap (New Design 4) */}
        <div className="md:col-span-2 glass-card rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" /> 专注热力图 (近7天)
            </h3>
            <span className="text-xs text-gray-500">Total: 0h</span>
          </div>
          <div className="flex items-end justify-between h-32 gap-2">
            {[0, 0, 0, 0, 0, 0, 0].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                <div 
                  className="w-full bg-emerald-100 dark:bg-emerald-900/30 rounded-t-lg relative group-hover:bg-emerald-200 dark:group-hover:bg-emerald-800/50 transition-colors"
                  style={{ height: `${(h/10)*100}%` }}
                >
                  <div className="absolute bottom-0 left-0 right-0 bg-emerald-400/80 rounded-t-lg transition-all duration-500" style={{ height: `${(h/10)*100}%` }}></div>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {h} hours
                  </div>
                </div>
                <span className="text-xs text-gray-400 font-mono">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Today's Mission */}
        <div className="md:col-span-1 glass-card rounded-3xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-[#88B5D3]" /> 今日目标
            </h3>
            <Link to="/tasks" className="text-sm font-medium text-[#88B5D3] hover:text-[#75a0be] flex items-center transition-colors">
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl glass-soft p-6 text-center text-gray-500 dark:text-gray-400">
              <p className="font-medium">当前暂无任务，开始你的同步率训练吧</p>
              <Link to="/tasks" className="inline-flex mt-3 text-xs text-[#88B5D3] hover:text-[#6f9fbe] transition-colors">
                去创建今天的第一个任务
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
