/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Blog } from "./pages/Blog";
import { BlogPost } from "./pages/BlogPost";
import { Notes } from "./pages/Notes";
import { Resources } from "./pages/Resources";
import { Quiz } from "./pages/Quiz";
import { Tasks } from "./pages/Tasks";
import { Settings } from "./pages/Settings";

export default function App() {
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
