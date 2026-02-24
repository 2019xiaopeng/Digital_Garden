import { useEffect, useState } from "react";
import { Save, Bell, Type, UserCircle2, Sparkles, Timer, Gauge, FolderOpen, Image, Key } from "lucide-react";
import { bellUrl, getSettings, updateSettings, type AppSettings } from "../lib/settings";
import { isTauriAvailable } from "../lib/dataService";

export function Settings() {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [saved, setSaved] = useState(false);
  const [initialDocRoot, setInitialDocRoot] = useState(getSettings().docRoot);

  useEffect(() => {
    const loaded = getSettings();
    setSettings(loaded);
    setInitialDocRoot(loaded.docRoot);
  }, []);

  const save = async () => {
    updateSettings(settings);
    localStorage.setItem("eva.ai.apiKey", settings.aiApiKey);

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

  const testBell = () => {
    const audio = new Audio(bellUrl(settings.pomodoroBell));
    audio.play().catch(() => {});
  };

  const pickDocRoot = async () => {
    if (!isTauriAvailable()) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({ directory: true, multiple: false, title: "选择文档根目录" });
      if (picked && typeof picked === "string") {
        setSettings({ ...settings, docRoot: picked });
      }
    } catch (e) {
      console.warn("Directory picker failed:", e);
    }
  };

  const inputClass = "mt-1 w-full bg-white/90 dark:bg-[#0f1826]/80 border border-gray-200/80 dark:border-[#30435c] rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#88B5D3]/25 focus:border-[#88B5D3] transition-all";
  const selectClass = "mt-1 w-full bg-white/90 dark:bg-[#0f1826]/80 border border-gray-200/80 dark:border-[#30435c] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#88B5D3]/25 text-gray-900 dark:text-white";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out max-w-3xl mx-auto">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">系统设置</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">AI、外观、番茄钟与存储偏好。</p>
        </div>
        <button onClick={save} className="px-4 py-2.5 rounded-2xl bg-[#88B5D3] hover:bg-[#6f9fbe] text-white text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors">
          <Save className="w-4 h-4" /> 保存设置
        </button>
      </header>

      {/* ─── AI 配置 ─── */}
      <section className="glass-card rounded-3xl p-6 space-y-5">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Key className="w-4 h-4 text-purple-500" /> AI 模型 API Key</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">分别配置三个大模型的 Key。闪电灵感与 AI 复盘将使用对应服务商的 Key 发起请求。</p>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500">DeepSeek API Key</label>
            <input type="password" value={settings.aiApiKey} onChange={(e) => setSettings({ ...settings, aiApiKey: e.target.value })} placeholder="sk-..." className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">Kimi (Moonshot) API Key</label>
            <input type="password" value={settings.aiKimiKey} onChange={(e) => setSettings({ ...settings, aiKimiKey: e.target.value })} placeholder="sk-..." className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">MiniMax API Key</label>
            <input type="password" value={settings.aiMinimaxKey} onChange={(e) => setSettings({ ...settings, aiMinimaxKey: e.target.value })} placeholder="eyJ..." className={inputClass} />
          </div>
        </div>
      </section>

      {/* ─── 外观 ─── */}
      <section className="glass-card rounded-3xl p-6 space-y-5">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Type className="w-4 h-4 text-[#88B5D3]" /> 外观</h2>
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500">动画强度</label>
            <select value={settings.animationLevel} onChange={(e) => setSettings({ ...settings, animationLevel: e.target.value as AppSettings["animationLevel"] })} className={selectClass}>
              <option value="normal">标准</option>
              <option value="reduced">减少动画</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">默认番茄分钟</label>
            <input type="number" min={5} max={90} value={settings.defaultPomodoroMinutes} onChange={(e) => setSettings({ ...settings, defaultPomodoroMinutes: Number(e.target.value || 25) })} className={selectClass} />
          </div>
        </div>
      </section>

      {/* ─── 番茄钟 ─── */}
      <section className="glass-card rounded-3xl p-6 space-y-5">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Bell className="w-4 h-4 text-amber-500" /> 番茄钟</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500">结束铃声</label>
            <select value={settings.pomodoroBell} onChange={(e) => setSettings({ ...settings, pomodoroBell: e.target.value as AppSettings["pomodoroBell"] })} className={selectClass}>
              <option value="beep">Beep</option>
              <option value="chime">Chime</option>
              <option value="digital">Digital</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={testBell} className="w-full py-2 rounded-xl border border-amber-300/40 text-amber-600 dark:text-amber-300 hover:bg-amber-500/10 text-sm font-semibold transition-colors">试听铃声</button>
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={settings.autoFullscreenPomodoro} onChange={(e) => setSettings({ ...settings, autoFullscreenPomodoro: e.target.checked })} />
          开始番茄钟后自动进入全屏沉浸模式
        </label>
      </section>

      {/* ─── 存储 ─── */}
      <section className="glass-card rounded-3xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><FolderOpen className="w-4 h-4 text-emerald-500" /> 文档存储</h2>
        <div>
          <label className="text-xs font-semibold text-gray-500">文档根目录</label>
          <div className="flex gap-2 mt-1">
            <input value={settings.docRoot} onChange={(e) => setSettings({ ...settings, docRoot: e.target.value })} placeholder="~/Documents/EVA_Knowledge_Base" className={inputClass + " flex-1"} />
            {isTauriAvailable() && (
              <button onClick={pickDocRoot} className="px-4 py-2 rounded-xl border border-[#88B5D3]/40 text-[#88B5D3] hover:bg-[#88B5D3]/10 text-sm font-semibold whitespace-nowrap transition-colors">浏览…</button>
            )}
          </div>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1 bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4">
          <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">目录规划</p>
          <p>留痕 MD → <code className="text-xs bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 rounded">{settings.docRoot}/Logs/</code></p>
          <p>知识库 → <code className="text-xs bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 rounded">{settings.docRoot}/Notes/</code></p>
          <p>资源文件 → <code className="text-xs bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 rounded">{settings.docRoot}/Resources/</code></p>
          <p>数据库 → <code className="text-xs bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 rounded">{settings.docRoot}/Database/eva.db</code></p>
        </div>
      </section>

      {/* ─── 关于 ─── */}
      <section className="glass-card rounded-3xl p-6">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Gauge className="w-4 h-4 text-gray-400" /> 关于</h2>
        <p className="text-sm text-gray-500 mt-2">EVA-00 考研辅助终端 · {new Date().getFullYear()}</p>
        <p className="text-xs text-gray-400 mt-1">控制台中的 <code className="text-xs">RedrawEventsCleared / MainEventsCleared</code> 警告属于 Tauri 窗口事件循环内部日志，不影响功能。</p>
      </section>

      {saved && <div className="fixed bottom-8 right-8 px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300">设置已保存</div>}
    </div>
  );
}
