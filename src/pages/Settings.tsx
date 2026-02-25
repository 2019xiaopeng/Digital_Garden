import { type ComponentType, useEffect, useState } from "react";
import {
  AlarmClock,
  Bell,
  Bot,
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
import { isTauriAvailable } from "../lib/dataService";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

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
];

export function Settings() {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [saved, setSaved] = useState(false);
  const [initialDocRoot, setInitialDocRoot] = useState(getSettings().docRoot);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [aiModel, setAiModel] = useState(() => localStorage.getItem("eva.ai.model") || "deepseek-v3");
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [autoStartLoading, setAutoStartLoading] = useState(true);

  useEffect(() => {
    const loaded = getSettings();
    setSettings(loaded);
    setInitialDocRoot(loaded.docRoot);
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadAutostart = async () => {
      if (!isTauriAvailable()) {
        if (mounted) {
          setAutoStartEnabled(false);
          setAutoStartLoading(false);
        }
        return;
      }
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
    localStorage.setItem("eva.ai.model", aiModel);

    if (isTauriAvailable() && settings.docRoot.trim() && settings.docRoot !== initialDocRoot) {
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

  const toggleAutoStart = async () => {
    if (!isTauriAvailable() || autoStartLoading) return;
    setAutoStartLoading(true);
    try {
      if (autoStartEnabled) {
        await disable();
        setAutoStartEnabled(false);
      } else {
        await enable();
        setAutoStartEnabled(true);
      }
    } catch (error) {
      console.error("[Settings] Failed to toggle autostart:", error);
    } finally {
      setAutoStartLoading(false);
    }
  };

  const pickDocRoot = async () => {
    if (!isTauriAvailable()) return;
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

  const openLocalDataDir = async () => {
    if (!isTauriAvailable()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const root = await invoke<string>("get_workspace_root");
      await shellOpen(root);
    } catch (error) {
      console.error("[Settings] Failed to open local workspace root:", error);
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
        <button
          type="button"
          onClick={toggleAutoStart}
          disabled={!isTauriAvailable() || autoStartLoading}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${autoStartEnabled ? "bg-[#88B5D3]" : "bg-gray-300 dark:bg-gray-600"} ${(!isTauriAvailable() || autoStartLoading) ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${autoStartEnabled ? "translate-x-6" : "translate-x-1"}`} />
        </button>
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
        <p className="text-xs text-gray-500 dark:text-gray-400">分别配置三个大模型的 Key。闪电灵感与 AI 复盘将使用对应服务商的 Key 发起请求。</p>
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
            <option value="deepseek-v3">DeepSeek-V3（推荐）</option>
            <option value="deepseek-r1">DeepSeek-R1</option>
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
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-gray-200/80 dark:border-[#30435c] bg-gray-50 dark:bg-[#0f1826]/60 px-4 py-2.5">
            <FolderOpen className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">{settings.docRoot || "未设置"}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {isTauriAvailable() && (
            <button onClick={pickDocRoot} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#88B5D3] hover:bg-[#6f9fbe] text-white text-sm font-semibold shadow-sm transition-colors">
              <FolderSearch className="w-4 h-4" /> 更改根目录
            </button>
          )}
          {isTauriAvailable() && (
            <button onClick={openLocalDataDir} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-300/60 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/10 text-sm font-semibold transition-colors">
              <ExternalLink className="w-4 h-4" /> 在资源管理器中打开
            </button>
          )}
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

  const renderPlaceholder = (title: string, desc: string) => (
    <section className="space-y-5">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
      <div className="glass-card rounded-2xl p-5">
        <p className="text-sm text-gray-500 dark:text-gray-400">{desc}</p>
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
        return renderPlaceholder("同步与备份", "云端同步和本地备份策略将在此处配置。");
      case "exam":
        return renderPlaceholder("考研目标", "阶段目标、计划里程碑与复盘模板将在此处配置。");
      case "pomodoro":
        return renderPomodoro();
      case "shortcut":
        return renderShortcuts();
      case "privacy":
        return renderPlaceholder("隐私与安全", "本地加密、密钥管理与权限策略将在此处配置。");
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
      <section className="rounded-[30px] border border-white/65 dark:border-[#2b3c53]/90 bg-white/58 dark:bg-[#0f1828]/58 backdrop-blur-xl shadow-[0_18px_55px_rgba(15,23,42,0.08)] dark:shadow-[0_18px_55px_rgba(2,8,23,0.5)] p-5 md:p-6 h-[74vh] min-h-[560px]">
        <header className="flex items-end justify-between gap-4 mb-5">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">系统设置</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">按左侧标签管理各模块配置。</p>
          </div>
          <button onClick={save} className="px-4 py-2.5 rounded-2xl bg-[#88B5D3] hover:bg-[#6f9fbe] text-white text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors flex-shrink-0">
            <Save className="w-4 h-4" /> 保存设置
          </button>
        </header>

        <div className="flex gap-5 h-[calc(100%-5.25rem)] min-h-0">
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

      {saved && <div className="fixed bottom-8 right-8 px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300">设置已保存</div>}
    </div>
  );
}
