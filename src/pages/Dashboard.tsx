import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Target, Flame, Play, Square, BarChart3, Activity, AlarmClockCheck, CheckCircle2, Circle } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";

type Task = {
  id: string;
  title: string;
  status: "todo" | "in-progress" | "done";
  date: string;
};

type DailyAttendance = {
  checkedInAt?: string;
  checkedOutAt?: string;
  totalFocusSeconds: number;
  activeTaskId?: string;
};

type AttendanceMap = Record<string, DailyAttendance>;

const TASKS_STORAGE_KEY = "qcb.tasks.v1";
const ATTENDANCE_STORAGE_KEY = "qcb.attendance.v1";

const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const defaultAttendance = (): DailyAttendance => ({ totalFocusSeconds: 0 });

const loadTasks = (): Task[] => {
  try {
    const raw = localStorage.getItem(TASKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const loadAttendanceMap = (): AttendanceMap => {
  try {
    const raw = localStorage.getItem(ATTENDANCE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const PieChart = ({ data }: { data: { label: string; value: number; color: string }[] }) => {
  const total = data.reduce((acc, cur) => acc + cur.value, 0);
  if (total === 0) {
    return (
      <div className="relative w-32 h-32 rounded-full bg-gray-200/80 dark:bg-gray-700/40">
        <div className="absolute inset-0 m-auto w-20 h-20 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center">
          <span className="text-xs font-bold text-gray-500">暂无<br />统计</span>
        </div>
      </div>
    );
  }

  let currentAngle = 0;
  const gradient = data
    .map((item) => {
      const start = currentAngle;
      const percentage = (item.value / total) * 100;
      currentAngle += percentage;
      return `${item.color} ${start}% ${currentAngle}%`;
    })
    .join(", ");

  return (
    <div className="relative w-32 h-32 rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
      <div className="absolute inset-0 m-auto w-20 h-20 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center">
        <span className="text-xs font-bold text-gray-500">Task<br />{total}</span>
      </div>
    </div>
  );
};

export function Dashboard() {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0 });
  const examDate = new Date("2026-12-20T00:00:00");
  const today = getTodayStr();

  const [tasks, setTasks] = useState<Task[]>(() => (typeof window === "undefined" ? [] : loadTasks()));
  const [attendanceMap, setAttendanceMap] = useState<AttendanceMap>(() => (typeof window === "undefined" ? {} : loadAttendanceMap()));
  const [sessionNow, setSessionNow] = useState(Date.now());
  const [selectedTaskId, setSelectedTaskId] = useState("");

  const [pomodoroSeconds, setPomodoroSeconds] = useState(25 * 60);
  const [isPomodoroRunning, setIsPomodoroRunning] = useState(false);

  const todayTasks = useMemo(() => tasks.filter((task) => task.date === today), [tasks, today]);
  const pendingTasks = useMemo(() => todayTasks.filter((task) => task.status !== "done"), [todayTasks]);
  const doneTasks = useMemo(() => todayTasks.filter((task) => task.status === "done"), [todayTasks]);

  const todayAttendance = attendanceMap[today] || defaultAttendance();
  const isCheckedIn = Boolean(todayAttendance.checkedInAt);
  const sessionSeconds = isCheckedIn && todayAttendance.checkedInAt
    ? Math.max(0, Math.floor((sessionNow - new Date(todayAttendance.checkedInAt).getTime()) / 1000))
    : 0;
  const todayFocusSeconds = todayAttendance.totalFocusSeconds + sessionSeconds;

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const difference = examDate.getTime() - now.getTime();
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
        });
      }
      setSessionNow(Date.now());
    }, 1000);

    const syncTasks = () => setTasks(loadTasks());
    window.addEventListener("focus", syncTasks);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", syncTasks);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(attendanceMap));
  }, [attendanceMap]);

  useEffect(() => {
    if (!isPomodoroRunning || pomodoroSeconds <= 0) return;
    const timer = setInterval(() => {
      setPomodoroSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsPomodoroRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isPomodoroRunning, pomodoroSeconds]);

  const updateTodayAttendance = (patch: Partial<DailyAttendance>) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [today]: {
        ...(prev[today] || defaultAttendance()),
        ...patch,
      },
    }));
  };

  const handleCheckInOut = () => {
    const nowIso = new Date().toISOString();

    if (isCheckedIn && todayAttendance.checkedInAt) {
      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(todayAttendance.checkedInAt).getTime()) / 1000));
      updateTodayAttendance({
        checkedInAt: undefined,
        checkedOutAt: nowIso,
        totalFocusSeconds: todayAttendance.totalFocusSeconds + elapsed,
      });
      return;
    }

    const nextTaskId = selectedTaskId || todayAttendance.activeTaskId || pendingTasks[0]?.id;
    updateTodayAttendance({
      checkedInAt: nowIso,
      checkedOutAt: undefined,
      activeTaskId: nextTaskId,
    });
  };

  const toggleTaskDone = (taskId: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? { ...task, status: task.status === "done" ? "todo" : "done" }
          : task
      )
    );
  };

  useEffect(() => {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  const formatClock = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const formatPomodoro = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const recent7Days = useMemo(() => {
    const list: { day: string; hours: number }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const seconds = attendanceMap[dateStr]?.totalFocusSeconds || 0;
      list.push({ day: ["S", "M", "T", "W", "T", "F", "S"][d.getDay()], hours: Number((seconds / 3600).toFixed(1)) });
    }
    return list;
  }, [attendanceMap]);

  const streak = useMemo(() => {
    let days = 0;
    for (let i = 0; i < 30; i += 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const focused = (attendanceMap[dateStr]?.totalFocusSeconds || 0) > 0;
      if (focused) days += 1;
      else break;
    }
    return days;
  }, [attendanceMap]);

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
          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[#FF9900] tracking-tighter">{timeLeft.days}</span>
            <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Days</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[minmax(180px,auto)]">
        <div className="glass-card rounded-3xl p-6 flex flex-col gap-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-[#88B5D3]" />
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">学习班次签到</h3>
            <span className={cn("px-2.5 py-1 text-[10px] rounded-full font-semibold", isCheckedIn ? "bg-emerald-500/15 text-emerald-500" : "bg-gray-500/15 text-gray-500")}>{isCheckedIn ? "进行中" : "未开始"}</span>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-500 dark:text-gray-400">关联当日任务</label>
            <select
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              className="w-full bg-white/90 dark:bg-[#0f1826]/80 border border-gray-200/80 dark:border-[#30435c] rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white"
            >
              <option value="">自动选择首个未完成任务</option>
              {todayTasks.map((task) => (
                <option key={task.id} value={task.id}>{task.title}</option>
              ))}
            </select>
          </div>

          <div className="text-center py-1">
            <div className={cn("text-4xl font-mono font-bold tracking-tighter", isCheckedIn ? "text-emerald-500" : "text-gray-900 dark:text-white")}>{formatClock(todayFocusSeconds)}</div>
            <p className="text-xs text-gray-400 mt-1">今日累计专注（含本次班次）</p>
          </div>

          <button
            onClick={handleCheckInOut}
            className={cn(
              "w-full py-3 rounded-xl font-bold text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2",
              isCheckedIn ? "bg-red-500 hover:bg-red-600 shadow-red-500/20" : "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20"
            )}
          >
            {isCheckedIn ? (<><Square className="w-4 h-4 fill-current" />签退（结束班次）</>) : (<><Play className="w-4 h-4 fill-current" />签到（开始班次）</>)}
          </button>
        </div>

        <div className="glass-card rounded-3xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <AlarmClockCheck className="w-4 h-4 text-[#88B5D3]" /> 番茄钟
            </h3>
            <span className="text-xs text-gray-500">默认 25 分钟</span>
          </div>

          <div className="text-center">
            <div className="text-5xl font-mono font-bold text-gray-900 dark:text-white tracking-tight">{formatPomodoro(pomodoroSeconds)}</div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <button onClick={() => setPomodoroSeconds(25 * 60)} className="py-2 rounded-lg glass-soft hover:border-[#88B5D3]/40">25m</button>
            <button onClick={() => setPomodoroSeconds(50 * 60)} className="py-2 rounded-lg glass-soft hover:border-[#88B5D3]/40">50m</button>
            <button onClick={() => setPomodoroSeconds(5 * 60)} className="py-2 rounded-lg glass-soft hover:border-[#88B5D3]/40">Break</button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setIsPomodoroRunning((prev) => !prev)} className="py-2.5 rounded-xl bg-[#88B5D3] hover:bg-[#6f9fbe] text-white text-sm font-semibold">
              {isPomodoroRunning ? "暂停" : "开始"}
            </button>
            <button onClick={() => { setIsPomodoroRunning(false); setPomodoroSeconds(25 * 60); }} className="py-2.5 rounded-xl glass-soft text-sm font-semibold text-gray-700 dark:text-gray-200">
              重置
            </button>
          </div>
        </div>

        <div className="glass-card rounded-3xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#88B5D3]" /> 今日任务分布
            </h3>
          </div>
          <div className="flex items-center gap-6 flex-1">
            <PieChart data={[
              { label: "已完成", value: doneTasks.length, color: "#34d399" },
              { label: "未完成", value: pendingTasks.length, color: "#88B5D3" },
            ]} />
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-400" />已完成 {doneTasks.length}</div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#88B5D3]" />未完成 {pendingTasks.length}</div>
              <div className="text-gray-500 mt-1">完成率 {todayTasks.length ? Math.round((doneTasks.length / todayTasks.length) * 100) : 0}%</div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 glass-card rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" /> 专注热力图（近7天）
            </h3>
            <span className="text-xs text-gray-500">Today: {(todayFocusSeconds / 3600).toFixed(1)}h</span>
          </div>
          <div className="flex items-end justify-between h-32 gap-2">
            {recent7Days.map((item, i) => (
              <div key={`${item.day}-${i}`} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="w-full bg-emerald-100 dark:bg-emerald-900/30 rounded-t-lg relative" style={{ height: `${Math.min(100, (item.hours / 8) * 100)}%` }}>
                  <div className="absolute bottom-0 left-0 right-0 bg-emerald-400/80 rounded-t-lg" style={{ height: `${Math.min(100, (item.hours / 8) * 100)}%` }} />
                </div>
                <span className="text-xs text-gray-400 font-mono">{item.day}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="md:col-span-1 glass-card rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-[#88B5D3]" /> 当日任务勾选
            </h3>
            <Link to="/tasks" className="text-sm font-medium text-[#88B5D3] hover:text-[#75a0be] flex items-center transition-colors">
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="space-y-2 max-h-56 overflow-auto pr-1">
            {todayTasks.length === 0 ? (
              <div className="rounded-2xl glass-soft p-5 text-center text-gray-500 dark:text-gray-400">
                <p className="font-medium">今日暂无任务</p>
                <Link to="/tasks" className="inline-flex mt-2 text-xs text-[#88B5D3] hover:text-[#6f9fbe] transition-colors">去创建今天的第一个任务</Link>
              </div>
            ) : (
              todayTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => toggleTaskDone(task.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl glass-soft hover:border-[#88B5D3]/40 transition-colors text-left"
                >
                  {task.status === "done" ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-gray-400" />}
                  <span className={cn("text-sm truncate", task.status === "done" ? "line-through text-gray-400" : "text-gray-700 dark:text-gray-200")}>{task.title}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="glass-card rounded-3xl p-6 flex flex-col items-center justify-center text-center group hover:border-[#FF9900]/50 transition-colors relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#FF9900] to-red-500" />
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-[#FF9900]/10 text-[#FF9900] rounded-2xl flex items-center justify-center shadow-sm">
              <Flame className="w-6 h-6" />
            </div>
            <div className="text-left">
              <div className="text-3xl font-mono font-bold text-gray-900 dark:text-white leading-none">{streak}</div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Day Streak</div>
            </div>
          </div>
          <p className="text-xs text-gray-500">连续有专注记录的天数</p>
        </div>
      </div>
    </div>
  );
}
