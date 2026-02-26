import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { 
  CheckCircle2, Circle, Clock, Calendar as CalendarIcon, 
  ListTodo, GitCommit, AlignLeft, Plus, MoreHorizontal,
  Tag, AlertCircle, ChevronLeft, ChevronRight, FileText,
  X, Play, Pause, RotateCcw, Bell, Repeat, Maximize2, Minimize2, Edit2,
  Upload, Zap, Sparkles, Loader2, Trash2
} from "lucide-react";
import { cn } from "../lib/utils";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { MarkdownImportService, AiService, isTauriAvailable } from "../lib/dataService";
import type { LegacyTask, ImportedTask } from "../lib/dataService";
import { bellUrl, getSettings } from "../lib/settings";
import {
  addTask,
  archiveFocusTemplate,
  createFocusTemplate,
  fetchFocusTemplates,
  fetchTasks,
  finishFocusRun,
  modifyTask,
  removeTask,
  startFocusRun,
  type FocusTemplate,
} from "../utils/apiBridge";
import { useSync } from "../hooks/useSync";

type Task = LegacyTask;

const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getDateOffsetStr = (baseDate: string, offsetDays: number) => {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const mergeUniqueTags = (first: string[], second: string[]) => {
  const merged: string[] = [];
  [...first, ...second].forEach((tag) => {
    const normalized = tag.trim();
    if (!normalized) return;
    if (merged.includes(normalized)) return;
    merged.push(normalized);
  });
  return merged;
};

const parseTemplateTags = (template: FocusTemplate | null) => {
  if (!template) return [] as string[];
  try {
    const parsed = JSON.parse(template.tags_json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((tag) => String(tag).trim())
      .filter((tag) => Boolean(tag));
  } catch {
    return [];
  }
};

type FocusPresetOption = {
  id: string;
  label: string;
  timerType: "pomodoro" | "countdown";
  durationMinutes: number;
  tags: string[];
  linkedTaskTitle?: string;
};

const FOCUS_RECENT_STORAGE_KEY = "eva.focus.recentPresets.v1";

const QUICK_FOCUS_PRESETS: FocusPresetOption[] = [
  {
    id: "quick:25",
    label: "25m 番茄",
    timerType: "pomodoro",
    durationMinutes: 25,
    tags: [],
  },
  {
    id: "quick:50",
    label: "50m 深度",
    timerType: "pomodoro",
    durationMinutes: 50,
    tags: [],
  },
  {
    id: "quick:15",
    label: "15m 冲刺",
    timerType: "pomodoro",
    durationMinutes: 15,
    tags: [],
  },
];

const loadRecentPresetIds = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FOCUS_RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    return [];
  }
};

