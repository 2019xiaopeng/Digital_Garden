/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { Link } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { isTauriAvailable } from "./lib/dataService";
import { getSettings, saveSettings } from "./lib/settings";

// 首页 Dashboard 保持静态；其余页面懒加载，recharts/katex/highlight.js 不再挤进首屏
const Blog = lazy(() => import("./pages/Blog").then((m) => ({ default: m.Blog })));
const BlogPost = lazy(() => import("./pages/BlogPost").then((m) => ({ default: m.BlogPost })));
const Notes = lazy(() => import("./pages/Notes").then((m) => ({ default: m.Notes })));
const Resources = lazy(() => import("./pages/Resources").then((m) => ({ default: m.Resources })));
const Tasks = lazy(() => import("./pages/Tasks").then((m) => ({ default: m.Tasks })));
const WeeklyReview = lazy(() => import("./pages/WeeklyReview").then((m) => ({ default: m.WeeklyReview })));
const FocusInsights = lazy(() => import("./pages/FocusInsights").then((m) => ({ default: m.FocusInsights })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const ErrorBook = lazy(() => import("./pages/ErrorBook").then((m) => ({ default: m.ErrorBook })));

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
        localStorage.setItem("eva.workspace.root", root);
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
    <BrowserRouter>
      <Suspense fallback={<div className="p-8 text-sm text-gray-400 dark:text-gray-500">加载中…</div>}>
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
          <Route path="error-book" element={<ErrorBook />} />
          <Route path="settings" element={<SettingsDesktopOnly />} />
        </Route>
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
