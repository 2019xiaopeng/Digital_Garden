import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Target, Play, Square, BarChart3, Activity, AlarmClockCheck, CheckCircle2, Circle, Maximize2, X, Pause, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";
import { FocusService } from "../lib/dataService";
import type { LegacyTask } from "../lib/dataService";
import {
  fetchDashboardStats,
  fetchFocusStats,
  fetchFocusTemplates,
  fetchWrongQuestionStats,
  finishFocusRun,
  modifyTask,
  startFocusRun,
  type FocusTemplate,
  type WrongQuestionStats,
} from "../utils/apiBridge";
import { getSettings, type AppSettings } from "../lib/settings";
import { useSync } from "../hooks/useSync";

type DailyAttendance = {
  checkedInAt?: string;
  checkedOutAt?: string;
  totalFocusSeconds: number;
  activeTaskId?: string;
};

type AttendanceMap = Record<string, DailyAttendance>;

const ATTENDANCE_STORAGE_KEY = "qcb.attendance.v1";
const NERV_COLLAPSE_STORAGE_KEY = "eva.dashboard.nerv.collapsed.v1";

type SubjectProgress = {
  key: "major" | "math" | "english" | "politics";
  label: string;
  targetScore: number;
  done: number;
  total: number;
  progress: number;
  barClass: string;
  glowClass: string;
};

const SUBJECT_RULES: Array<{
  key: SubjectProgress["key"];
  label: string;
  keywords: string[];
  barClass: string;
  glowClass: string;
}> = [
  {
    key: "major",
    label: "408 / 专业课",
    keywords: ["408", "专业课", "数据结构", "计网", "网络", "操作系统", "组成原理", "计组"],
    barClass: "bg-gradient-to-r from-[#7c3aed] via-[#6d28d9] to-[#5b21b6]",
    glowClass: "shadow-[0_0_18px_rgba(124,58,237,0.35)]",
  },
  {
    key: "math",
    label: "数学",
    keywords: ["数学", "数一", "高数", "线代", "概率"],
    barClass: "bg-gradient-to-r from-[#2e5ea7] via-[#3b82f6] to-[#88B5D3]",
    glowClass: "shadow-[0_0_18px_rgba(136,181,211,0.4)]",
  },
  {
    key: "english",
    label: "英语",
    keywords: ["英语", "英一", "单词", "阅读", "翻译", "写作"],
    barClass: "bg-gradient-to-r from-[#0f766e] via-[#14b8a6] to-[#2dd4bf]",
    glowClass: "shadow-[0_0_18px_rgba(45,212,191,0.35)]",
  },
  {
    key: "politics",
    label: "政治",
    keywords: ["政治", "马原", "毛概", "史纲", "思修", "时政"],
    barClass: "bg-gradient-to-r from-[#b45309] via-[#f59e0b] to-[#fbbf24]",
    glowClass: "shadow-[0_0_18px_rgba(245,158,11,0.35)]",
  },
];

const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const defaultAttendance = (): DailyAttendance => ({ totalFocusSeconds: 0 });

const getCountdown = (targetIso: string) => {
  const now = new Date();
  const target = new Date(targetIso);
  const difference = Math.max(0, target.getTime() - now.getTime());
  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / 1000 / 60) % 60),
  };
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

const parseFocusTemplateTags = (template: FocusTemplate | null): string[] => {
  if (!template) return [];
  try {
    const parsed = JSON.parse(template.tags_json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((tag) => String(tag).trim()).filter(Boolean);
  } catch {
    return [];
  }
};

/* ─── Mini Pie Chart ─── */
const PieChart = ({ data }: { data: { label: string; value: number; color: string }[] }) => {
  const total = data.reduce((acc, cur) => acc + cur.value, 0);
  if (total === 0) {
    return (
      <div className="relative w-28 h-28 rounded-full bg-gray-200/80 dark:bg-gray-700/40">
        <div className="absolute inset-0 m-auto w-[72px] h-[72px] bg-white dark:bg-gray-800 rounded-full flex items-center justify-center">
          <span className="text-[10px] font-bold text-gray-500">暂无<br />统计</span>
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
    <div className="relative w-28 h-28 rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
      <div className="absolute inset-0 m-auto w-[72px] h-[72px] bg-white dark:bg-gray-800 rounded-full flex items-center justify-center">
        <span className="text-[10px] font-bold text-gray-500">Task<br />{total}</span>
      </div>
    </div>
  );
};

/* ─── 30-Day Heatmap Grid (GitHub-style) ─── */
const HeatmapGrid = ({ attendanceMap, todayFocusSeconds }: { attendanceMap: AttendanceMap; todayFocusSeconds: number }) => {
  const today = getTodayStr();
  const cells = useMemo(() => {
    const list: { date: string; hours: number; isToday: boolean }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const seconds = dateStr === today ? todayFocusSeconds : (attendanceMap[dateStr]?.totalFocusSeconds || 0);
      list.push({ date: dateStr, hours: Number((seconds / 3600).toFixed(1)), isToday: dateStr === today });
    }
    return list;
  }, [attendanceMap, todayFocusSeconds, today]);

  const getHeatColor = (hours: number) => {
    if (hours <= 0) return "bg-gray-100 dark:bg-gray-800/60";
    if (hours < 1) return "bg-emerald-200/80 dark:bg-emerald-900/50";
    if (hours < 3) return "bg-emerald-300/80 dark:bg-emerald-700/60";
    if (hours < 5) return "bg-emerald-400/90 dark:bg-emerald-600/70";
    return "bg-emerald-500 dark:bg-emerald-500/80";
  };

  return (
    <div className="grid grid-cols-10 gap-1.5">
      {cells.map((cell) => (
        <div
          key={cell.date}
          title={`${cell.date}: ${cell.hours}h`}
          className={cn(
            "w-full aspect-square rounded-[4px] transition-all hover:scale-125 hover:z-10 cursor-default",
            getHeatColor(cell.hours),
            cell.isToday && "ring-2 ring-[#88B5D3] ring-offset-1 dark:ring-offset-[#0b1018]"
          )}
        />
      ))}
    </div>
  );
};

/* ─── NERV-Style Data Block ─── */
const NervDataBlock = ({ label, value, unit, accentColor = "#88B5D3", glowColor }: {
  label: string; value: string | number; unit?: string; accentColor?: string; glowColor?: string;
}) => (
  <div className="relative group flex flex-col items-center justify-center p-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-white/30 dark:border-[#88B5D3]/10 transition-all hover:border-[#88B5D3]/30">
    <div
      className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
      style={{ boxShadow: `inset 0 0 20px ${glowColor || accentColor}18, 0 0 12px ${glowColor || accentColor}08` }}
    />
    <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.15em] mb-1">{label}</span>
    <div className="flex items-baseline gap-1">
      <span className="text-xl font-mono font-bold tracking-tighter" style={{ color: accentColor }}>{value}</span>
      {unit && <span className="text-[10px] font-medium text-gray-400">{unit}</span>}
    </div>
  </div>
);

