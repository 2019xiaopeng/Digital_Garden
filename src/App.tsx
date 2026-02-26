/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Blog } from "./pages/Blog";
import { BlogPost } from "./pages/BlogPost";
import { Notes } from "./pages/Notes";
import { Resources } from "./pages/Resources";
import { Tasks } from "./pages/Tasks";
import { WeeklyReview } from "./pages/WeeklyReview";
import { FocusInsights } from "./pages/FocusInsights";
import { Settings } from "./pages/Settings";
import { isTauriAvailable } from "./lib/dataService";
import { KnowledgeSelectionProvider } from "./context/KnowledgeSelectionContext";
import { getSettings, saveSettings } from "./lib/settings";

function SettingsDesktopOnly() {
  if (isTauriAvailable()) {
    return <Settings />;
  }

  return (
    <section className="glass-card rounded-3xl p-8 text-center">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">设置仅在桌面端开放</h2>
      <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
        当前为局域网 Web 模式。系统级设置与数据清理操作仅支持桌面端执行。
      </p>
      <Link
        to="/"
        className="inline-flex mt-5 items-center px-4 py-2 rounded-xl bg-[#88B5D3] hover:bg-[#6f9fbe] text-white text-sm font-semibold transition-colors"
      >
        返回首页
      </Link>
    </section>
  );
}

export default function App() {
  useEffect(() => {
    if (!isTauriAvailable()) return;

    const isAbsolutePath = (path: string) => {
      if (!path) return false;
      return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("/");
    };

    const initWorkspace = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const root = await invoke<string>("get_workspace_root");
        const current = getSettings();
        const docRoot = (current.docRoot || "").trim();
        if (!docRoot || docRoot.includes("~") || !isAbsolutePath(docRoot)) {
          saveSettings({ ...current, docRoot: root });
        }
      } catch (error) {
        console.error("[App] Failed to initialize EVA workspace directories:", error);
      }
    };

    initWorkspace();
  }, []);

  return (
    <KnowledgeSelectionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="blog" element={<Blog />} />
            <Route path="blog/:id" element={<BlogPost />} />
            <Route path="notes" element={<Notes />} />
            <Route path="resources" element={<Resources />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="weekly" element={<WeeklyReview />} />
            <Route path="focus-insights" element={<FocusInsights />} />
            <Route path="settings" element={<SettingsDesktopOnly />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </KnowledgeSelectionProvider>
  );
}