const saveRecentPresetIds = (ids: string[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(FOCUS_RECENT_STORAGE_KEY, JSON.stringify(ids.slice(0, 3)));
};

export function Tasks() {
  const [activeTab, setActiveTab] = useState<"todo" | "calendar" | "timeline" | "gantt">("todo");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());
  const [dataLoaded, setDataLoaded] = useState(false);

  // MD Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMdContent, setImportMdContent] = useState("");
  const [importPreview, setImportPreview] = useState<ImportedTask[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // AI Inbox State
  const [showAiInbox, setShowAiInbox] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiParsedTasks, setAiParsedTasks] = useState<ImportedTask[]>([]);
  const [aiApiKey, setAiApiKey] = useState(() => getSettings().aiApiKey || localStorage.getItem("eva.ai.apiKey") || "");

  const refreshTasksSilently = useCallback(() => {
    fetchTasks()
      .then((loaded) => {
        setTasks(loaded);
      })
      .catch(() => {});
  }, []);

  const refreshTemplatesSilently = useCallback(() => {
    fetchFocusTemplates(false)
      .then((rows) => {
        setFocusTemplates(rows);
      })
      .catch(() => {});
  }, []);

  // Load tasks on mount
  useEffect(() => {
    fetchTasks().then((loaded) => {
      setTasks(loaded);
      setDataLoaded(true);
    });
    refreshTemplatesSilently();
  }, []);

  useSync("SYNC_TASKS", refreshTasksSilently);
  useSync("SYNC_FOCUS_TEMPLATES", refreshTemplatesSilently);
  
  // Add Task Modal State
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState<Partial<Task>>({
    title: "", description: "", priority: "medium", startTime: "09:00", duration: 1, tags: [], repeat: "none", repeatDays: [], timerType: "none", timerDuration: getSettings().defaultPomodoroMinutes
  });
  const [newTag, setNewTag] = useState("");
  const [quickTaskTitle, setQuickTaskTitle] = useState("");
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [cloneToast, setCloneToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [focusTemplates, setFocusTemplates] = useState<FocusTemplate[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("none");
  const [recentPresetIds, setRecentPresetIds] = useState<string[]>(() => loadRecentPresetIds());
  const [showTemplateSaveInput, setShowTemplateSaveInput] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateArchivingId, setTemplateArchivingId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const runFinalizeGuardRef = useRef(false);

  const showCloneToast = useCallback((type: "success" | "error", message: string) => {
    setCloneToast({ type, message });
    window.setTimeout(() => setCloneToast(null), 1800);
  }, []);

  const openEditModal = (task: Task) => {
    setEditingTaskId(task.id);
    setNewTask({ ...task });
    setSelectedPresetId("none");
    setShowTemplateSaveInput(false);
    setTemplateNameDraft(task.title || "");
    setIsAddingTask(true);
  };

  // Gantt State
  const [ganttUnit, setGanttUnit] = useState<"day" | "week">("day");

  // Pomodoro State
  const [activeTimerTask, setActiveTimerTask] = useState<Task | null>(null);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isPomodoroFullscreen, setIsPomodoroFullscreen] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pomodoroWidgetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Create audio element for bell
    audioRef.current = new Audio(bellUrl(getSettings().pomodoroBell));
    const refreshBell = () => {
      audioRef.current = new Audio(bellUrl(getSettings().pomodoroBell));
    };
    window.addEventListener("eva:settings-updated", refreshBell);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener("eva:settings-updated", refreshBell);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsPomodoroFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const finalizeFocusRun = useCallback(async (
    status: "completed" | "aborted",
    explicitActualSeconds?: number
  ) => {
    if (!activeRunId || runFinalizeGuardRef.current) return;

    runFinalizeGuardRef.current = true;
    const plannedSeconds = (activeTimerTask?.timerDuration || 25) * 60;
    const actualSeconds = typeof explicitActualSeconds === "number"
      ? Math.max(0, explicitActualSeconds)
      : Math.max(0, plannedSeconds - timeLeft);

    try {
      await finishFocusRun(activeRunId, {
        actual_seconds: actualSeconds,
        status,
      });
    } catch (error) {
      console.warn("finish focus run failed:", error);
    } finally {
      setActiveRunId(null);
      runFinalizeGuardRef.current = false;
    }
  }, [activeRunId, activeTimerTask?.timerDuration, timeLeft]);

  useEffect(() => {
    if (isTimerRunning && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setIsTimerRunning(false);
            audioRef.current?.play().catch(e => console.log("Audio play failed:", e));
            void finalizeFocusRun("completed", (activeTimerTask?.timerDuration || 25) * 60);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (!isTimerRunning && timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeTimerTask?.timerDuration, finalizeFocusRun, isTimerRunning, timeLeft]);

  const startTimerForTask = useCallback(async (task: Task) => {
    if (activeRunId) {
      const currentPlanned = (activeTimerTask?.timerDuration || 25) * 60;
      await finalizeFocusRun("aborted", Math.max(0, currentPlanned - timeLeft));
    }

    const payload = {
      source: "tasks" as const,
      template_id: null,
      task_id: task.id,
      timer_type: task.timerType === "countdown" ? "countdown" : "pomodoro",
      planned_minutes: task.timerDuration || 25,
      date: task.date,
      tags_json: JSON.stringify(task.tags || []),
      note: null,
    };

    try {
      const run = await startFocusRun(payload);
      setActiveRunId(run.id);
    } catch (error) {
      console.warn("start focus run failed:", error);
      setActiveRunId(null);
    }

    if (task.status === "todo") {
      const nextTask = { ...task, status: "in-progress" as Task["status"] };
      setTasks((prev) => prev.map((item) => (item.id === task.id ? nextTask : item)));
      modifyTask(task.id, nextTask).catch((error) => {
        console.warn("mark task in-progress failed:", error);
      });
    }

    setActiveTimerTask(task);
    setTimeLeft((task.timerDuration || 25) * 60);
    setIsTimerRunning(false);
  }, [
    activeRunId,
    activeTimerTask?.timerDuration,
    finalizeFocusRun,
    timeLeft,
    setTasks,
  ]);

  const toggleTimer = () => setIsTimerRunning(!isTimerRunning);
  const resetTimer = () => {
    setIsTimerRunning(false);
    if (activeTimerTask) setTimeLeft((activeTimerTask.timerDuration || 25) * 60);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const selectedDateTasks = useMemo(() => {
    return tasks.filter(t => t.date === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [tasks, selectedDate]);

  const presetOptions = useMemo<FocusPresetOption[]>(() => {
    const templateOptions = focusTemplates.map((template) => ({
      id: `template:${template.id}`,
      label: template.name,
      timerType: template.timer_type,
      durationMinutes: template.duration_minutes,
      tags: parseTemplateTags(template),
      linkedTaskTitle: template.linked_task_title || template.name,
    }));
    return [...QUICK_FOCUS_PRESETS, ...templateOptions];
  }, [focusTemplates]);

  const presetOptionMap = useMemo(() => {
    const map = new Map<string, FocusPresetOption>();
    presetOptions.forEach((option) => {
      map.set(option.id, option);
    });
    return map;
  }, [presetOptions]);

  const recentPresetOptions = useMemo(() => {
    return recentPresetIds
      .map((id) => presetOptionMap.get(id) || null)
      .filter((item): item is FocusPresetOption => Boolean(item));
  }, [presetOptionMap, recentPresetIds]);

  const rememberPreset = useCallback((presetId: string) => {
    if (!presetId || presetId === "none") return;
    setRecentPresetIds((prev) => {
      const next = [presetId, ...prev.filter((id) => id !== presetId)].slice(0, 3);
      saveRecentPresetIds(next);
      return next;
    });
  }, []);

  const forgetPreset = useCallback((presetId: string) => {
    if (!presetId) return;
    setRecentPresetIds((prev) => {
      const next = prev.filter((id) => id !== presetId);
      saveRecentPresetIds(next);
      return next;
    });
  }, []);

  const applyFocusPreset = useCallback((presetId: string) => {
    if (!presetId || presetId === "none") {
      setSelectedPresetId("none");
      return;
    }

    const preset = presetOptionMap.get(presetId);
    if (!preset) return;

    setSelectedPresetId(presetId);
    setNewTask((prev) => ({
      ...prev,
      title: prev.title?.trim() ? prev.title : (preset.linkedTaskTitle || prev.title || ""),
      timerType: preset.timerType,
      timerDuration: preset.durationMinutes,
      tags: mergeUniqueTags(preset.tags, prev.tags || []),
    }));
    rememberPreset(presetId);
  }, [presetOptionMap, rememberPreset]);

  const handleCreateTemplateFromCurrentConfig = useCallback(async () => {
    if (templateSaving) return;

    const timerType = newTask.timerType === "countdown" ? "countdown" : newTask.timerType === "pomodoro" ? "pomodoro" : null;
    if (!timerType) {
      alert("请先在专注模式中选择番茄钟或倒计时，再保存为模板。");
      return;
    }

    const now = new Date().toISOString();
    const nextTemplate: FocusTemplate = {
      id: "",
      name: (templateNameDraft || newTask.title || "未命名模板").trim(),
      timer_type: timerType,
      duration_minutes: Math.max(1, newTask.timerDuration || 25),
      tags_json: JSON.stringify(mergeUniqueTags(newTask.tags || [], [])),
      linked_task_title: (newTask.title || "").trim() || null,
      color_token: null,
      is_archived: 0,
      created_at: now,
      updated_at: now,
    };

    if (!nextTemplate.name) {
      alert("请输入模板名称。");
      return;
    }

    setTemplateSaving(true);
    try {
      const created = await createFocusTemplate(nextTemplate);
      await refreshTemplatesSilently();
      const presetId = `template:${created.id}`;
      setSelectedPresetId(presetId);
      setShowTemplateSaveInput(false);
      setTemplateNameDraft(created.name);
      rememberPreset(presetId);
      setNewTask((prev) => ({
        ...prev,
        timerType: created.timer_type,
        timerDuration: created.duration_minutes,
        tags: mergeUniqueTags(parseTemplateTags(created), prev.tags || []),
      }));
    } catch (error) {
      console.warn("Create focus template failed:", error);
    } finally {
      setTemplateSaving(false);
    }
  }, [newTask.tags, newTask.timerDuration, newTask.timerType, newTask.title, refreshTemplatesSilently, rememberPreset, templateNameDraft, templateSaving]);

  const handleArchiveTemplate = useCallback(async (template: FocusTemplate) => {
    if (templateArchivingId) return;
    const confirmed = window.confirm(`确定删除模板「${template.name}」吗？`);
    if (!confirmed) return;

    setTemplateArchivingId(template.id);
    try {
      await archiveFocusTemplate(template.id);
      const presetId = `template:${template.id}`;
      forgetPreset(presetId);
      if (selectedPresetId === presetId) {
        setSelectedPresetId("none");
      }
      await refreshTemplatesSilently();
    } catch (error) {
      console.warn("Archive focus template failed:", error);
    } finally {
      setTemplateArchivingId(null);
    }
  }, [forgetPreset, refreshTemplatesSilently, selectedPresetId, templateArchivingId]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title?.trim()) return;

    // Prevent creating tasks in the past
    const today = getTodayStr();
    if (selectedDate < today) {
      alert("不能在过去的日期创建任务，请选择今天或未来的日期。");
      return;
    }
    // If task is for today, check if task start time has already passed
    if (selectedDate === today && newTask.startTime) {
      const now = new Date();
      const [hh, mm] = newTask.startTime.split(':').map(Number);
      const taskTime = new Date();
      taskTime.setHours(hh, mm, 0, 0);
      if (taskTime.getTime() < now.getTime() - 5 * 60 * 1000) {
        // Allow 5 min grace
        const proceed = confirm("该任务的开始时间已过，是否仍然创建？");
        if (!proceed) return;
      }
    }
    
    if (editingTaskId) {
      const existing = tasks.find((item) => item.id === editingTaskId);
      if (!existing) return;
      const updatedTask = { ...existing, ...newTask, id: editingTaskId } as Task;
      setTasks(tasks.map(t => t.id === editingTaskId ? updatedTask : t));
      try {
        await modifyTask(editingTaskId, updatedTask);
      } catch (error) {
        console.warn("Update task failed:", error);
      }
    } else {
      // Handle recurring tasks
      const newTasks: Task[] = [];
      const baseTask: Task = {
        id: Date.now().toString(),
        title: newTask.title,
        description: newTask.description || "",
        status: "todo",
        priority: newTask.priority as any || "medium",
        date: selectedDate,
        startTime: newTask.startTime || "09:00",
        duration: newTask.duration || 1,
        tags: newTask.tags || [],
        repeat: newTask.repeat,
        repeatDays: newTask.repeatDays,
        timerType: newTask.timerType,
        timerDuration: newTask.timerDuration,
      };

      if (newTask.repeat === "none") {
        newTasks.push(baseTask);
      } else if (newTask.repeat === "daily") {
        // Generate for next 7 days
        for (let i = 0; i < 7; i++) {
          const d = new Date(selectedDate);
          d.setDate(d.getDate() + i);
          newTasks.push({ ...baseTask, id: `${baseTask.id}-${i}`, date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` });
        }
      } else if (newTask.repeat === "weekly" && newTask.repeatDays && newTask.repeatDays.length > 0) {
        // Generate for next 4 weeks
        for (let i = 0; i < 28; i++) {
          const d = new Date(selectedDate);
          d.setDate(d.getDate() + i);
          if (newTask.repeatDays.includes(d.getDay())) {
            newTasks.push({ ...baseTask, id: `${baseTask.id}-${i}`, date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` });
          }
        }
      } else {
        newTasks.push(baseTask);
      }
      
      setTasks([...tasks, ...newTasks]);
      try {
        await Promise.all(newTasks.map((task) => addTask(task as LegacyTask)));
      } catch (error) {
        console.warn("Create task failed:", error);
      }
    }

    setIsAddingTask(false);
    setEditingTaskId(null);
    setSelectedPresetId("none");
    setShowTemplateSaveInput(false);
    setTemplateNameDraft("");
    setNewTask({ title: "", description: "", priority: "medium", startTime: "09:00", duration: 1, tags: [], repeat: "none", repeatDays: [], timerType: "none", timerDuration: 25 });
  };

  const toggleTaskStatus = (id: string) => {
    let pendingUpdate: Task | null = null;
    setTasks(tasks.map(t => {
      if (t.id === id) {
        pendingUpdate = { ...t, status: t.status === "done" ? "todo" : "done" } as Task;
        return pendingUpdate;
      }
      return t;
    }));

    if (pendingUpdate) {
      modifyTask(id, pendingUpdate).catch((error) => {
        console.warn("Toggle task status failed:", error);
      });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch(priority) {
      case "high": return "text-red-600 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-500/10 dark:border-red-500/30";
      case "medium": return "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30";
      case "low": return "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30";
      default: return "text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-700";
    }
  };

  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };

  const toggleRepeatDay = (day: number) => {
    const current = newTask.repeatDays || [];
    if (current.includes(day)) {
      setNewTask({ ...newTask, repeatDays: current.filter(d => d !== day) });
    } else {
      setNewTask({ ...newTask, repeatDays: [...current, day] });
    }
  };

  const handleQuickAddTask = async () => {
    if (!quickTaskTitle.trim()) return;
    const today = getTodayStr();
    if (selectedDate < today) {
      alert("不能在过去的日期创建任务");
      return;
    }
    const task: Task = {
      id: Date.now().toString(),
      title: quickTaskTitle.trim(),
      description: "",
      status: "todo",
      priority: "medium",
      date: selectedDate,
      startTime: "09:00",
      duration: 1,
      tags: [],
      repeat: "none",
      timerType: "none",
      timerDuration: 25,
    };
    setTasks(prev => [task, ...prev]);
    try {
      await addTask(task as LegacyTask);
    } catch (error) {
      console.warn("Quick add task failed:", error);
    }
    setQuickTaskTitle("");
  };

  const handleCloneYesterdayTasks = async () => {
    const sourceDate = getDateOffsetStr(selectedDate, -1);
    try {
      const sourceTasks = await fetchTasks(sourceDate);
      if (!sourceTasks.length) {
        showCloneToast("error", "昨日无可克隆任务");
        return;
      }

      const now = Date.now();
      const clonedTasks: Task[] = sourceTasks.map((task, index) => ({
        ...task,
        id: `${now}-clone-${index}-${Math.random().toString(36).slice(2, 8)}`,
        date: selectedDate,
        status: "todo",
        repeat: "none",
      }));

      await Promise.all(clonedTasks.map((task) => addTask(task as LegacyTask)));
      const updated = await fetchTasks();
      setTasks(updated);
      showCloneToast("success", `已克隆 ${clonedTasks.length} 个昨日任务`);
    } catch (error) {
      console.warn("Clone yesterday tasks failed:", error);
      showCloneToast("error", "克隆失败，请稍后重试");
    }
  };

  const postponeTaskOneDay = (id: string) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== id) return task;
      const d = new Date(task.date);
      d.setDate(d.getDate() + 1);
      const updated = {
        ...task,
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      };
      modifyTask(id, updated as LegacyTask).catch((error) => {
        console.warn("Postpone task failed:", error);
      });
      return updated;
    }));
  };

  const handleDeleteTask = async (id: string) => {
    setDeletingTaskId(id);
  };
  const confirmDeleteTask = async () => {
    if (!deletingTaskId) return;
    await removeTask(deletingTaskId);
    setTasks(prev => prev.filter(t => t.id !== deletingTaskId));
    setDeletingTaskId(null);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const ctrlOrCmd = event.ctrlKey || event.metaKey;
      if (!ctrlOrCmd) return;

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        setEditingTaskId(null);
        setShowAdvancedFields(false);
        setSelectedPresetId("none");
        setShowTemplateSaveInput(false);
        setTemplateNameDraft("");
        setIsAddingTask(true);
      }

      if (event.key === "Enter" && isAddingTask) {
        event.preventDefault();
        const form = document.getElementById("task-form") as HTMLFormElement | null;
        form?.requestSubmit();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAddingTask]);

  // Persist tasks via dataService whenever they change (after initial load)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (!dataLoaded) return;
    // We sync individual operations via apiBridge in handlers,
    // but also persist full array for localStorage fallback
    if (!isTauriAvailable()) {
      localStorage.setItem("qcb.tasks.v1", JSON.stringify(tasks));
    }
  }, [tasks, dataLoaded]);

  // ── MD Import Handlers ──
  const handleImportFileSelect = async () => {
    if (isTauriAvailable()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const filePath = await open({ multiple: false, filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }] });
        if (filePath && typeof filePath === "string") {
          setImportLoading(true);
          const report = await MarkdownImportService.parseFile(filePath);
          setImportPreview(report.tasks);
          setImportLoading(false);
        }
      } catch (e) {
        console.error("File picker failed:", e);
        setImportLoading(false);
      }
    }
  };

  const handleImportParse = async () => {
    if (!importMdContent.trim()) return;
    setImportLoading(true);
    const report = await MarkdownImportService.parseContent(importMdContent);
    setImportPreview(report.tasks);
    setImportLoading(false);
  };

  const handleImportConfirm = async () => {
    if (importPreview.length === 0) return;
    setImportLoading(true);
    const count = await MarkdownImportService.importTasks(importPreview);
    // Reload tasks
    const updated = await fetchTasks();
    setTasks(updated);
    setImportResult(`成功导入 ${count} 个任务`);
    setImportLoading(false);
    setTimeout(() => { setShowImportModal(false); setImportPreview([]); setImportMdContent(""); setImportResult(null); }, 2000);
  };

  // ── AI Inbox Handlers ──
  const handleAiParse = async () => {
    if (!aiInput.trim() || !aiApiKey.trim()) return;
    localStorage.setItem("eva.ai.apiKey", aiApiKey);
    setAiLoading(true);
    try {
      const parsed = await AiService.parseNaturalLanguageTasks(aiInput, aiApiKey);
      setAiParsedTasks(parsed);
    } catch (e) {
      console.error("AI parse failed:", e);
    }
    setAiLoading(false);
  };

  const handleAiConfirm = async () => {
    if (aiParsedTasks.length === 0) return;
    const count = await MarkdownImportService.importTasks(aiParsedTasks);
    const updated = await fetchTasks();
    setTasks(updated);
    setShowAiInbox(false);
    setAiInput("");
    setAiParsedTasks([]);
  };

  const togglePomodoroFullscreen = async () => {
    if (!isPomodoroFullscreen) {
      const requestFullscreen = pomodoroWidgetRef.current?.requestFullscreen;
      if (requestFullscreen) {
        try {
          await requestFullscreen.call(pomodoroWidgetRef.current);
          return;
        } catch {
          setIsPomodoroFullscreen(true);
          return;
        }
      }
      setIsPomodoroFullscreen(true);
      return;
    }

    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
        return;
      } catch {
        setIsPomodoroFullscreen(false);
        return;
      }
    }

    setIsPomodoroFullscreen(false);
  };

  const closePomodoroWidget = async () => {
    if (activeRunId) {
      const planned = (activeTimerTask?.timerDuration || 25) * 60;
      await finalizeFocusRun("aborted", Math.max(0, planned - timeLeft));
    }
    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        // noop
      }
    }
    setActiveTimerTask(null);
    setIsPomodoroFullscreen(false);
    setIsTimerRunning(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out relative">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">任务与计划</h1>
          <p className="mt-3 text-lg text-gray-600 dark:text-gray-400 leading-relaxed">管理你的待办事项、日程安排和项目进度。</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAiInbox(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold bg-gradient-to-r from-purple-500/10 to-[#88B5D3]/10 border border-purple-300/30 dark:border-purple-500/20 text-purple-600 dark:text-purple-300 hover:from-purple-500/20 hover:to-[#88B5D3]/20 transition-all"
          >
            <Sparkles className="w-4 h-4" /> 闪电灵感
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold bg-white/90 dark:bg-[#111b29]/85 border border-[#88B5D3]/35 hover:bg-[#88B5D3]/10 text-[#88B5D3] transition-all"
          >
            <Upload className="w-4 h-4" /> 导入 MD 计划
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 p-1 glass-soft rounded-2xl w-fit overflow-x-auto max-w-full">
        <button
          onClick={() => setActiveTab("todo")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap",
            activeTab === "todo" ? "bg-white/90 dark:bg-[#111b29]/90 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white"
          )}
        >
          <ListTodo className="w-4 h-4" />
          To-Do List
        </button>
        <button
          onClick={() => setActiveTab("calendar")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap",
            activeTab === "calendar" ? "bg-white/90 dark:bg-[#111b29]/90 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white"
          )}
        >
          <CalendarIcon className="w-4 h-4" />
          日历视图
        </button>
        <button
          onClick={() => setActiveTab("timeline")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap",
            activeTab === "timeline" ? "bg-white/90 dark:bg-[#111b29]/90 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white"
          )}
        >
          <GitCommit className="w-4 h-4" />
          时间轴
        </button>
        <button
          onClick={() => setActiveTab("gantt")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap",
            activeTab === "gantt" ? "bg-white/90 dark:bg-[#111b29]/90 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white"
          )}
        >
          <AlignLeft className="w-4 h-4" />
          甘特图
        </button>
      </div>

      {/* Content Area */}
      <div className="glass-card rounded-3xl p-6 md:p-8 min-h-[500px]">
        
        {/* To-Do List View */}
        {activeTab === "todo" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between glass-soft p-4 rounded-2xl">
              <button onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"><ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" /></button>
              <div className="flex flex-col items-center">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{selectedDate === getTodayStr() ? "今天" : selectedDate}</h3>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{selectedDateTasks.length} 个任务</p>
              </div>
              <button onClick={() => changeDate(1)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"><ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300" /></button>
            </div>

            {!isAddingTask ? (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    value={quickTaskTitle}
                    onChange={(e) => setQuickTaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleQuickAddTask();
                      }
                    }}
                    placeholder="快速添加任务（回车即创建）"
                    className="flex-1 bg-white/90 dark:bg-[#0f1826]/80 border border-gray-200/80 dark:border-[#30435c] rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#88B5D3]/25 focus:border-[#88B5D3]"
                  />
                  <button
                    onClick={handleQuickAddTask}
                    className="px-5 py-3 rounded-xl bg-[#88B5D3] hover:bg-[#6f9fbe] text-white text-sm font-semibold transition-colors"
                  >
                    一键创建
                  </button>
                  <button
                    onClick={handleCloneYesterdayTasks}
                    className="px-5 py-3 rounded-xl bg-white/90 dark:bg-[#111b29]/85 border border-[#88B5D3]/35 hover:bg-[#88B5D3]/10 text-[#88B5D3] text-sm font-semibold transition-all"
                  >
                    一键克隆昨日任务
                  </button>
                </div>
                <button 
                  onClick={() => {
                    setEditingTaskId(null);
                    setSelectedPresetId("none");
                    setShowTemplateSaveInput(false);
                    setTemplateNameDraft("");
                    setIsAddingTask(true);
                  }}
                  className="w-full py-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl text-gray-500 dark:text-gray-400 font-medium hover:border-[#88B5D3] dark:hover:border-[#88B5D3] hover:text-[#88B5D3] dark:hover:text-[#88B5D3] hover:bg-[#88B5D3]/8 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" /> 打开完整任务表单（Ctrl/Cmd + N）
                </button>
              </div>
            ) : (
              <form id="task-form" onSubmit={handleAddTask} className="glass-soft p-6 rounded-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold text-gray-900 dark:text-white">新建任务 ({selectedDate}) · Ctrl/Cmd + Enter 保存</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingTask(false);
                      setEditingTaskId(null);
                      setSelectedPresetId("none");
                      setShowTemplateSaveInput(false);
                      setTemplateNameDraft("");
                    }}
                    className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <input 
                  type="text" 
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="任务标题..." 
                  className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  autoFocus
                />
                
                <textarea 
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="可选备注（留空也可保存）" 
                  className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none h-20"
                />

                <button
                  type="button"
                  onClick={() => setShowAdvancedFields(!showAdvancedFields)}
                  className="text-xs font-semibold text-[#88B5D3] hover:text-[#6f9fbe] transition-colors"
                >
                  {showAdvancedFields ? "收起高级设置" : "展开高级设置（可选）"}
                </button>

                {showAdvancedFields && <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">开始时间</label>
                    <input type="time" value={newTask.startTime} onChange={(e) => setNewTask({...newTask, startTime: e.target.value})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">预计耗时 (小时)</label>
                    <input type="number" min="0.5" step="0.5" value={newTask.duration} onChange={(e) => setNewTask({...newTask, duration: parseFloat(e.target.value)})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">重要程度</label>
                    <select value={newTask.priority} onChange={(e) => setNewTask({...newTask, priority: e.target.value as any})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500">
                      <option value="low">低</option>
                      <option value="medium">中</option>
                      <option value="high">高</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">标签</label>
                    <div className="flex gap-2">
                      <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (newTag.trim() && !newTask.tags?.includes(newTag.trim())) {
                            setNewTask({...newTask, tags: [...(newTask.tags || []), newTag.trim()]});
                            setNewTag("");
                          }
                        }
                      }} placeholder="按回车添加" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500" />
                    </div>
                  </div>
                </div>}

                {/* Advanced Options: Focus Preset + Repeat + Timer */}
                {showAdvancedFields && <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-gray-800">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">专注预设</label>
                    <select
                      value={selectedPresetId}
                      onChange={(e) => applyFocusPreset(e.target.value)}
                      className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#88B5D3]"
                    >
                      <option value="none">无</option>
                      <optgroup label="快捷预设">
                        {QUICK_FOCUS_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="我的模板">
                        {focusTemplates.map((template) => (
                          <option key={template.id} value={`template:${template.id}`}>
                            {template.name} · {template.duration_minutes}m
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">选中后会自动填充计时类型、时长和标签</p>

                    {recentPresetOptions.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">最近使用</span>
                        {recentPresetOptions.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => applyFocusPreset(preset.id)}
                            className="text-xs px-2.5 py-1 rounded-lg border border-[#88B5D3]/35 text-[#88B5D3] hover:bg-[#88B5D3]/10 transition-colors"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {focusTemplates.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-[11px] text-gray-400 dark:text-gray-500">模板管理</p>
                        <div className="space-y-1.5 max-h-28 overflow-auto pr-1">
                          {focusTemplates.map((template) => (
                            <div
                              key={template.id}
                              className="flex items-center justify-between rounded-lg border border-gray-200/80 dark:border-gray-700 px-2.5 py-1.5 text-xs"
                            >
                              <span className="text-gray-600 dark:text-gray-300 truncate pr-2">
                                {template.name} · {template.duration_minutes}m
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleArchiveTemplate(template)}
                                disabled={templateArchivingId === template.id}
                                className="text-[#2a3b52] dark:text-[#88B5D3] hover:text-[#FF9900] disabled:opacity-50 transition-colors"
                              >
                                {templateArchivingId === template.id ? "处理中" : "删除"}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">重复设置</label>
                    <select value={newTask.repeat} onChange={(e) => setNewTask({...newTask, repeat: e.target.value as any})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 mb-2">
                      <option value="none">不重复</option>
                      <option value="daily">每天</option>
                      <option value="weekly">每周</option>
                    </select>
                    {newTask.repeat === "weekly" && (
                      <div className="flex gap-1 mt-2">
                        {['日', '一', '二', '三', '四', '五', '六'].map((day, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => toggleRepeatDay(i)}
                            className={cn(
                              "w-8 h-8 rounded-full text-xs font-medium transition-colors",
                              newTask.repeatDays?.includes(i) ? "bg-indigo-600 text-white" : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                            )}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">专注模式 (番茄钟)</label>
                    <div className="flex gap-2">
                      <select value={newTask.timerType} onChange={(e) => setNewTask({...newTask, timerType: e.target.value as any})} className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500">
                        <option value="none">无</option>
                        <option value="pomodoro">番茄钟</option>
                        <option value="countdown">倒计时</option>
                      </select>
                      {newTask.timerType !== "none" && (
                        <input 
                          type="number" 
                          min="1" 
                          value={newTask.timerDuration} 
                          onChange={(e) => setNewTask({...newTask, timerDuration: parseInt(e.target.value)})} 
                          placeholder="分钟"
                          className="w-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500" 
                        />
                      )}
                    </div>
                  </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowTemplateSaveInput((prev) => !prev);
                        if (!templateNameDraft.trim()) {
                          setTemplateNameDraft(newTask.title || "");
                        }
                      }}
                      className="text-xs font-semibold text-[#88B5D3] hover:text-[#6f9fbe] transition-colors"
                    >
                      保存当前专注配置为模板
                    </button>

                    {showTemplateSaveInput && (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={templateNameDraft}
                          onChange={(e) => setTemplateNameDraft(e.target.value)}
                          placeholder="模板名（默认任务标题）"
                          className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#88B5D3]"
                        />
                        <button
                          type="button"
                          onClick={() => void handleCreateTemplateFromCurrentConfig()}
                          disabled={templateSaving}
                          className="px-4 py-2 rounded-xl bg-[#88B5D3] hover:bg-[#6f9fbe] text-white text-sm font-semibold disabled:opacity-50"
                        >
                          {templateSaving ? "保存中..." : "保存模板"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>}

                {newTask.tags && newTask.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 items-center">
                    {newTask.tags.map(tag => (
                      <span key={tag} className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 rounded-lg">
                        {tag}
                        <button type="button" onClick={() => setNewTask({...newTask, tags: newTask.tags?.filter(t => t !== tag)})} className="hover:text-indigo-900 dark:hover:text-indigo-200"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => setNewTask({ ...newTask, tags: [] })}
                      className="text-xs text-[#2a3b52] dark:text-[#88B5D3] hover:text-[#FF9900] transition-colors"
                    >
                      清空标签
                    </button>
                  </div>
                )}

                <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-800">
                  <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm active:scale-95">
                    保存任务
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-5 mt-8">
              {selectedDateTasks.length === 0 ? (
                <div className="text-center py-14 text-gray-500 dark:text-gray-400 glass-soft rounded-2xl">
                  <ListTodo className="w-12 h-12 mx-auto mb-3 opacity-30 text-[#88B5D3]" />
                  <p className="font-medium">当前暂无任务，开始你的同步率训练吧</p>
                  <p className="text-xs mt-2">可用 Ctrl/Cmd + N 快速新建任务</p>
                  <button
                    onClick={handleCloneYesterdayTasks}
                    className="mt-5 px-4 py-2.5 rounded-xl bg-[#88B5D3] hover:bg-[#6f9fbe] text-white text-sm font-semibold transition-colors"
                  >
                    一键克隆昨日任务
                  </button>
                </div>
              ) : (
                selectedDateTasks.map(task => {
                  const isOverdue = new Date(`${task.date}T${task.startTime}`).getTime() < new Date().getTime() && task.status !== "done";
                  
                  return (
                    <div key={task.id} className={cn(
                      "group flex flex-col p-5 rounded-2xl border transition-all duration-200 hover:shadow-md backdrop-blur-md",
                      task.status === "done" ? "bg-white/55 dark:bg-[#111b28]/58 border-white/45 dark:border-[#2a3b52]" : "bg-white/70 dark:bg-[#111b28]/62 border-white/60 dark:border-[#30435c] hover:border-[#88B5D3]/50",
                      isOverdue && task.status !== "done" && "border-red-200 dark:border-red-500/40 bg-red-50/30 dark:bg-red-500/10"
                    )}>
                      <div className="flex items-start gap-4">
                        <button onClick={() => toggleTaskStatus(task.id)} className="flex-shrink-0 -ml-1 mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50/70 dark:hover:bg-indigo-500/10 transition-colors">
                          {task.status === "done" ? <CheckCircle2 className="w-6 h-6 text-emerald-500" /> : <Circle className="w-6 h-6" />}
                        </button>
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex justify-between items-start">
                            <span className={cn(
                              "text-base font-semibold transition-all",
                              task.status === "done" ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-900 dark:text-white"
                            )}>
                              {task.title}
                            </span>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => openEditModal(task)}
                                className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                title="编辑任务"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteTask(task.id)}
                                className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                title="删除任务"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              {isOverdue && task.status !== "done" && (
                                <span className="text-[10px] font-bold text-red-600 dark:text-red-300 bg-red-100 dark:bg-red-500/10 px-2 py-0.5 rounded-md">已延期</span>
                              )}
                              <span className={cn("flex-shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg border", getPriorityColor(task.priority))}>
                                <AlertCircle className="w-3 h-3" />
                                {task.priority}
                              </span>
                            </div>
                          </div>
                          
                          {task.description && (
                            <p className={cn("mt-2 text-sm leading-relaxed", task.status === "done" ? "text-gray-400 dark:text-gray-500" : "text-gray-600 dark:text-gray-300")}>
                              {task.description}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                            <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-lg">
                              <Clock className="w-3.5 h-3.5" />
                              {task.startTime} ({task.duration}h)
                            </span>
                            {task.timerType !== "none" && task.status !== "done" && (
                              <button 
                                onClick={() => startTimerForTask(task)}
                                className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-300 font-medium bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 px-2.5 py-1 rounded-lg transition-colors"
                              >
                                <Play className="w-3.5 h-3.5" />
                                {task.timerDuration}m
                              </button>
                            )}
                            {task.tags.map(tag => (
                              <span key={tag} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2.5 py-1 rounded-lg">
                                <Tag className="w-3 h-3" />
                                {tag}
                              </span>
                            ))}
                            {task.status !== "done" && (
                              <button
                                onClick={() => postponeTaskOneDay(task.id)}
                                className="text-xs font-medium text-[#88B5D3] hover:text-[#6f9fbe] bg-[#88B5D3]/8 hover:bg-[#88B5D3]/14 px-2.5 py-1 rounded-lg transition-colors"
                              >
                                一键顺延 +1 天
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Calendar View */}
        {activeTab === "calendar" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {new Date(selectedDate).getFullYear()}年 {new Date(selectedDate).getMonth() + 1}月
              </h3>
              <div className="flex gap-2">
                <button onClick={() => changeDate(-30)} className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">上个月</button>
                <button onClick={() => changeDate(30)} className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">下个月</button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-px bg-white/45 dark:bg-[#0f1724]/75 rounded-2xl overflow-hidden border border-white/60 dark:border-[#2b3d54] backdrop-blur-md rei-ring">
              {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                <div key={day} className="bg-gray-50 dark:bg-gray-900 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                  {day}
                </div>
              ))}
              {Array.from({ length: 35 }).map((_, i) => {
                const d = new Date(selectedDate);
                d.setDate(1); // Go to first of month
                const startDay = d.getDay(); // Day of week of 1st
                d.setDate(i - startDay + 1); // Calculate actual date for this cell
                
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const isCurrentMonth = d.getMonth() === new Date(selectedDate).getMonth();
                const isToday = dateStr === getTodayStr();
                const isSelected = dateStr === selectedDate;
                const dayTasks = tasks.filter(t => t.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime));

                return (
                  <div 
                    key={i} 
                    onClick={() => {
                      setSelectedDate(dateStr);
                      setActiveTab("todo");
                    }}
                    className={cn(
                      "bg-white/70 dark:bg-[#111b29]/75 min-h-[120px] p-2 transition-all cursor-pointer hover:bg-[#88B5D3]/12 dark:hover:bg-[#88B5D3]/14",
                      !isCurrentMonth && "bg-gray-50/55 dark:bg-[#0d1624]/65 text-gray-400 dark:text-gray-600",
                      isSelected && "ring-2 ring-inset ring-[#88B5D3] bg-[#88B5D3]/12 dark:bg-[#88B5D3]/16"
                    )}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className={cn(
                        "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                        isToday ? "bg-indigo-600 text-white" : isSelected ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300" : isCurrentMonth ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-600"
                      )}>
                        {d.getDate()}
                      </span>
                      {dayTasks.length > 0 && (
                        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500">{dayTasks.length} 项</span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {dayTasks.slice(0, 3).map(task => (
                        <div key={task.id} className={cn(
                          "text-[10px] px-2 py-1 rounded-md truncate font-medium flex items-center gap-1.5",
                          task.status === "done" ? "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500 line-through" : "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-100/50 dark:border-indigo-500/20"
                        )} title={task.title}>
                          <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", 
                            task.priority === 'high' ? 'bg-red-500' : task.priority === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'
                          )} />
                          {task.startTime} {task.title}
                        </div>
                      ))}
                      {dayTasks.length > 3 && (
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 font-medium pl-1">
                          + {dayTasks.length - 3} 更多
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Timeline View */}
        {activeTab === "timeline" && (
          <div className="space-y-8">
            <div className="text-center mb-8">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">{selectedDate === getTodayStr() ? "今天的时间轴" : selectedDate}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">按时间顺序排列的任务</p>
            </div>
            
            <div className="max-w-3xl mx-auto">
              {selectedDateTasks.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-12">没有安排任务。</div>
              ) : (
                <div className="space-y-0">
                  {selectedDateTasks.map((task, index) => (
                    <div key={task.id} className="flex gap-4 md:gap-6 group">
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "w-4 h-4 rounded-full border-[3px] border-white dark:border-gray-900 shadow-sm z-10 mt-1.5 transition-colors",
                          task.status === "done" ? "bg-emerald-500" : task.status === "in-progress" ? "bg-amber-500" : "bg-indigo-500"
                        )} />
                        {index !== selectedDateTasks.length - 1 && (
                          <div className="w-0.5 h-full bg-gray-200 dark:bg-gray-800 my-1 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-900/50 transition-colors" />
                        )}
                      </div>
                      <div className="flex-1 pb-8">
                        <div className="bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-3 mb-3">
                            <span className="text-xs font-bold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-lg flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" />
                              {task.startTime}
                            </span>
                            <span className="text-xs font-medium text-gray-500">
                              持续 {task.duration} 小时
                            </span>
                            <span className={cn(
                              "ml-auto text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border",
                              task.status === "done" ? "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400" : 
                              task.status === "in-progress" ? "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400" : 
                              "text-indigo-700 bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-400"
                            )}>
                              {task.status.replace('-', ' ')}
                            </span>
                          </div>
                          <h4 className={cn(
                            "text-base font-semibold",
                            task.status === "done" ? "text-gray-400 line-through" : "text-gray-900 dark:text-white"
                          )}>
                            {task.title}
                          </h4>
                          {task.description && (
                            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{task.description}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Gantt Chart View */}
        {activeTab === "gantt" && (
          <div className="overflow-x-auto pb-4 gantt-scroll rounded-2xl bg-white/40 dark:bg-[#0e1622]/70 p-3 border border-white/55 dark:border-[#2a3b52] backdrop-blur-md">
            <div className={cn("min-w-[800px]", ganttUnit === "day" && "min-w-[1200px]")}>
              <div className="flex items-center justify-between mb-6 sticky left-0">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">项目甘特图</h3>
                  <p className="text-sm text-gray-500">
                    {ganttUnit === "day" ? `查看 ${selectedDate} 的详细排期` : "查看未来 7 天的任务排期"}
                  </p>
                </div>
                <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                  <button 
                    onClick={() => setGanttUnit("day")}
                    className={cn("px-3 py-1.5 text-xs font-semibold rounded-md transition-colors", ganttUnit === "day" ? "bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400")}
                  >
                    日视图 (小时)
                  </button>
                  <button 
                    onClick={() => setGanttUnit("week")}
                    className={cn("px-3 py-1.5 text-xs font-semibold rounded-md transition-colors", ganttUnit === "week" ? "bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400")}
                  >
                    周视图 (天)
                  </button>
                </div>
              </div>

              {tasks.length === 0 ? (
                <div className="text-center py-20 text-gray-500 dark:text-gray-400">
                  <AlignLeft className="w-12 h-12 mx-auto mb-3 text-[#88B5D3]/60" />
                  <p className="font-medium">当前暂无任务，甘特图会在你创建任务后自动生成</p>
                </div>
              ) : ganttUnit === "day" ? (
                // Day View (0-24 hours)
                <>
                  <div className="flex border-b border-gray-200 dark:border-gray-800 mb-4 pb-2">
                    <div className="w-64 flex-shrink-0 font-semibold text-sm text-gray-500 uppercase tracking-widest sticky left-0 bg-white dark:bg-gray-950 z-20">任务</div>
                    <div className="flex-1 flex">
                      {Array.from({ length: 24 }).map((_, i) => (
                        <div key={i} className="flex-1 text-center text-[10px] font-medium text-gray-400 border-l border-gray-100 dark:border-gray-800 first:border-l-0">
                          {i}:00
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4 relative">
                    {/* Current Time Line (Mocked for visual) */}
                    <div className="absolute top-0 bottom-0 w-px bg-red-400/90 shadow-[0_0_10px_rgba(248,113,113,0.7)] z-10" style={{ left: `calc(16rem + ${(new Date().getHours() / 24) * 100}%)` }} />
                    
                    {selectedDateTasks.map(task => {
                      const [hours, minutes] = task.startTime.split(':').map(Number);
                      const startOffset = (hours + minutes / 60) / 24;
                      const durationRatio = task.duration / 24;
                      
                      return (
                        <div key={task.id} className="flex items-center group">
                          <div className="w-64 flex-shrink-0 pr-4 sticky left-0 bg-white/90 dark:bg-[#0f1826]/95 z-20 py-1">
                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate" title={task.title}>{task.title}</div>
                            <div className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                              <span className={cn("w-1.5 h-1.5 rounded-full", task.status === 'done' ? 'bg-emerald-500' : 'bg-amber-500')} />
                              {task.startTime} ({task.duration}h)
                            </div>
                          </div>
                          <div className="flex-1 relative h-10 bg-white/55 dark:bg-[#111b29]/55 rounded-xl border border-white/65 dark:border-[#2c3f58] overflow-hidden">
                            <div className="absolute inset-0 flex">
                              {Array.from({ length: 24 }).map((_, i) => (
                                <div key={i} className="flex-1 border-l border-gray-200/50 dark:border-gray-800/50 first:border-l-0 h-full" />
                              ))}
                            </div>
                            <div 
                              className={cn(
                                "absolute top-1.5 bottom-1.5 rounded-lg shadow-sm flex items-center px-3 text-xs font-bold text-white transition-all group-hover:brightness-110 cursor-pointer overflow-hidden",
                                task.status === "done" ? "bg-emerald-500" : task.status === "in-progress" ? "bg-amber-500" : "bg-indigo-500"
                              )}
                              style={{ 
                                left: `${startOffset * 100}%`, 
                                width: `${durationRatio * 100}%`,
                                minWidth: '40px'
                              }}
                            >
                              <span className="truncate w-full">{task.title}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                // Week View (7 Days)
                <>
                  <div className="flex border-b border-gray-200 dark:border-gray-800 mb-4 pb-2">
                    <div className="w-64 flex-shrink-0 font-semibold text-sm text-gray-500 uppercase tracking-widest sticky left-0 bg-white dark:bg-gray-950 z-20">任务</div>
                    <div className="flex-1 flex">
                      {Array.from({ length: 7 }).map((_, i) => {
                        const d = new Date(selectedDate);
                        d.setDate(d.getDate() + i);
                        return (
                          <div key={i} className="flex-1 text-center text-xs font-medium text-gray-400 border-l border-gray-100 dark:border-gray-800 first:border-l-0">
                            {d.getMonth() + 1}/{d.getDate()}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-4">
                    {tasks.filter(t => {
                      const baseDate = new Date(selectedDate).getTime();
                      const taskDate = new Date(t.date).getTime();
                      const diff = (taskDate - baseDate) / (1000 * 60 * 60 * 24);
                      return diff >= 0 && diff < 7;
                    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(task => {
                      const baseDate = new Date(selectedDate).getTime();
                      const taskDate = new Date(task.date).getTime();
                      const offsetDays = (taskDate - baseDate) / (1000 * 60 * 60 * 24);
                      
                      return (
                        <div key={task.id} className="flex items-center group">
                          <div className="w-64 flex-shrink-0 pr-4 sticky left-0 bg-white/90 dark:bg-[#0f1826]/95 z-20 py-1">
                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate" title={task.title}>{task.title}</div>
                            <div className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                              <span className={cn("w-1.5 h-1.5 rounded-full", task.status === 'done' ? 'bg-emerald-500' : 'bg-amber-500')} />
                              {task.date}
                            </div>
                          </div>
                          <div className="flex-1 relative h-10 bg-white/55 dark:bg-[#111b29]/55 rounded-xl border border-white/65 dark:border-[#2c3f58] overflow-hidden">
                            <div className="absolute inset-0 flex">
                              {Array.from({ length: 7 }).map((_, i) => (
                                <div key={i} className="flex-1 border-l border-gray-200/50 dark:border-gray-800/50 first:border-l-0 h-full" />
                              ))}
                            </div>
                            <div 
                              className={cn(
                                "absolute top-1.5 bottom-1.5 rounded-lg shadow-sm flex items-center px-3 text-xs font-bold text-white transition-all group-hover:brightness-110 cursor-pointer overflow-hidden",
                                task.status === "done" ? "bg-emerald-500" : task.status === "in-progress" ? "bg-amber-500" : "bg-indigo-500"
                              )}
                              style={{ 
                                left: `${(offsetDays / 7) * 100}%`, 
                                width: `${(1 / 7) * 100}%`, // Assume 1 day for week view
                                minWidth: '40px'
                              }}
                            >
                              <span className="truncate w-full">{task.title}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Floating Pomodoro Timer Widget */}
      {activeTimerTask && (
        <div className={cn(
          "z-50 bg-white dark:bg-gray-900 shadow-2xl transition-all duration-500",
          isPomodoroFullscreen 
            ? "fixed inset-0 flex flex-col items-center justify-center p-8" 
            : "fixed bottom-6 right-6 rounded-2xl border border-gray-200/60 dark:border-gray-800 p-5 w-72 animate-in slide-in-from-bottom-8"
        )}
        ref={pomodoroWidgetRef}>
          <div className={cn(
            "flex justify-between items-start w-full",
            isPomodoroFullscreen ? "absolute top-8 left-8 right-8" : "mb-4"
          )}>
            <div>
              <h4 className={cn("font-bold text-gray-900 dark:text-white truncate", isPomodoroFullscreen ? "text-2xl max-w-2xl" : "text-sm w-48")}>
                {activeTimerTask.title}
              </h4>
              <p className={cn("text-gray-500 dark:text-gray-400 mt-0.5", isPomodoroFullscreen ? "text-lg" : "text-xs")}>
                {activeTimerTask.timerType === 'pomodoro' ? '番茄钟' : '倒计时'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => void togglePomodoroFullscreen()} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                {isPomodoroFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button onClick={() => void closePomodoroWidget()} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div className={cn("text-center", isPomodoroFullscreen ? "mb-16" : "mb-6")}>
            <div className={cn(
              "font-mono font-bold tracking-tighter transition-all",
              timeLeft === 0 ? "text-red-500 animate-pulse" : "text-gray-900 dark:text-white",
              isPomodoroFullscreen ? "text-[12rem] leading-none" : "text-5xl"
            )}>
              {formatTime(timeLeft)}
            </div>
          </div>

          <div className="flex items-center justify-center gap-6">
            <button 
              onClick={toggleTimer}
              className={cn(
                "rounded-full flex items-center justify-center text-white shadow-md transition-transform active:scale-95",
                isTimerRunning ? "bg-amber-500 hover:bg-amber-600" : "bg-indigo-600 hover:bg-indigo-700",
                isPomodoroFullscreen ? "w-24 h-24" : "w-12 h-12"
              )}
            >
              {isTimerRunning ? <Pause className={cn(isPomodoroFullscreen ? "w-10 h-10" : "w-5 h-5")} /> : <Play className={cn("ml-1", isPomodoroFullscreen ? "w-10 h-10" : "w-5 h-5")} />}
            </button>
            <button 
              onClick={resetTimer}
              className={cn(
                "rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors",
                isPomodoroFullscreen ? "w-16 h-16" : "w-10 h-10"
              )}
            >
              <RotateCcw className={cn(isPomodoroFullscreen ? "w-6 h-6" : "w-4 h-4")} />
            </button>
          </div>
        </div>
      )}

      {cloneToast && (
        <div className={cn(
          "fixed top-5 right-5 z-[70] px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg border backdrop-blur-md",
          cloneToast.type === "success"
            ? "bg-emerald-500/90 text-white border-emerald-400/70"
            : "bg-red-500/90 text-white border-red-400/70"
        )}>
          {cloneToast.message}
        </div>
      )}

      {/* ════════ MD Import Modal ════════ */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#0f1826] rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-gray-200/50 dark:border-[#2a3b52] animate-in zoom-in-95">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-[#88B5D3]" /> 导入 Markdown 计划
              </h3>
              <button onClick={() => { setShowImportModal(false); setImportPreview([]); setImportMdContent(""); }} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {isTauriAvailable() && (
                <button onClick={handleImportFileSelect} className="w-full py-4 border-2 border-dashed border-[#88B5D3]/40 rounded-2xl text-[#88B5D3] font-medium hover:bg-[#88B5D3]/5 transition-all flex items-center justify-center gap-2">
                  <FileText className="w-5 h-5" /> 从文件选择 .md
                </button>
              )}
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">或直接粘贴 Markdown 内容：</label>
                <textarea
                  value={importMdContent}
                  onChange={(e) => setImportMdContent(e.target.value)}
                  placeholder={"# 2025-06-01\\n- [ ] 复习高等数学第一章 @2025-06-01 #math #high\\n- [ ] 背英语单词 50个 #english #low\\n- [x] 完成政治选择题 #politics"}
                  className="w-full h-40 bg-gray-50 dark:bg-[#111b29] border border-gray-200 dark:border-[#30435c] rounded-xl p-4 text-sm font-mono text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-[#88B5D3]/25"
                />
                <button onClick={handleImportParse} disabled={importLoading || !importMdContent.trim()} className="mt-2 px-4 py-2 bg-[#88B5D3] hover:bg-[#6f9fbe] text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                  {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "解析预览"}
                </button>
              </div>
              {importPreview.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">解析结果 ({importPreview.length} 个任务)</h4>
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {importPreview.map((t, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50 dark:bg-[#111b29] text-sm">
                        <span className={cn("w-2 h-2 rounded-full", t.priority === "high" ? "bg-red-500" : t.priority === "low" ? "bg-emerald-500" : "bg-amber-500")} />
                        <span className="flex-1 text-gray-900 dark:text-white truncate">{t.title}</span>
                        {t.startTime && <span className="text-xs text-[#88B5D3] font-mono">{t.startTime}</span>}
                        {t.duration && <span className="text-xs text-gray-500">{t.duration}h</span>}
                        <span className="text-xs text-gray-500">{t.date}</span>
                        {t.tags.map(tag => <span key={tag} className="text-[10px] bg-[#88B5D3]/10 text-[#88B5D3] px-1.5 py-0.5 rounded">#{tag}</span>)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {importResult && <div className="text-sm font-semibold text-emerald-500 text-center py-2">{importResult}</div>}
            </div>
            {importPreview.length > 0 && !importResult && (
              <div className="p-6 border-t border-gray-200 dark:border-gray-800">
                <button onClick={handleImportConfirm} disabled={importLoading} className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-50">
                  {importLoading ? "导入中..." : `确认导入 ${importPreview.length} 个任务`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════ AI 闪电灵感 Inbox ════════ */}
      {showAiInbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#0f1826] rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-gray-200/50 dark:border-[#2a3b52] animate-in zoom-in-95">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" /> 闪电灵感 Inbox
              </h3>
              <button onClick={() => { setShowAiInbox(false); setAiParsedTasks([]); }} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                输入自然语言描述你的计划，AI 会自动解析为结构化任务。
              </p>
              {!aiApiKey && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">DeepSeek API Key</label>
                  <input
                    type="password"
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full bg-gray-50 dark:bg-[#111b29] border border-gray-200 dark:border-[#30435c] rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/25"
                  />
                </div>
              )}
              <div>
                <textarea
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="例如：明天上午复习高数极限部分，下周一开始每天背50个单词，后天交操作系统实验报告很急..."
                  className="w-full h-32 bg-gray-50 dark:bg-[#111b29] border border-gray-200 dark:border-[#30435c] rounded-xl p-4 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/25"
                />
                <button onClick={handleAiParse} disabled={aiLoading || !aiInput.trim() || !aiApiKey.trim()} className="mt-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors flex items-center gap-2">
                  {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {aiLoading ? "AI 解析中..." : "AI 解析"}
                </button>
              </div>
              {aiParsedTasks.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">AI 解析结果 ({aiParsedTasks.length} 个任务)</h4>
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {aiParsedTasks.map((t, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50 dark:bg-[#111b29] text-sm">
                        <span className={cn("w-2 h-2 rounded-full", t.priority === "high" ? "bg-red-500" : t.priority === "low" ? "bg-emerald-500" : "bg-amber-500")} />
                        <span className="flex-1 text-gray-900 dark:text-white truncate">{t.title}</span>
                        {t.startTime && <span className="text-xs text-purple-500 font-mono">{t.startTime}</span>}
                        {t.duration && <span className="text-xs text-gray-500">{t.duration}h</span>}
                        <span className="text-xs text-gray-500">{t.date}</span>
                        {t.tags.map(tag => <span key={tag} className="text-[10px] bg-purple-500/10 text-purple-500 px-1.5 py-0.5 rounded">#{tag}</span>)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {aiParsedTasks.length > 0 && (
              <div className="p-6 border-t border-gray-200 dark:border-gray-800">
                <button onClick={handleAiConfirm} className="w-full py-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-xl transition-colors">
                  确认创建 {aiParsedTasks.length} 个任务
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deletingTaskId}
        title="确认删除该任务？"
        description="删除后将无法恢复，请确认操作。"
        confirmText="删除"
        variant="danger"
        onConfirm={confirmDeleteTask}
        onCancel={() => setDeletingTaskId(null)}
      />
    </div>
  );
}