/* ─── Fullscreen Pomodoro ─── */
const FullscreenPomodoro = ({
  seconds, isRunning, taskTitle,
  onToggle, onReset, onExit, totalSeconds,
}: {
  seconds: number; isRunning: boolean; taskTitle: string; totalSeconds: number;
  onToggle: () => void; onReset: () => void; onExit: () => void;
}) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const progress = totalSeconds > 0 ? 1 - seconds / totalSeconds : 0;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#070d16]/[0.97] backdrop-blur-xl animate-in fade-in duration-500">
      {/* Subtle animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute w-[500px] h-[500px] rounded-full bg-[#88B5D3]/[0.04] blur-[120px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute w-[300px] h-[300px] rounded-full bg-emerald-500/[0.03] blur-[100px] top-1/3 left-1/3 animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />
      </div>

      {/* Exit button */}
      <button onClick={onExit} className="absolute top-8 right-8 p-3 text-gray-500 hover:text-white transition-colors rounded-full hover:bg-white/5">
        <X className="w-6 h-6" />
      </button>

      {/* Current task */}
      {taskTitle && (
        <div className="mb-12 text-center">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">当前专注</span>
          <p className="text-lg font-medium text-gray-300 mt-1 max-w-md truncate">{taskTitle}</p>
        </div>
      )}

      {/* Timer ring + digits */}
      <div className="relative w-72 h-72 md:w-96 md:h-96 flex items-center justify-center">
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(136,181,211,0.08)" strokeWidth="4" />
          <circle
            cx="100" cy="100" r="90" fill="none"
            stroke={isRunning ? "#88B5D3" : "rgba(136,181,211,0.3)"}
            strokeWidth="4"
            strokeDasharray={`${2 * Math.PI * 90}`}
            strokeDashoffset={`${2 * Math.PI * 90 * (1 - progress)}`}
            strokeLinecap="round"
            className="transition-all duration-1000"
            style={{ filter: isRunning ? "drop-shadow(0 0 8px rgba(136,181,211,0.4))" : "none" }}
          />
        </svg>
        <div className="flex items-baseline gap-2 z-10">
          <span className={cn("text-7xl md:text-9xl font-mono font-bold tracking-tighter transition-colors", seconds === 0 ? "text-red-400 animate-pulse" : "text-white")}>
            {String(m).padStart(2, "0")}
          </span>
          <span className="text-4xl md:text-6xl font-mono text-gray-500 animate-pulse">:</span>
          <span className={cn("text-7xl md:text-9xl font-mono font-bold tracking-tighter transition-colors", seconds === 0 ? "text-red-400 animate-pulse" : "text-white")}>
            {String(s).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-8 mt-12">
        <button onClick={onToggle} className={cn("w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-all active:scale-95", isRunning ? "bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40" : "bg-[#88B5D3]/20 hover:bg-[#88B5D3]/30 border border-[#88B5D3]/40")}>
          {isRunning ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
        </button>
        <button onClick={onReset} className="w-12 h-12 rounded-full flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 border border-white/10 transition-all">
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   Dashboard Component
   ═══════════════════════════════════════════════════════════ */
export function Dashboard() {
  const today = getTodayStr();

  const [tasks, setTasks] = useState<LegacyTask[]>([]);
  const [examSettings, setExamSettings] = useState<AppSettings>(() => getSettings());
  const [attendanceMap, setAttendanceMap] = useState<AttendanceMap>(() => (typeof window === "undefined" ? {} : loadAttendanceMap()));
  const [sessionNow, setSessionNow] = useState(Date.now());
  const [countdownNow, setCountdownNow] = useState(Date.now());
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [pomodoroMode, setPomodoroMode] = useState<"template" | "task" | "quick">("task");
  const [selectedPomodoroTaskId, setSelectedPomodoroTaskId] = useState("");
  const [focusTemplates, setFocusTemplates] = useState<FocusTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [pomodoroSeconds, setPomodoroSeconds] = useState(25 * 60);
  const [pomodoroTotal, setPomodoroTotal] = useState(25 * 60);
  const [isPomodoroRunning, setIsPomodoroRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRunTemplateId, setActiveRunTemplateId] = useState<string | null>(null);
  const [lastTemplateName, setLastTemplateName] = useState<string>("");
  const [lastFocusMinutes, setLastFocusMinutes] = useState(0);
  const [todayFocusMinutesSnapshot, setTodayFocusMinutesSnapshot] = useState(0);
  const [templateFocusMinutesSnapshot, setTemplateFocusMinutesSnapshot] = useState(0);
  const [isPomodoroFullscreen, setIsPomodoroFullscreen] = useState(false);
  const runFinalizeGuardRef = useRef(false);
  const [nervCollapsed, setNervCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = localStorage.getItem(NERV_COLLAPSE_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1";
  });
  const [wrongQuestionStats, setWrongQuestionStats] = useState<WrongQuestionStats | null>(null);

  const refreshTasksSilently = useCallback(() => {
    fetchDashboardStats()
      .then((stats) => {
        setTasks(stats.tasks || []);
      })
      .catch(() => {});
  }, []);

  const refreshTemplatesSilently = useCallback(() => {
    fetchFocusTemplates(false)
      .then((rows) => setFocusTemplates(rows))
      .catch(() => {});
  }, []);

  const refreshWrongQuestionStats = useCallback(() => {
    fetchWrongQuestionStats()
      .then((rows) => setWrongQuestionStats(rows))
      .catch(() => setWrongQuestionStats(null));
  }, []);

  useEffect(() => {
    const onSettingsUpdated = () => {
      setExamSettings(getSettings());
    };
    window.addEventListener("eva:settings-updated", onSettingsUpdated);
    return () => window.removeEventListener("eva:settings-updated", onSettingsUpdated);
  }, []);

  // Load tasks from dataService
  useEffect(() => {
    refreshTasksSilently();
    refreshTemplatesSilently();
    refreshWrongQuestionStats();
    FocusService.getAll().then((sessions) => {
      const mapped: AttendanceMap = {};
      Object.values(sessions).forEach((s) => {
        mapped[s.date] = {
          checkedInAt: s.checked_in_at || undefined,
          checkedOutAt: s.checked_out_at || undefined,
          totalFocusSeconds: s.total_focus_seconds || 0,
          activeTaskId: s.active_task_id || undefined,
        };
      });
      if (Object.keys(mapped).length > 0) setAttendanceMap(mapped);
    }).catch(() => {});
  }, [refreshTasksSilently, refreshTemplatesSilently, refreshWrongQuestionStats]);

  useSync("SYNC_TASKS", refreshTasksSilently);
  useSync("SYNC_FOCUS_TEMPLATES", refreshTemplatesSilently);
  useSync("SYNC_WRONG_QUESTIONS", refreshWrongQuestionStats);
  useSync("SYNC_WEEKLY_REVIEW_ITEMS", refreshWrongQuestionStats);

  const todayTasks = useMemo(() => tasks.filter((task) => task.date === today), [tasks, today]);
  const pendingTasks = useMemo(() => todayTasks.filter((task) => task.status !== "done"), [todayTasks]);
  const doneTasks = useMemo(() => todayTasks.filter((task) => task.status === "done"), [todayTasks]);
  const selectedPomodoroTask = useMemo(
    () => todayTasks.find((task) => task.id === selectedPomodoroTaskId) || null,
    [selectedPomodoroTaskId, todayTasks]
  );
  const selectedTemplate = useMemo(
    () => focusTemplates.find((template) => template.id === selectedTemplateId) || null,
    [focusTemplates, selectedTemplateId]
  );

  const refreshFocusSnapshots = useCallback(async (templateId?: string | null) => {
    try {
      const [tagStats, templateStats] = await Promise.all([
        fetchFocusStats({ startDate: today, endDate: today, dimension: "tag" }),
        fetchFocusStats({ startDate: today, endDate: today, dimension: "template" }),
      ]);
      setTodayFocusMinutesSnapshot(tagStats.summary.total_focus_minutes || 0);

      if (!templateId) {
        setTemplateFocusMinutesSnapshot(0);
        return;
      }

      const templateName = focusTemplates.find((item) => item.id === templateId)?.name;
      if (!templateName) {
        setTemplateFocusMinutesSnapshot(0);
        return;
      }

      const matched = templateStats.slices.find((slice) => slice.key === templateName);
      setTemplateFocusMinutesSnapshot(matched?.minutes || 0);
    } catch {
      setTodayFocusMinutesSnapshot(0);
      setTemplateFocusMinutesSnapshot(0);
    }
  }, [focusTemplates, today]);

  const todayAttendance = attendanceMap[today] || defaultAttendance();
  const isCheckedIn = Boolean(todayAttendance.checkedInAt);
  const sessionSeconds = isCheckedIn && todayAttendance.checkedInAt
    ? Math.max(0, Math.floor((sessionNow - new Date(todayAttendance.checkedInAt).getTime()) / 1000))
    : 0;
  const todayFocusSeconds = todayAttendance.totalFocusSeconds + sessionSeconds;

  const targetExamDate = useMemo(() => examSettings.examDate || "2026-12-20", [examSettings.examDate]);
  const targetExamIso = useMemo(() => `${targetExamDate}T00:00:00`, [targetExamDate]);
  const timeLeft = useMemo(() => getCountdown(targetExamIso), [targetExamIso, countdownNow]);

  /* ── Timers ── */
  useEffect(() => {
    const countdownTimer = setInterval(() => {
      setCountdownNow(Date.now());
    }, 30_000);
    window.addEventListener("focus", refreshTasksSilently);
    return () => { clearInterval(countdownTimer); window.removeEventListener("focus", refreshTasksSilently); };
  }, [refreshTasksSilently]);

  useEffect(() => {
    if (!isCheckedIn) return;
    const sessionTimer = setInterval(() => setSessionNow(Date.now()), 1000);
    return () => clearInterval(sessionTimer);
  }, [isCheckedIn]);

  useEffect(() => { localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(attendanceMap)); }, [attendanceMap]);
  useEffect(() => {
    localStorage.setItem(NERV_COLLAPSE_STORAGE_KEY, nervCollapsed ? "1" : "0");
  }, [nervCollapsed]);

  useEffect(() => {
    if (!isPomodoroRunning || pomodoroSeconds <= 0) return;
    const timer = setInterval(() => {
      setPomodoroSeconds((prev) => {
        if (prev <= 1) { clearInterval(timer); setIsPomodoroRunning(false); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isPomodoroRunning, pomodoroSeconds]);

  useEffect(() => {
    if (pomodoroMode !== "template") return;
    if (!selectedTemplate) return;
    const seconds = Math.max(1, selectedTemplate.duration_minutes) * 60;
    setPomodoroTotal(seconds);
    setPomodoroSeconds(seconds);
  }, [pomodoroMode, selectedTemplate]);

  useEffect(() => {
    if (pomodoroMode !== "task") return;
    if (!selectedPomodoroTask) return;
    const seconds = Math.max(1, selectedPomodoroTask.timerDuration || 25) * 60;
    setPomodoroTotal(seconds);
    setPomodoroSeconds(seconds);
  }, [pomodoroMode, selectedPomodoroTask]);

  /* ── Attendance ── */
  const updateTodayAttendance = (patch: Partial<DailyAttendance>) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [today]: { ...(prev[today] || defaultAttendance()), ...patch },
    }));
  };

  const handleCheckInOut = () => {
    const nowIso = new Date().toISOString();
    if (isCheckedIn && todayAttendance.checkedInAt) {
      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(todayAttendance.checkedInAt).getTime()) / 1000));
      updateTodayAttendance({ checkedInAt: undefined, checkedOutAt: nowIso, totalFocusSeconds: todayAttendance.totalFocusSeconds + elapsed });
      return;
    }
    const nextTaskId = selectedTaskId || todayAttendance.activeTaskId || pendingTasks[0]?.id;
    updateTodayAttendance({ checkedInAt: nowIso, checkedOutAt: undefined, activeTaskId: nextTaskId });
  };

  const toggleTaskDone = (taskId: string) => {
    setTasks((prev) => {
      const updated = prev.map((task) => task.id === taskId ? { ...task, status: (task.status === "done" ? "todo" : "done") as LegacyTask["status"] } : task);
      // Persist via TaskService
      const changedTask = updated.find(t => t.id === taskId);
      if (changedTask) {
        modifyTask(taskId, changedTask).catch(console.warn);
      }
      return updated;
    });
  };

  // Persist attendance (localStorage fallback always, plus FocusService for Tauri)
  useEffect(() => {
    localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(attendanceMap));
    const session = attendanceMap[today];
    if (!session) return;
    FocusService.upsert({
      id: `session-${today}`,
      date: today,
      checked_in_at: session.checkedInAt || null,
      checked_out_at: session.checkedOutAt || null,
      total_focus_seconds: session.totalFocusSeconds,
      active_task_id: session.activeTaskId || null,
    }).catch(() => {});
  }, [attendanceMap]);

  /* ── Formatters ── */
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

  /* ── Streak ── */
  const streak = useMemo(() => {
    let days = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const seconds = dateStr === today ? todayFocusSeconds : (attendanceMap[dateStr]?.totalFocusSeconds || 0);
      if (seconds > 0) days++; else break;
    }
    return days;
  }, [attendanceMap, todayFocusSeconds, today]);

  /* ── Weekly total ── */
  const weeklyFocusHours = useMemo(() => {
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const seconds = dateStr === today ? todayFocusSeconds : (attendanceMap[dateStr]?.totalFocusSeconds || 0);
      total += seconds;
    }
    return Number((total / 3600).toFixed(1));
  }, [attendanceMap, todayFocusSeconds, today]);

  const focusStats = useMemo(() => {
    let total7 = 0;
    let best = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const seconds = dateStr === today ? todayFocusSeconds : (attendanceMap[dateStr]?.totalFocusSeconds || 0);
      total7 += seconds;
      best = Math.max(best, seconds);
    }
    return {
      avg7h: Number((total7 / 7 / 3600).toFixed(1)),
      bestDayH: Number((best / 3600).toFixed(1)),
      trend: Number(((todayFocusSeconds / 3600) - (total7 / 7 / 3600)).toFixed(1)),
    };
  }, [attendanceMap, today, todayFocusSeconds]);

  /* ── Active task name ── */
  const activeTaskTitle = useMemo(() => {
    if (pomodoroMode === "template" && selectedTemplate) {
      return selectedTemplate.name;
    }
    if (pomodoroMode === "task") {
      const task = selectedPomodoroTask || pendingTasks[0];
      if (task) return task.title;
    }
    const tid = selectedTaskId || todayAttendance.activeTaskId || pendingTasks[0]?.id;
    return todayTasks.find(t => t.id === tid)?.title || pendingTasks[0]?.title || "";
  }, [
    pendingTasks,
    pomodoroMode,
    selectedPomodoroTask,
    selectedTaskId,
    selectedTemplate,
    todayAttendance.activeTaskId,
    todayTasks,
  ]);

  const examCountdownDays = useMemo(() => {
    if (!examSettings.examDate) return 0;
    const examDate = new Date(`${examSettings.examDate}T00:00:00`);
    if (Number.isNaN(examDate.getTime())) return 0;
    const diff = examDate.getTime() - countdownNow;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [examSettings.examDate, countdownNow]);

  const hasExamGoalConfigured = useMemo(() => {
    return Boolean(examSettings.targetUniversity?.trim() && examSettings.examDate?.trim());
  }, [examSettings.examDate, examSettings.targetUniversity]);

  const subjectProgress = useMemo<SubjectProgress[]>(() => {
    const statsMap = new Map<SubjectProgress["key"], { done: number; total: number }>();
    SUBJECT_RULES.forEach((item) => {
      statsMap.set(item.key, { done: 0, total: 0 });
    });

    const normalize = (raw: string) => raw.trim().toLowerCase();

    for (const task of tasks) {
      const title = normalize(task.title || "");
      const tags = (task.tags || []).map(normalize);
      const mergedText = `${title} ${tags.join(" ")}`;

      SUBJECT_RULES.forEach((rule) => {
        const matched = rule.keywords.some((keyword) => mergedText.includes(normalize(keyword)));
        if (!matched) return;

        const current = statsMap.get(rule.key);
        if (!current) return;
        current.total += 1;
        if (task.status === "done") current.done += 1;
      });
    }

    return SUBJECT_RULES.map((rule) => {
      const subjectStat = statsMap.get(rule.key) || { done: 0, total: 0 };
      const progress = subjectStat.total > 0
        ? Math.round((subjectStat.done / subjectStat.total) * 100)
        : 0;

      const targetScore =
        rule.key === "major"
          ? examSettings.targetScores.major
          : rule.key === "math"
            ? examSettings.targetScores.math
            : rule.key === "english"
              ? examSettings.targetScores.english
              : examSettings.targetScores.politics;

      return {
        key: rule.key,
        label: rule.label,
        targetScore,
        done: subjectStat.done,
        total: subjectStat.total,
        progress,
        barClass: rule.barClass,
        glowClass: rule.glowClass,
      };
    });
  }, [examSettings.targetScores, tasks]);

  /* ── Set pomodoro preset ── */
  const setPomodoroPreset = (minutes: number) => {
    setPomodoroSeconds(minutes * 60);
    setPomodoroTotal(minutes * 60);
  };

  const finishDashboardRun = useCallback(async (
    status: "completed" | "aborted",
    explicitSeconds?: number
  ) => {
    if (!activeRunId || runFinalizeGuardRef.current) return;
    runFinalizeGuardRef.current = true;
    const actualSeconds = typeof explicitSeconds === "number"
      ? Math.max(0, explicitSeconds)
      : Math.max(0, pomodoroTotal - pomodoroSeconds);

    try {
      await finishFocusRun(activeRunId, {
        actual_seconds: actualSeconds,
        status,
      });
      const minutes = Math.floor(actualSeconds / 60);
      setLastFocusMinutes(minutes);
      await refreshFocusSnapshots(activeRunTemplateId);
    } catch (error) {
      console.warn("finish dashboard focus run failed:", error);
    } finally {
      setActiveRunId(null);
      setActiveRunTemplateId(null);
      runFinalizeGuardRef.current = false;
    }
  }, [activeRunId, activeRunTemplateId, pomodoroSeconds, pomodoroTotal, refreshFocusSnapshots]);

  useEffect(() => {
    if (pomodoroSeconds !== 0) return;
    if (isPomodoroRunning) return;
    if (!activeRunId) return;
    void finishDashboardRun("completed", pomodoroTotal);
  }, [activeRunId, finishDashboardRun, isPomodoroRunning, pomodoroSeconds, pomodoroTotal]);

  const handlePomodoroToggle = async () => {
    if (isPomodoroRunning) {
      setIsPomodoroRunning(false);
      return;
    }

    if (!activeRunId) {
      let payloadTemplateId: string | null = null;
      let payloadTaskId: string | null = null;
      let payloadTimerType: "pomodoro" | "countdown" = "pomodoro";
      let payloadTags: string[] = [];

      if (pomodoroMode === "template") {
        if (!selectedTemplate) return;
        payloadTemplateId = selectedTemplate.id;
        payloadTimerType = selectedTemplate.timer_type;
        payloadTags = parseFocusTemplateTags(selectedTemplate);
      } else if (pomodoroMode === "task") {
        const task = selectedPomodoroTask || pendingTasks[0] || null;
        if (!task) return;
        payloadTaskId = task.id;
        payloadTimerType = task.timerType === "countdown" ? "countdown" : "pomodoro";
        payloadTags = task.tags || [];

        if (task.status === "todo") {
          const nextTask = { ...task, status: "in-progress" as LegacyTask["status"] };
          setTasks((prev) => prev.map((item) => (item.id === task.id ? nextTask : item)));
          modifyTask(task.id, nextTask).catch(() => {});
        }
      }

      try {
        const run = await startFocusRun({
          source: "dashboard",
          template_id: payloadTemplateId,
          task_id: payloadTaskId,
          timer_type: payloadTimerType,
          planned_minutes: Math.max(1, Math.floor(pomodoroTotal / 60)),
          date: today,
          tags_json: JSON.stringify(payloadTags),
          note: null,
        });
        setActiveRunId(run.id);
        setActiveRunTemplateId(payloadTemplateId);
        setLastTemplateName(payloadTemplateId ? (focusTemplates.find((item) => item.id === payloadTemplateId)?.name || "") : "");
      } catch (error) {
        console.warn("start dashboard focus run failed:", error);
        return;
      }
    }

    setIsPomodoroRunning(true);
  };

  const handlePomodoroReset = async () => {
    setIsPomodoroRunning(false);
    if (activeRunId) {
      await finishDashboardRun("aborted", Math.max(0, pomodoroTotal - pomodoroSeconds));
    }
    setPomodoroSeconds(pomodoroTotal);
  };

  /* ═══ Fullscreen Mode ═══ */
  if (isPomodoroFullscreen) {
    return (
      <FullscreenPomodoro
        seconds={pomodoroSeconds}
        isRunning={isPomodoroRunning}
        taskTitle={activeTaskTitle}
        totalSeconds={pomodoroTotal}
        onToggle={() => void handlePomodoroToggle()}
        onReset={() => { void handlePomodoroReset(); }}
        onExit={() => setIsPomodoroFullscreen(false)}
      />
    );
  }

  /* ═══ Main Dashboard Layout ═══ */
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      {/* ─── Header ─── */}
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
            <span className="font-mono font-semibold text-gray-900 dark:text-white">{targetExamDate.replace(/-/g, ".")}</span>
          </div>
          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[#FF9900] tracking-tighter">{timeLeft.days}</span>
            <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Days</span>
          </div>
        </div>
      </header>

      {/* ─── Row 1: Check-in | Pomodoro | Task Pie ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Check-in Card */}
        <div className="glass-card rounded-3xl p-6 flex flex-col gap-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-[#88B5D3]" />
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">学习班次签到</h3>
            <span className={cn("px-2.5 py-1 text-[10px] rounded-full font-semibold", isCheckedIn ? "bg-emerald-500/15 text-emerald-500" : "bg-gray-500/15 text-gray-500")}>{isCheckedIn ? "进行中" : "未开始"}</span>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-gray-500 dark:text-gray-400">关联当日任务</label>
            <select value={selectedTaskId} onChange={(e) => setSelectedTaskId(e.target.value)} className="w-full bg-white/90 dark:bg-[#0f1826]/80 border border-gray-200/80 dark:border-[#30435c] rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white">
              <option value="">自动选择首个未完成任务</option>
              {todayTasks.map((task) => (<option key={task.id} value={task.id}>{task.title}</option>))}
            </select>
          </div>
          <div className="text-center py-1">
            <div className={cn("text-4xl font-mono font-bold tracking-tighter", isCheckedIn ? "text-emerald-500" : "text-gray-900 dark:text-white")}>{formatClock(todayFocusSeconds)}</div>
            <p className="text-xs text-gray-400 mt-1">今日累计专注（含本次班次）</p>
          </div>
          <button onClick={handleCheckInOut} className={cn("w-full py-3 rounded-xl font-bold text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2", isCheckedIn ? "bg-red-500 hover:bg-red-600 shadow-red-500/20" : "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20")}>
            {isCheckedIn ? (<><Square className="w-4 h-4 fill-current" />签退（结束班次）</>) : (<><Play className="w-4 h-4 fill-current" />签到（开始班次）</>)}
          </button>
        </div>

        {/* Pomodoro Card */}
        <div className="glass-card rounded-3xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <AlarmClockCheck className="w-4 h-4 text-[#88B5D3]" /> 番茄钟
            </h3>
            <button
              onClick={() => setIsPomodoroFullscreen(true)}
              className="p-1.5 text-gray-400 hover:text-[#88B5D3] hover:bg-[#88B5D3]/10 rounded-lg transition-colors"
              title="全屏沉浸模式"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              onClick={() => setPomodoroMode("template")}
              className={cn(
                "py-2 rounded-lg glass-soft hover:border-[#88B5D3]/40 transition-colors",
                pomodoroMode === "template" && "border-[#88B5D3] bg-[#88B5D3]/10 text-[#88B5D3] font-semibold"
              )}
            >
              按模板
            </button>
            <button
              onClick={() => setPomodoroMode("task")}
              className={cn(
                "py-2 rounded-lg glass-soft hover:border-[#88B5D3]/40 transition-colors",
                pomodoroMode === "task" && "border-[#88B5D3] bg-[#88B5D3]/10 text-[#88B5D3] font-semibold"
              )}
            >
              按任务
            </button>
            <button
              onClick={() => setPomodoroMode("quick")}
              className={cn(
                "py-2 rounded-lg glass-soft hover:border-[#88B5D3]/40 transition-colors",
                pomodoroMode === "quick" && "border-[#88B5D3] bg-[#88B5D3]/10 text-[#88B5D3] font-semibold"
              )}
            >
              快速启动
            </button>
          </div>

          {pomodoroMode === "template" && (
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full bg-white/90 dark:bg-[#0f1826]/80 border border-gray-200/80 dark:border-[#30435c] rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white"
            >
              <option value="">选择专注模板</option>
              {focusTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} · {template.duration_minutes}m
                </option>
              ))}
            </select>
          )}

          {pomodoroMode === "task" && (
            <select
              value={selectedPomodoroTaskId}
              onChange={(e) => setSelectedPomodoroTaskId(e.target.value)}
              className="w-full bg-white/90 dark:bg-[#0f1826]/80 border border-gray-200/80 dark:border-[#30435c] rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white"
            >
              <option value="">自动选择首个未完成任务</option>
              {todayTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          )}

          <div className="text-center">
            <div className="text-5xl font-mono font-bold text-gray-900 dark:text-white tracking-tight">{formatPomodoro(pomodoroSeconds)}</div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <button onClick={() => setPomodoroPreset(25)} className={cn("py-2 rounded-lg glass-soft hover:border-[#88B5D3]/40 transition-colors", pomodoroTotal === 25 * 60 && "border-[#88B5D3] bg-[#88B5D3]/10 text-[#88B5D3] font-semibold")}>25m</button>
            <button onClick={() => setPomodoroPreset(50)} className={cn("py-2 rounded-lg glass-soft hover:border-[#88B5D3]/40 transition-colors", pomodoroTotal === 50 * 60 && "border-[#88B5D3] bg-[#88B5D3]/10 text-[#88B5D3] font-semibold")}>50m</button>
            <button onClick={() => setPomodoroPreset(5)} className={cn("py-2 rounded-lg glass-soft hover:border-[#88B5D3]/40 transition-colors", pomodoroTotal === 5 * 60 && "border-[#88B5D3] bg-[#88B5D3]/10 text-[#88B5D3] font-semibold")}>Break</button>
            <div className="relative">
              <input
                type="number"
                min={1}
                max={180}
                placeholder="自定"
                className="w-full py-2 rounded-lg glass-soft text-center text-xs focus:outline-none focus:border-[#88B5D3] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = parseInt((e.target as HTMLInputElement).value);
                    if (val > 0 && val <= 180) setPomodoroPreset(val);
                  }
                }}
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (val > 0 && val <= 180) setPomodoroPreset(val);
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => void handlePomodoroToggle()} className="py-2.5 rounded-xl bg-[#88B5D3] hover:bg-[#6f9fbe] text-white text-sm font-semibold">
              {isPomodoroRunning ? "暂停" : "开始"}
            </button>
            <button onClick={() => void handlePomodoroReset()} className="py-2.5 rounded-xl glass-soft text-sm font-semibold text-gray-700 dark:text-gray-200">
              重置
            </button>
          </div>
          {(lastFocusMinutes > 0 || todayFocusMinutesSnapshot > 0 || templateFocusMinutesSnapshot > 0) && (
            <div className="rounded-xl bg-[#88B5D3]/10 border border-[#88B5D3]/25 px-3 py-2 text-xs text-[#45617a] dark:text-[#9cc5df] space-y-1">
              <p>本次专注：{lastFocusMinutes} 分钟</p>
              <p>今日累计：{todayFocusMinutesSnapshot} 分钟</p>
              {lastTemplateName && <p>当前模板累计：{templateFocusMinutesSnapshot} 分钟</p>}
            </div>
          )}
        </div>

        {/* Task Distribution Pie */}
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
      </div>

      {/* ─── Row 2: Unified Data Board (Heatmap + NERV Stats + Streak) ─── */}
      <div className="glass-card rounded-3xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#88B5D3]/40 via-emerald-400/30 to-[#FF9900]/30" />
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-500" /> 数据大盘 · NERV 监控
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hidden sm:inline">30-Day Overview</span>
            <button
              onClick={() => setNervCollapsed((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#88B5D3] bg-[#88B5D3]/10 hover:bg-[#88B5D3]/20 transition-colors"
            >
              {nervCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              {nervCollapsed ? "展开" : "收起"}
            </button>
          </div>
        </div>
        {nervCollapsed ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-white/30 dark:border-[#88B5D3]/10 px-3 py-2 text-center">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">连胜</p>
              <p className="text-lg font-mono font-bold text-[#FF9900]">{streak}<span className="text-xs text-gray-400 ml-1">天</span></p>
            </div>
            <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-white/30 dark:border-[#88B5D3]/10 px-3 py-2 text-center">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">今日</p>
              <p className="text-lg font-mono font-bold text-emerald-500">{(todayFocusSeconds / 3600).toFixed(1)}<span className="text-xs text-gray-400 ml-1">h</span></p>
            </div>
            <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-white/30 dark:border-[#88B5D3]/10 px-3 py-2 text-center">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">本周</p>
              <p className="text-lg font-mono font-bold text-[#88B5D3]">{weeklyFocusHours}<span className="text-xs text-gray-400 ml-1">h</span></p>
            </div>
            <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-white/30 dark:border-[#88B5D3]/10 px-3 py-2 text-center">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">7日均值</p>
              <p className="text-lg font-mono font-bold text-green-500">{focusStats.avg7h}<span className="text-xs text-gray-400 ml-1">h</span></p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
            {/* Heatmap */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-500">专注热力图（近30天）</span>
                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span>少</span>
                  <div className="w-3 h-3 rounded-sm bg-gray-100 dark:bg-gray-800/60" />
                  <div className="w-3 h-3 rounded-sm bg-emerald-200/80 dark:bg-emerald-900/50" />
                  <div className="w-3 h-3 rounded-sm bg-emerald-300/80 dark:bg-emerald-700/60" />
                  <div className="w-3 h-3 rounded-sm bg-emerald-400/90 dark:bg-emerald-600/70" />
                  <div className="w-3 h-3 rounded-sm bg-emerald-500 dark:bg-emerald-500/80" />
                  <span>多</span>
                </div>
              </div>
              <HeatmapGrid attendanceMap={attendanceMap} todayFocusSeconds={todayFocusSeconds} />
            </div>
            {/* NERV Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-3 min-w-[180px]">
              <NervDataBlock label="连胜" value={streak} unit="天" accentColor="#FF9900" glowColor="#FF9900" />
              <NervDataBlock label="今日" value={(todayFocusSeconds / 3600).toFixed(1)} unit="h" accentColor="#34d399" />
              <NervDataBlock label="本周" value={weeklyFocusHours} unit="h" accentColor="#88B5D3" />
              <NervDataBlock label="7日均值" value={focusStats.avg7h} unit="h" accentColor="#22c55e" />
            </div>
          </div>
        )}
      </div>

      {/* ─── Row 3: Today's Tasks ─── */}
      <div className="glass-card rounded-3xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-[#88B5D3]" /> 当日任务勾选
          </h3>
          <Link to="/tasks" className="text-sm font-medium text-[#88B5D3] hover:text-[#75a0be] flex items-center transition-colors">
            全部任务 <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
        <div className="space-y-2 max-h-64 overflow-auto pr-1">
          {todayTasks.length === 0 ? (
            <div className="rounded-2xl glass-soft p-5 text-center text-gray-500 dark:text-gray-400">
              <p className="font-medium">今日暂无任务</p>
              <Link to="/tasks" className="inline-flex mt-2 text-xs text-[#88B5D3] hover:text-[#6f9fbe] transition-colors">去创建今天的第一个任务</Link>
            </div>
          ) : (
            todayTasks.map((task) => (
              <button key={task.id} onClick={() => toggleTaskDone(task.id)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl glass-soft hover:border-[#88B5D3]/40 transition-colors text-left">
                {task.status === "done" ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-gray-400" />}
                <span className={cn("text-sm truncate", task.status === "done" ? "line-through text-gray-400" : "text-gray-700 dark:text-gray-200")}>{task.title}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="glass-card rounded-3xl p-6 border border-[#88B5D3]/30">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">📝 错题速览</h3>
          <Link to="/error-book" className="text-sm text-[#88B5D3] hover:text-[#75a0be] transition-colors">查看错题本</Link>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
          <p>总计 <span className="font-semibold text-gray-900 dark:text-white">{wrongQuestionStats?.total_count ?? "--"}</span> 道 · 未掌握 <span className="font-semibold text-[#FF9900]">{wrongQuestionStats?.unmastered_count ?? "--"}</span> 道</p>
          <p>本周待复习：<span className="font-semibold text-[#FF9900]">{wrongQuestionStats?.weekly_pending_count ?? "--"}</span> 道 · 已完成：<span className="font-semibold text-[#88B5D3]">{wrongQuestionStats?.weekly_done_count ?? "--"}</span> 道</p>
          <p>本周新增：<span className="font-semibold text-gray-900 dark:text-white">{wrongQuestionStats?.this_week_new ?? "--"}</span> 道</p>
        </div>
        <div className="mt-4 flex gap-2">
          <Link to="/error-book?mode=review" className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#2a3b52] to-[#88B5D3] text-white text-sm font-semibold">开始复习</Link>
          <Link to="/error-book" className="px-4 py-2 rounded-xl border border-[#88B5D3]/30 text-[#88B5D3] text-sm font-semibold hover:bg-[#88B5D3]/10">查看错题本</Link>
        </div>
      </div>

      {/* ─── Row 4: Subject Progress & Exam Goal ─── */}
      <div className="glass-card rounded-3xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#7c3aed]/45 via-[#88B5D3]/50 to-[#f59e0b]/45" />

        {!hasExamGoalConfigured ? (
          <div className="rounded-2xl border border-dashed border-gray-300/80 dark:border-[#31445d] bg-white/35 dark:bg-[#111b2a]/50 p-6 text-center">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">检测到尚未设定同步率目标...</p>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">前往设置页填写目标院校、考试日期与各科目标分数后，可解锁科目进度监控面板。</p>
            <Link
              to="/settings?tab=exam"
              className="inline-flex mt-4 items-center gap-2 px-4 py-2 rounded-xl bg-[#88B5D3] hover:bg-[#6f9fbe] text-white text-sm font-semibold transition-colors"
            >
              前往设置考研目标 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                终极目标：<span className="text-[#88B5D3]">{examSettings.targetUniversity}</span>
              </h3>
              <p className="text-sm font-mono text-[#f59e0b] dark:text-[#fbbf24] tracking-wide">
                距离决战还剩 {examCountdownDays} 天
              </p>
            </div>

            <div className="space-y-4">
              {subjectProgress.map((item) => (
                <div key={item.key} className="rounded-2xl border border-white/40 dark:border-[#2a3b52] bg-white/35 dark:bg-[#111b2a]/45 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{item.label}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-semibold text-[#88B5D3]">{item.progress}%</span>
                      <span className="mx-1">|</span>
                      已完成 {item.done}/{item.total}
                      <span className="mx-1">|</span>
                      目标：{item.targetScore} 分
                    </div>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-200/80 dark:bg-[#1d2a3d] overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", item.barClass, item.glowClass)}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
