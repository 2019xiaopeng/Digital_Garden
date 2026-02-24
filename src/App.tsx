/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Blog } from "./pages/Blog";
import { BlogPost } from "./pages/BlogPost";
import { Notes } from "./pages/Notes";
import { Resources } from "./pages/Resources";
import { Quiz } from "./pages/Quiz";
import { Tasks } from "./pages/Tasks";
import { Settings } from "./pages/Settings";
import { isTauriAvailable } from "./lib/dataService";

export default function App() {
  useEffect(() => {
    if (!isTauriAvailable()) return;

    const initWorkspace = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("initialize_workspace");
      } catch (error) {
        console.error("[App] Failed to initialize EVA workspace directories:", error);
      }
    };

    initWorkspace();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="blog" element={<Blog />} />
          <Route path="blog/:id" element={<BlogPost />} />
          <Route path="notes" element={<Notes />} />
          <Route path="resources" element={<Resources />} />
          <Route path="quiz" element={<Quiz />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
