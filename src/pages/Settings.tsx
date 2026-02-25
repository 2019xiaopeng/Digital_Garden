import { type ComponentType, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  Bell,
  Bot,
  CheckCircle2,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  FolderOpen,
  FolderSearch,
  Gauge,
  HardDrive,
  Image,
  Info,
  Keyboard,
  Key,
  Palette,
  Save,
  Shield,
  Target,
  Type,
  UserCircle2,
} from "lucide-react";
import { bellUrl, getSettings, updateSettings, type AppSettings } from "../lib/settings";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { documentDir, join } from "@tauri-apps/api/path";

type TabKey =
  | "general"
  | "appearance"
  | "ai"
  | "workspace"
  | "sync"
  | "exam"
  | "pomodoro"
  | "shortcut"
  | "privacy"
  | "about";

type NavItem = {
  key: TabKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

type StorageStats = {
  db_bytes: number;
  notes_bytes: number;
  resources_bytes: number;
  logs_bytes: number;
  total_bytes: number;
};

const navItems: NavItem[] = [
  { key: "general", label: "通用设置", icon: Gauge },
  { key: "appearance", label: "外观与主题", icon: Palette },
  { key: "ai", label: "AI 助手配置", icon: Bot },
  { key: "workspace", label: "本地工作区", icon: FolderOpen },
  { key: "sync", label: "同步与备份", icon: HardDrive },
  { key: "exam", label: "考研目标", icon: Target },
  { key: "pomodoro", label: "番茄钟与提醒", icon: AlarmClock },
  { key: "shortcut", label: "快捷键", icon: Keyboard },
  { key: "privacy", label: "隐私与安全", icon: Shield },
  { key: "about", label: "关于", icon: Info },
];

const shortcutList = [
  { keys: "Delete", desc: "删除选中的知识库文件" },
  { keys: "F2", desc: "重命名选中的文件或文件夹" },
  { keys: "Ctrl + 点击", desc: "多选知识库文件" },
  { keys: "Shift + 点击", desc: "范围多选知识库文件" },
  { keys: "Escape", desc: "关闭右键菜单 / 取消选中" },
  { keys: "拖拽文件到文件夹", desc: "移动文件到目标目录" },
  { keys: "Ctrl/Cmd + N", desc: "任务页：新建任务" },
  { keys: "Ctrl/Cmd + Enter", desc: "任务页：提交新任务（新增状态下）" },
  { keys: "Ctrl/Cmd + Shift + L", desc: "留痕页：新建留痕" },
  { keys: "Ctrl/Cmd + Enter", desc: "留痕页：保存当前留痕" },
];

export function Settings() {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [saved, setSaved] = useState(false);
  const [initialDocRoot, setInitialDocRoot] = useState(getSettings().docRoot);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [aiModel, setAiModel] = useState(() => localStorage.getItem("eva.ai.model") || "deepseek-ai/DeepSeek-V3.2");
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [autoStartLoading, setAutoStartLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [localIp, setLocalIp] = useState("127.0.0.1");
  const [lanShareLoading, setLanShareLoading] = useState(false);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [maintenanceAction, setMaintenanceAction] = useState<string | null>(null);

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let idx = 0;
    while (size >= 1024 && idx < units.length - 1) {
      size /= 1024;
      idx += 1;
    }
    return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
  };

  const examCountdownDays = useMemo(() => {
    if (!settings.examDate) return null;
    const exam = new Date(`${settings.examDate}T00:00:00`);
    if (Number.isNaN(exam.getTime())) return null;
    const now = new Date();
    const diffMs = exam.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }, [settings.examDate]);

  const loadStorageUsage = useCallback(async () => {
    setStorageLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const stats = await invoke<StorageStats>("get_storage_usage");
      setStorageStats(stats);
    } catch (error) {
      console.error("[Settings] Failed to load storage usage:", error);
      setActionError(`读取存储用量失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setStorageLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const initDocRoot = async () => {
      try {
        const loaded = getSettings();
        const baseDir = await documentDir();
        const realPath = await join(baseDir, "EVA_Knowledge_Base");
        const current = (loaded.docRoot || "").trim();
        const shouldNormalize = !current || current.startsWith("~/") || current.startsWith("~\\");

        if (shouldNormalize) {
          const next = { ...loaded, docRoot: realPath };
          if (mounted) {
            setSettings(next);
            setInitialDocRoot(realPath);
          }
          updateSettings(next);
          return;
        }

        if (mounted) {
          setSettings(loaded);
          setInitialDocRoot(current);
        }
      } catch (error) {
        console.error("[Settings] Failed to initialize absolute docRoot:", error);
        const loaded = getSettings();
        if (mounted) {
          setSettings(loaded);
          setInitialDocRoot((loaded.docRoot || "").trim());
        }
      }
    };

    initDocRoot();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const queryTab = new URLSearchParams(window.location.search).get("tab");
    if (!queryTab) return;
    const isValidTab = navItems.some((item) => item.key === queryTab);
    if (isValidTab) {
      setActiveTab(queryTab as TabKey);
    }
  }, []);

  useEffect(() => {
    loadStorageUsage();
  }, [loadStorageUsage]);

  useEffect(() => {
    let mounted = true;
    const initializeLanSync = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const ip = await invoke<string>("get_local_ip");
        if (mounted && ip) {
          setLocalIp(ip);
        }

        const persisted = getSettings();
        if (persisted.lanShareEnabled) {
          await invoke("toggle_local_server", {
            enable: true,
            port: persisted.lanSharePort || 9527,
          });
        }
      } catch (error) {
        console.error("[Settings] Failed to initialize LAN sync state:", error);
      }
    };

    initializeLanSync();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadAutostart = async () => {
      try {
        const enabled = await isEnabled();
        if (mounted) setAutoStartEnabled(enabled);
      } catch (error) {
        console.error("[Settings] Failed to read autostart state:", error);
      } finally {
        if (mounted) setAutoStartLoading(false);
      }
    };
    loadAutostart();
    return () => {
      mounted = false;
    };
  }, []);

  const save = async () => {
    updateSettings(settings);
    localStorage.setItem("eva.ai.apiKey", settings.aiApiKey);
    localStorage.setItem("eva.ai.api.key", settings.aiApiKey);
    localStorage.setItem("eva.ai.model", aiModel);

    if (settings.docRoot.trim() && settings.docRoot !== initialDocRoot) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("initialize_workspace_at", { rootPath: settings.docRoot.trim() });
        setInitialDocRoot(settings.docRoot);
      } catch (error) {
        console.error("[Settings] Failed to initialize workspace at new docRoot:", error);
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

  const handleAutoStartChange = async (nextEnabled: boolean) => {
    if (autoStartLoading) return;
    setAutoStartLoading(true);
    setActionError(null);
    try {
      if (nextEnabled) {
        await enable();
        setAutoStartEnabled(true);
      } else {
        await disable();
        setAutoStartEnabled(false);
      }
    } catch (error) {
      console.error("[Settings] Failed to toggle autostart:", error);
      setActionError(`开机自启动设置失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setAutoStartLoading(false);
    }
  };

  const handleLanShareChange = async (nextEnabled: boolean) => {
    if (lanShareLoading) return;
    setLanShareLoading(true);
    setActionError(null);

    const prevEnabled = settings.lanShareEnabled;
    const nextSettings = { ...settings, lanShareEnabled: nextEnabled };
    setSettings(nextSettings);
    updateSettings({ lanShareEnabled: nextEnabled });

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("toggle_local_server", {
        enable: nextEnabled,
        port: nextSettings.lanSharePort || 9527,
      });
    } catch (error) {
      console.error("[Settings] Failed to toggle local LAN server:", error);
      setSettings({ ...nextSettings, lanShareEnabled: prevEnabled });
      updateSettings({ lanShareEnabled: prevEnabled });
      setActionError(`局域网共享切换失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLanShareLoading(false);
    }
  };

  const handleClearCache = async (cacheType: string, label: string) => {
    if (!window.confirm(`确认执行「${label}」？该操作会清理对应本地数据，且不可恢复。`)) {
      return;
    }
    setMaintenanceAction(cacheType);
    setActionError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const message = await invoke<string>("clear_cache", { cacheType });
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
      setActionError(message);
      await loadStorageUsage();
    } catch (error) {
      console.error("[Settings] Failed to clear cache:", error);
      setActionError(`清理失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setMaintenanceAction(null);
    }
  };

  const handleResetAllData = async () => {
    if (!window.confirm("⚠️ 高危操作：将清空数据库内容、知识库与资源站文件。是否继续？")) return;
    if (!window.confirm("请再次确认：该操作不可恢复，确定执行一键重置？")) return;

    setMaintenanceAction("reset");
    setActionError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const message = await invoke<string>("reset_all_data");
      setActionError(message);
      await loadStorageUsage();
    } catch (error) {
      console.error("[Settings] Failed to reset all data:", error);
      setActionError(`重置失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setMaintenanceAction(null);
    }
  };

  const handleChangeRoot = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({ directory: true, multiple: false, title: "选择文档根目录" });
      if (picked && typeof picked === "string") {
        const next = { ...settings, docRoot: picked };
        setSettings(next);
        updateSettings(next);
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("initialize_workspace_at", { rootPath: picked.trim() });
        setInitialDocRoot(picked);
        setSaved(true);
        setTimeout(() => setSaved(false), 1200);
      }
    } catch (e) {
      console.warn("Directory picker failed:", e);
    }
  };

  const handleOpenRoot = async () => {
    setActionError(null);
    try {
      const target = settings.docRoot?.trim();
      if (!target) {
        setActionError("当前未配置文档根目录");
        return;
      }
      try {
        await revealItemInDir(target);
      } catch {
        await openPath(target);
      }
    } catch (error) {
      console.error("[Settings] Failed to open local workspace root:", error);
      setActionError(`打开根目录失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const testBell = () => {
    const audio = new Audio(bellUrl(settings.pomodoroBell));
    audio.play().catch(() => {});
  };

  const toggleKeyVisibility = (key: string) => setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));

  const inputClass = "mt-1 w-full bg-white/90 dark:bg-[#0f1826]/80 border border-gray-200/80 dark:border-[#30435c] rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#88B5D3]/25 focus:border-[#88B5D3] transition-all";
  const selectClass = "mt-1 w-full bg-white/90 dark:bg-[#0f1826]/80 border border-gray-200/80 dark:border-[#30435c] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#88B5D3]/25 text-gray-900 dark:text-white";

  /* ─── Tab: 通用设置 ─── */
  const renderGeneral = () => (
    <section className="space-y-5">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">通用设置</h2>
      <div className="glass-card rounded-2xl p-5 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">开机自启动</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">登录系统时自动启动 EVA 终端</p>
        </div>
        <label className="relative inline-flex h-7 w-12 items-center cursor-pointer select-none">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={autoStartEnabled}
            onChange={(e) => handleAutoStartChange(e.target.checked)}
          />
          <span className="absolute inset-0 rounded-full bg-gray-300 dark:bg-gray-600 transition-colors peer-checked:bg-[#88B5D3]" />
          <span className={`relative inline-block h-5 w-5 rounded-full bg-white transition-transform ${autoStartEnabled ? "translate-x-6" : "translate-x-1"}`} />
        </label>
      </div>
    </section>
  );

  /* ─── Tab: 外观与主题 ─── */
  const renderAppearance = () => (
    <section className="space-y-5">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Type className="w-4 h-4 text-[#88B5D3]" /> 外观与主题</h2>
      <div className="glass-card rounded-2xl p-5 space-y-5">
        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-600 dark:text-gray-400">字体缩放</span>
            <span className="font-mono text-gray-700 dark:text-gray-300">{settings.fontScale}%</span>
          </div>
          <input type="range" min={90} max={120} value={settings.fontScale} onChange={(e) => setSettings({ ...settings, fontScale: Number(e.target.value) })} className="w-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 flex items-center gap-1"><UserCircle2 className="w-3.5 h-3.5" /> 头像 URL</label>
            <input value={settings.avatarUrl} onChange={(e) => setSettings({ ...settings, avatarUrl: e.target.value })} placeholder="https://... 或 /pic/avatar.png" className={inputClass} />
            {settings.avatarUrl && <img src={settings.avatarUrl} alt="预览" className="mt-2 w-12 h-12 rounded-full object-cover ring-2 ring-white dark:ring-gray-800" referrerPolicy="no-referrer" />}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 flex items-center gap-1"><Image className="w-3.5 h-3.5" /> 侧边栏背景图 URL</label>
            <input value={settings.backgroundUrl} onChange={(e) => setSettings({ ...settings, backgroundUrl: e.target.value })} placeholder="https://... 或 /pic/bg.jpg（留空则默认）" className={inputClass} />
            {settings.backgroundUrl && <div className="mt-2 w-full h-16 rounded-xl overflow-hidden"><img src={settings.backgroundUrl} alt="背景预览" className="w-full h-full object-cover" referrerPolicy="no-referrer" /></div>}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">动画强度</label>
          <select value={settings.animationLevel} onChange={(e) => setSettings({ ...settings, animationLevel: e.target.value as AppSettings["animationLevel"] })} className={selectClass}>
            <option value="normal">标准</option>
            <option value="reduced">减少动画</option>
          </select>
        </div>
      </div>
    </section>
  );

  /* ─── Tab: AI 助手配置 ─── */
  const renderAiConfig = () => {
    const apiKeys: { label: string; field: keyof AppSettings; placeholder: string }[] = [
      { label: "DeepSeek API Key", field: "aiApiKey", placeholder: "sk-..." },
      { label: "Kimi (Moonshot) API Key", field: "aiKimiKey", placeholder: "sk-..." },
      { label: "MiniMax API Key", field: "aiMinimaxKey", placeholder: "eyJ..." },
    ];
    return (
      <section className="space-y-5">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Key className="w-4 h-4 text-purple-500" /> AI 助手配置</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">已支持硅基流动 OpenAI 兼容接口。默认模型为 DeepSeek-V3.2。</p>
        <div className="glass-card rounded-2xl p-5 space-y-5">
          {apiKeys.map(({ label, field, placeholder }) => (
            <div key={field}>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">{label}</label>
              <div className="mt-1.5 flex gap-2">
                <input
                  type={showKeys[field] ? "text" : "password"}
                  value={(settings as unknown as Record<string, string>)[field]}
                  onChange={(e) => setSettings({ ...settings, [field]: e.target.value })}
                  placeholder={placeholder}
                  className={inputClass + " flex-1"}
                />
                <button
                  type="button"
                  onClick={() => toggleKeyVisibility(field)}
                  className="px-3 py-2 rounded-xl border border-gray-200/80 dark:border-[#30435c] text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1b2a41] text-sm transition-colors"
                >
                  {showKeys[field] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
          <p className="text-xs text-gray-400 dark:text-gray-500">密钥将安全存储在本地，不会上传至任何服务器。</p>
        </div>
        <div className="glass-card rounded-2xl p-5">
          <label className="text-xs font-semibold text-gray-500">默认模型选择</label>
          <select value={aiModel} onChange={(e) => setAiModel(e.target.value)} className={selectClass}>
            <option value="deepseek-ai/DeepSeek-V3.2">deepseek-ai/DeepSeek-V3.2（推荐）</option>
            <option value="deepseek-ai/DeepSeek-R1">deepseek-ai/DeepSeek-R1</option>
          </select>
        </div>
      </section>
    );
  };

  /* ─── Tab: 本地工作区 ─── */
  const renderWorkspace = () => (
    <section className="space-y-5">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><FolderOpen className="w-4 h-4 text-emerald-500" /> 本地工作区</h2>
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div>
          <label className="text-xs font-semibold text-gray-500">文档根目录</label>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenRoot}
              className="flex-1 flex items-center gap-2 rounded-xl border border-gray-200/80 dark:border-[#30435c] bg-gray-50 dark:bg-[#0f1826]/60 px-4 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-[#152338] transition-colors cursor-pointer"
              title="在资源管理器中打开当前目录"
            >
              <FolderOpen className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">{settings.docRoot || "未设置"}</span>
            </button>
            <button onClick={handleChangeRoot} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#88B5D3] hover:bg-[#6f9fbe] text-white text-sm font-semibold shadow-sm transition-colors">
              <FolderSearch className="w-4 h-4" /> 更改目录
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={handleOpenRoot} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-300/60 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/10 text-sm font-semibold transition-colors">
            <ExternalLink className="w-4 h-4" /> 在资源管理器中打开
          </button>
        </div>
      </div>
      <div className="glass-card rounded-2xl p-5">
        <p className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-2">目录规划</p>
        <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
          <p>留痕 MD → <code className="text-xs bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 rounded">{settings.docRoot}/Logs/</code></p>
          <p>知识库 → <code className="text-xs bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 rounded">{settings.docRoot}/Notes/</code></p>
          <p>资源文件 → <code className="text-xs bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 rounded">{settings.docRoot}/Resources/</code></p>
          <p>数据库 → <code className="text-xs bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 rounded">{settings.docRoot}/Database/eva.db</code></p>
        </div>
      </div>
    </section>
  );

  /* ─── Tab: 番茄钟与提醒 ─── */
  const renderPomodoro = () => (
    <section className="space-y-5">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Bell className="w-4 h-4 text-amber-500" /> 番茄钟与提醒</h2>
      <div className="glass-card rounded-2xl p-5 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500">默认番茄分钟</label>
            <input type="number" min={5} max={90} value={settings.defaultPomodoroMinutes} onChange={(e) => setSettings({ ...settings, defaultPomodoroMinutes: Number(e.target.value || 25) })} className={selectClass} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">结束铃声</label>
            <select value={settings.pomodoroBell} onChange={(e) => setSettings({ ...settings, pomodoroBell: e.target.value as AppSettings["pomodoroBell"] })} className={selectClass}>
              <option value="beep">Beep</option>
              <option value="chime">Chime</option>
              <option value="digital">Digital</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={testBell} className="px-4 py-2 rounded-xl border border-amber-300/40 text-amber-600 dark:text-amber-300 hover:bg-amber-500/10 text-sm font-semibold transition-colors">试听铃声</button>
        </div>
        <label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={settings.autoFullscreenPomodoro} onChange={(e) => setSettings({ ...settings, autoFullscreenPomodoro: e.target.checked })} className="rounded" />
          开始番茄钟后自动进入全屏沉浸模式
        </label>
      </div>
    </section>
  );

  /* ─── Tab: 快捷键 ─── */
  const renderShortcuts = () => (
    <section className="space-y-5">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Keyboard className="w-4 h-4 text-violet-500" /> 快捷键</h2>
      <div className="glass-card rounded-2xl p-5">
        <div className="divide-y divide-gray-200/60 dark:divide-[#2a3b52]">
          {shortcutList.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <span className="text-sm text-gray-700 dark:text-gray-300">{s.desc}</span>
              <kbd className="text-xs font-mono bg-gray-100 dark:bg-[#1b2a41] border border-gray-200 dark:border-[#30435c] rounded-lg px-2.5 py-1 text-gray-600 dark:text-gray-300">{s.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  const renderSync = () => (
    <section className="space-y-5">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">同步与备份</h2>

      <div className="glass-card rounded-2xl p-5 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">启用局域网共享</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">允许同一 Wi-Fi 下的设备访问本地数据（后续绑定真实服务）</p>
        </div>
        <label className="relative inline-flex h-7 w-12 items-center cursor-pointer select-none">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={settings.lanShareEnabled}
            onChange={(e) => handleLanShareChange(e.target.checked)}
            disabled={lanShareLoading}
          />
          <span className="absolute inset-0 rounded-full bg-gray-300 dark:bg-gray-600 transition-colors peer-checked:bg-[#88B5D3]" />
          <span className={`relative inline-block h-5 w-5 rounded-full bg-white transition-transform ${settings.lanShareEnabled ? "translate-x-6" : "translate-x-1"}`} />
        </label>
      </div>

      <div className="glass-card rounded-2xl p-5">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">局域网地址</p>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">内网 IP:端口</p>
        <div className="mt-2 rounded-xl border border-gray-200/80 dark:border-[#30435c] bg-white/80 dark:bg-[#0f1826]/70 px-4 py-2.5 text-sm font-mono text-gray-700 dark:text-gray-200">
          {`http://${localIp}:${settings.lanSharePort || 9527}`}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Tailscale 状态</p>
        <div className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          状态：未检测（占位）
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">MagicDNS: eva-desktop.tailnet-xxxx.ts.net:9527（占位）</p>
      </div>
    </section>
  );

  const renderExam = () => (
    <section className="space-y-5">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">考研目标</h2>

      <div className="glass-card rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-500">目标院校</label>
          <input
            value={settings.targetUniversity}
            onChange={(e) => setSettings({ ...settings, targetUniversity: e.target.value })}
            placeholder="例如：浙江大学 计算机学院"
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">总分目标</label>
          <input type="number" value={settings.targetScores.politics + settings.targetScores.english + settings.targetScores.math + settings.targetScores.major} readOnly className={inputClass} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-gray-500">考试日期</label>
          <input
            type="date"
            value={settings.examDate}
            onChange={(e) => setSettings({ ...settings, examDate: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5">
        <p className="text-sm text-gray-600 dark:text-gray-300">距离考研还剩 <span className="font-bold text-[#FF9900]">{examCountdownDays ?? "--"}</span> 天</p>
      </div>

      <div className="glass-card rounded-2xl p-5">
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">各科目标分数</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500">408</label>
            <input type="number" value={settings.targetScores.major} onChange={(e) => setSettings({ ...settings, targetScores: { ...settings.targetScores, major: Number(e.target.value || 0) } })} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-500">数一</label>
            <input type="number" value={settings.targetScores.math} onChange={(e) => setSettings({ ...settings, targetScores: { ...settings.targetScores, math: Number(e.target.value || 0) } })} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-500">英一</label>
            <input type="number" value={settings.targetScores.english} onChange={(e) => setSettings({ ...settings, targetScores: { ...settings.targetScores, english: Number(e.target.value || 0) } })} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-500">政治</label>
            <input type="number" value={settings.targetScores.politics} onChange={(e) => setSettings({ ...settings, targetScores: { ...settings.targetScores, politics: Number(e.target.value || 0) } })} className={inputClass} />
          </div>
        </div>
      </div>
    </section>
  );

  const renderPrivacy = () => (
    <section className="space-y-5">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">隐私与安全</h2>

      <div className="glass-card rounded-2xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">存储用量面板</p>
          <button
            type="button"
            onClick={loadStorageUsage}
            disabled={storageLoading}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200/80 dark:border-[#30435c] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1b2a41] disabled:opacity-60"
          >
            {storageLoading ? "刷新中..." : "刷新"}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl border border-gray-200/80 dark:border-[#30435c] px-4 py-3 bg-white/80 dark:bg-[#0f1826]/70">
            <p className="text-gray-500">SQLite</p>
            <p className="font-semibold text-gray-900 dark:text-white">{formatBytes(storageStats?.db_bytes || 0)}</p>
          </div>
          <div className="rounded-xl border border-gray-200/80 dark:border-[#30435c] px-4 py-3 bg-white/80 dark:bg-[#0f1826]/70">
            <p className="text-gray-500">知识库 + 资源站</p>
            <p className="font-semibold text-gray-900 dark:text-white">{formatBytes((storageStats?.notes_bytes || 0) + (storageStats?.resources_bytes || 0))}</p>
          </div>
          <div className="rounded-xl border border-gray-200/80 dark:border-[#30435c] px-4 py-3 bg-white/80 dark:bg-[#0f1826]/70">
            <p className="text-gray-500">日志</p>
            <p className="font-semibold text-gray-900 dark:text-white">{formatBytes(storageStats?.logs_bytes || 0)}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">总占用：{formatBytes(storageStats?.total_bytes || 0)}</p>
      </div>

      <div className="glass-card rounded-2xl p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">分类清理</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={() => handleClearCache("drafts", "清理草稿")}
            disabled={maintenanceAction !== null}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200/80 dark:border-[#30435c] hover:bg-gray-100 dark:hover:bg-[#1b2a41] text-sm text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-60"
          >
            <Trash2 className="w-4 h-4" /> 清理草稿
          </button>
          <button
            onClick={() => handleClearCache("tree", "清理树缓存")}
            disabled={maintenanceAction !== null}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200/80 dark:border-[#30435c] hover:bg-gray-100 dark:hover:bg-[#1b2a41] text-sm text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-60"
          >
            <Trash2 className="w-4 h-4" /> 清理树缓存
          </button>
          <button
            onClick={() => handleClearCache("file", "清理文件缓存")}
            disabled={maintenanceAction !== null}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200/80 dark:border-[#30435c] hover:bg-gray-100 dark:hover:bg-[#1b2a41] text-sm text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-60"
          >
            <Trash2 className="w-4 h-4" /> 清理文件缓存
          </button>
          <button
            onClick={() => handleClearCache("tasks", "清理任务回退")}
            disabled={maintenanceAction !== null}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200/80 dark:border-[#30435c] hover:bg-gray-100 dark:hover:bg-[#1b2a41] text-sm text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-60"
          >
            <Trash2 className="w-4 h-4" /> 清理任务回退
          </button>
        </div>
        <button
          onClick={handleResetAllData}
          disabled={maintenanceAction !== null}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-70"
        >
          <Trash2 className="w-4 h-4" /> {maintenanceAction === "reset" ? "清空中..." : "一键清空"}
        </button>
      </div>
    </section>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case "general":
        return renderGeneral();
      case "appearance":
        return renderAppearance();
      case "ai":
        return renderAiConfig();
      case "workspace":
        return renderWorkspace();
      case "sync":
        return renderSync();
      case "exam":
        return renderExam();
      case "pomodoro":
        return renderPomodoro();
      case "shortcut":
        return renderShortcuts();
      case "privacy":
        return renderPrivacy();
      case "about":
        return (
          <section className="space-y-5">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Gauge className="w-4 h-4 text-gray-400" /> 关于</h2>
            <div className="glass-card rounded-2xl p-5 space-y-2">
              <p className="text-sm text-gray-500">EVA-00 考研辅助终端 · {new Date().getFullYear()}</p>
              <p className="text-xs text-gray-400">控制台中的 <code className="text-xs">RedrawEventsCleared / MainEventsCleared</code> 警告属于 Tauri 窗口事件循环内部日志，不影响功能。</p>
            </div>
          </section>
        );
      default:
        return null;
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      <header className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">系统设置</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">按左侧标签管理各模块配置。</p>
        </div>
        <button onClick={save} className="px-4 py-2.5 rounded-2xl bg-[#88B5D3] hover:bg-[#6f9fbe] text-white text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors flex-shrink-0">
          <Save className="w-4 h-4" /> 保存设置
        </button>
      </header>

      <section className="rounded-[30px] border border-white/65 dark:border-[#2b3c53]/90 bg-white/58 dark:bg-[#0f1828]/58 backdrop-blur-xl shadow-[0_18px_55px_rgba(15,23,42,0.08)] dark:shadow-[0_18px_55px_rgba(2,8,23,0.5)] p-5 md:p-6 h-[74vh] min-h-[560px]">
        <div className="flex gap-5 h-full min-h-0">
          <aside className="w-56 flex-shrink-0 border-r border-gray-200/75 dark:border-[#2a3b52] pr-3 overflow-y-auto">
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveTab(item.key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium text-left transition-colors ${active ? "bg-[#88B5D3]/20 text-[#4f85ab] dark:text-[#9fc4df]" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-[#1b2a41]"}`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          <main className="flex-1 min-w-0 overflow-y-auto pr-1">
            {renderTabContent()}
          </main>
        </div>
      </section>

      {actionError && <div className="fixed bottom-24 right-8 max-w-sm px-4 py-2 rounded-xl bg-rose-500 text-white text-sm font-semibold shadow-lg animate-in fade-in duration-300">{actionError}</div>}
      {saved && <div className="fixed bottom-8 right-8 px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300">设置已保存</div>}
    </div>
  );
}
