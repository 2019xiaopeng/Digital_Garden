import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { 
  Folder, FileText, ChevronRight, ChevronDown, 
  Search, Plus, Sparkles, Send, Bot, User, X, File, Upload, Edit2, Trash2, MessageSquarePlus, RefreshCw
} from "lucide-react";
import { cn } from "../lib/utils";
import { ThemedPromptDialog } from "../components/ThemedPromptDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { isTauriAvailable } from "../lib/dataService";
import { open } from "@tauri-apps/plugin-dialog";
import { getSettings, updateSettings } from "../lib/settings";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useKnowledgeSelection } from "../context/KnowledgeSelectionContext";
import { chatCompletion, getAiRuntimeConfig } from "../utils/aiClient";

// --- Types ---
type TreeNode = {
  id: string;
  name: string;
  type: "folder" | "file";
  path?: string;       // absolute path on disk (Tauri) or virtual path
  children?: TreeNode[];
};

type NotesFsNode = {
  name: string;
  path: string;        // relative path from Notes/
  is_dir: boolean;
  children: NotesFsNode[];
};

const initialTree: TreeNode[] = [
  
];

type ChatMessage = { role: 'user' | 'model'; text: string };
type ChatSession = { id: string; title: string; messages: ChatMessage[] };

export function Notes() {
  const [treeData, setTreeData] = useState<TreeNode[]>(initialTree);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<TreeNode | null>(null);
  
  // Resizable pane state
  const [leftWidth, setLeftWidth] = useState(300);
  const isDragging = useRef(false);

  // AI Chat State
  const [chatInput, setChatInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(() => getSettings().aiModel || "deepseek-ai/DeepSeek-V3.2");
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [promptMode, setPromptMode] = useState<null | "create-folder" | "rename" | "move">(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Drag-and-drop state
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  // File preview state
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [uploadToast, setUploadToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const { selected_knowledge_files, setSelectedKnowledgeFiles } = useKnowledgeSelection();

  const activeSession = chatSessions.find(session => session.id === activeSessionId) || null;
  const chatHistory = activeSession?.messages || [];

  const showUploadToast = (type: "success" | "error", message: string) => {
    setUploadToast({ type, message });
    window.setTimeout(() => setUploadToast(null), 1800);
  };

  const convertFsNodesToTree = useCallback((nodes: NotesFsNode[]): TreeNode[] => {
    const walk = (items: NotesFsNode[]): TreeNode[] => {
      return items.map((node) => {
        const id = `notes:${node.path}`;
        if (node.is_dir) {
          return {
            id,
            name: node.name,
            type: "folder",
            children: walk(node.children || []),
          };
        }
        return {
          id,
          name: node.name,
          type: "file",
          path: node.path,
        };
      });
    };
    return walk(nodes);
  }, []);

  const loadTreeFromDisk = useCallback(async (silent = false) => {
    if (!isTauriAvailable()) {
      try {
        const saved = localStorage.getItem("eva:knowledge-tree");
        if (saved) setTreeData(JSON.parse(saved) as TreeNode[]);
      } catch {}
      return;
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const scanned = await invoke<NotesFsNode[]>("scan_notes_directory");
      setTreeData(convertFsNodesToTree(scanned));
      if (!silent) showUploadToast("success", "已同步磁盘目录");
    } catch (err: any) {
      console.error("[Notes] Failed to scan notes directory:", err);
      showUploadToast("error", `同步失败：${err?.message || String(err)}`);
    }
  }, [convertFsNodesToTree]);

  useEffect(() => {
    loadTreeFromDisk(true);
  }, [loadTreeFromDisk]);

  // Persist tree data to localStorage
  useEffect(() => {
    localStorage.setItem("eva:knowledge-tree", JSON.stringify(treeData));
  }, [treeData]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", onEsc);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping = tag === "input" || tag === "textarea" || target?.isContentEditable;
      if (isTyping) return;

      if (event.key === "Delete" && selectedNodeIds.length > 0) {
        event.preventDefault();
        setShowDeleteConfirm(true);
      }

      if (event.key === "F2" && selectedNodeIds.length === 1) {
        event.preventDefault();
        handleRenameNode();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNodeIds]);

  // Load file content when viewing a file
  useEffect(() => {
    if (!viewingFile) {
      setFileContent(null);
      return;
    }
    const ext = viewingFile.name.split(".").pop()?.toLowerCase() || "";
    const isText = ["md", "txt", "json", "js", "ts", "tsx", "jsx", "css", "html", "xml", "yaml", "yml", "toml", "csv", "log"].includes(ext);
    // PDF handled via iframe, skip text loading
    if (ext === "pdf") { setFileContent(null); return; }
    if (!isText) { setFileContent(null); return; }

    const loadContent = async () => {
      setIsLoadingContent(true);
      try {
        if (isTauriAvailable() && viewingFile.path) {
          const { invoke } = await import("@tauri-apps/api/core");
          const content = await invoke<string>("read_file_content", { path: viewingFile.path });
          setFileContent(content);
        } else {
          // Web fallback: check localStorage
          const stored = localStorage.getItem(`eva:file:${viewingFile.name}`);
          setFileContent(stored || null);
        }
      } catch (err) {
        console.warn("Failed to load file content:", err);
        setFileContent(null);
      } finally {
        setIsLoadingContent(false);
      }
    };
    loadContent();
  }, [viewingFile]);

  useEffect(() => {
    const selectedFiles = selectedNodeIds
      .map(id => findNode(treeData, id))
      .filter((node): node is TreeNode => !!node && node.type === "file")
      .map(node => ({ id: node.id, name: node.name, path: node.path }));
    setSelectedKnowledgeFiles(selectedFiles);
  }, [selectedNodeIds, treeData, setSelectedKnowledgeFiles]);

  const toggleFolder = (id: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedFolders(newExpanded);
  };

  const flattenTreeNodes = (nodes: TreeNode[]): TreeNode[] => {
    const result: TreeNode[] = [];
    const walk = (items: TreeNode[]) => {
      for (const n of items) {
        result.push(n);
        if (n.children && expandedFolders.has(n.id)) {
          walk(n.children);
        }
      }
    };
    walk(nodes);
    return result;
  };

  const handleNodeSelect = (e: React.MouseEvent, node: TreeNode) => {
    const isMultiToggle = e.metaKey || e.ctrlKey;
    const isRangeSelect = e.shiftKey;

    if (isRangeSelect && selectionAnchorId) {
      const ordered = flattenTreeNodes(treeData).map(n => n.id);
      const start = ordered.indexOf(selectionAnchorId);
      const end = ordered.indexOf(node.id);
      if (start >= 0 && end >= 0) {
        const [from, to] = start < end ? [start, end] : [end, start];
        setSelectedNodeIds(ordered.slice(from, to + 1));
      } else {
        setSelectedNodeIds([node.id]);
      }
    } else if (isMultiToggle) {
      setSelectedNodeIds(prev => prev.includes(node.id) ? prev.filter(id => id !== node.id) : [...prev, node.id]);
      setSelectionAnchorId(node.id);
    } else {
      setSelectedNodeIds([node.id]);
      setSelectionAnchorId(node.id);
    }

    setActiveNodeId(node.id);
  };

  const handleNodeDoubleClick = (node: TreeNode) => {
    if (node.type === "folder") {
      toggleFolder(node.id);
      return;
    }
    setViewingFile(node);
  };

  const handleNodeContextMenu = (e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();

    if (node.type !== "file") {
      setContextMenu(null);
      return;
    }

    const alreadySelected = selectedNodeIds.includes(node.id);
    if (!alreadySelected) {
      setSelectedNodeIds([node.id]);
      setSelectionAnchorId(node.id);
    }
    setActiveNodeId(node.id);
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
  };

  const clearSelection = () => {
    setSelectedNodeIds([]);
    setActiveNodeId(null);
    setSelectionAnchorId(null);
    setContextMenu(null);
  };

  const handleCreateFolder = async (folderName?: string) => {
    if (!folderName) {
      setPromptMode("create-folder");
      return;
    }
    
    const newFolder: TreeNode = {
      id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: folderName,
      type: "folder",
      children: []
    };
    const targetFolderId = selectedNode?.type === "folder" ? selectedNode.id : null;
    setTreeData(prev => addNodeToFolder(prev, targetFolderId, newFolder));
    if (targetFolderId) {
      const newExpanded = new Set(expandedFolders);
      newExpanded.add(targetFolderId);
      setExpandedFolders(newExpanded);
    }

    // Create actual folder on disk
    if (isTauriAvailable()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const parentRelDir = getRelativeDir(treeData, targetFolderId);
        const relativePath = parentRelDir ? `${parentRelDir}/${folderName}` : folderName;
        await invoke("create_notes_folder", { relativePath });
      } catch (err) {
        console.error("[Notes] Failed to create folder on disk:", err);
      }
    }
  };

  // Helper: compute the relative directory path by walking the tree to find the target folder
  const getRelativeDir = (nodes: TreeNode[], folderId: string | null): string => {
    if (!folderId) return "";
    const path: string[] = [];
    const walk = (items: TreeNode[], target: string): boolean => {
      for (const n of items) {
        if (n.id === target) { path.push(n.name); return true; }
        if (n.children) {
          if (walk(n.children, target)) { path.unshift(n.name); return true; }
        }
      }
      return false;
    };
    walk(nodes, folderId);
    return path.join("/");
  };

  const handleFileUpload = async () => {
    const targetFolderId = selectedNode?.type === "folder" ? selectedNode.id : null;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const picked = await open({
        multiple: true,
        filters: [{ name: "Documents", extensions: ["md", "pdf", "txt", "json", "csv"] }],
      });
      const list = Array.isArray(picked) ? picked : picked ? [picked] : [];
      if (list.length === 0) return;

      const relativeDir = getRelativeDir(treeData, targetFolderId);

      type CopiedFileResult = { source_path: string; file_name: string; dest_path: string };
      const copied = await invoke<CopiedFileResult[]>("copy_files_to_notes", {
        sourcePaths: list.map((p) => String(p)),
        relativeDir,
      });

      setTreeData(prev => {
        let updated = prev;
        copied.forEach((item) => {
          const newFile: TreeNode = {
            id: `uploaded-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: item.file_name,
            type: "file",
            path: item.dest_path,
          };
          updated = addNodeToFolder(updated, targetFolderId, newFile);
        });
        return updated;
      });

      showUploadToast("success", `上传成功：${copied.length} 个文件`);
      return;
    } catch (err: any) {
      console.error("[Notes] copy_files_to_notes failed:", err);
      showUploadToast("error", `上传失败：${err?.message || String(err)}`);
    }
  };

  const handleRenameNode = async (nextName?: string) => {
    if (!selectedNode || selectedNodeIds.length !== 1) return;
    if (!nextName) {
      setPromptMode("rename");
      return;
    }

    const trimmedName = nextName.trim();
    if (!trimmedName || trimmedName === selectedNode.name) return;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const fromPath = getRelativePath(treeData, selectedNode.id);
      if (fromPath) {
        const parent = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
        const toPath = parent ? `${parent}/${trimmedName}` : trimmedName;
        await invoke("move_notes_item", { fromRelative: fromPath, toRelative: toPath });
      }

      setTreeData(prev => updateNodeName(prev, selectedNode.id, trimmedName));
      if (viewingFile?.id === selectedNode.id) {
        setViewingFile({ ...viewingFile, name: trimmedName });
      }
      showUploadToast("success", "重命名完成");
    } catch (err: any) {
      console.error("[Notes] Failed to rename on disk:", err);
      showUploadToast("error", `重命名失败：${err?.message || String(err)}`);
    }
  };

  const handleDeleteNode = () => {
    if (selectedNodeIds.length === 0) return;
    setShowDeleteConfirm(true);
  };
  const confirmDeleteNode = async () => {
    if (selectedNodeIds.length === 0) return;

    try {
      const { invoke } = await import("@tauri-apps/api/core");

      if (selectedNodeIds.length > 1) {
        const selectedNodes = selectedNodeIds
          .map(id => findNode(treeData, id))
          .filter((node): node is TreeNode => !!node);

        const nonFiles = selectedNodes.filter(n => n.type !== "file");
        if (nonFiles.length > 0) {
          showUploadToast("error", "批量删除当前仅支持文件，请取消文件夹后重试");
          return;
        }

        const absolutePaths = selectedNodes
          .map(n => n.path)
          .filter((p): p is string => !!p);

        if (absolutePaths.length !== selectedNodes.length) {
          showUploadToast("error", "部分文件缺失绝对路径，无法执行批量删除");
          return;
        }

        await invoke<number>("batch_delete_notes_files", { absolutePaths });
        setTreeData(prev => selectedNodeIds.reduce((acc, id) => removeNode(acc, id), prev));
        if (viewingFile && selectedNodeIds.includes(viewingFile.id)) {
          setViewingFile(null);
        }
        showUploadToast("success", `已删除 ${selectedNodeIds.length} 个文件`);
      } else {
        const onlyId = selectedNodeIds[0];
        const rel = getRelativePath(treeData, onlyId);
        if (rel) {
          await invoke("delete_notes_item", { relativePath: rel });
        }
        setTreeData(prev => removeNode(prev, onlyId));
        if (viewingFile?.id === onlyId) {
          setViewingFile(null);
        }
        showUploadToast("success", "删除成功");
      }
    } catch (err: any) {
      console.error("[Notes] Failed to delete from disk:", err);
      showUploadToast("error", `删除失败：${err?.message || String(err)}`);
      return;
    }

    setActiveNodeId(null);
    setSelectedNodeIds([]);
    setSelectionAnchorId(null);
    setShowDeleteConfirm(false);
  };

  const handleMoveSelected = (targetRelativeDir?: string) => {
    if (!targetRelativeDir) {
      setPromptMode("move");
      return;
    }

    const run = async () => {
      try {
        const normalizedTarget = targetRelativeDir.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
        const targetFolder = normalizedTarget ? findFolderByRelativePath(treeData, normalizedTarget) : null;
        if (normalizedTarget && !targetFolder) {
          showUploadToast("error", "目标目录不存在，请先在知识库中创建该文件夹");
          return;
        }

        const selectedNodes = selectedNodeIds
          .map(id => findNode(treeData, id))
          .filter((node): node is TreeNode => !!node);

        const nonFiles = selectedNodes.filter(n => n.type !== "file");
        if (nonFiles.length > 0) {
          showUploadToast("error", "批量归档当前仅支持文件");
          return;
        }

        const fromRelatives = selectedNodes
          .map(node => getRelativePath(treeData, node.id))
          .filter((v): v is string => !!v);

        if (fromRelatives.length === 0) return;

        const { invoke } = await import("@tauri-apps/api/core");
        await invoke<number>("batch_move_notes_items", {
          fromRelatives,
          targetRelativeDir: normalizedTarget,
        });

        const targetFolderId = targetFolder?.id || null;

        setTreeData(prev => {
          let updated = prev;
          for (const id of selectedNodeIds) {
            updated = moveNodeToFolder(updated, id, targetFolderId);
          }
          return updated;
        });

        if (targetFolderId) {
          setExpandedFolders(prev => new Set(prev).add(targetFolderId));
        }
        showUploadToast("success", `已归档 ${fromRelatives.length} 个文件`);
      } catch (err: any) {
        console.error("[Notes] Failed to batch move files:", err);
        showUploadToast("error", `归档失败：${err?.message || String(err)}`);
      }
    };

    run();
  };

  // --- Drag-and-drop handlers ---
  const handleDragStart = (e: React.DragEvent, nodeId: string) => {
    e.stopPropagation();
    setDraggedNodeId(nodeId);
    e.dataTransfer.effectAllowed = "move";
    // Make drag image semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
    setDraggedNodeId(null);
    setDropTargetId(null);
  };

  const handleDragOver = (e: React.DragEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedNodeId || draggedNodeId === nodeId) return;
    // Only allow dropping onto folders
    const target = findNode(treeData, nodeId);
    if (target?.type !== "folder") return;
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(nodeId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setDropTargetId(null);
  };

  const handleDropOnFolder = async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetId(null);

    const externalPaths = extractDroppedFilePaths(e);
    if (externalPaths.length > 0) {
      await copyDroppedFilesToFolder(externalPaths, targetFolderId);
      setDraggedNodeId(null);
      return;
    }

    if (!draggedNodeId || draggedNodeId === targetFolderId) return;

    // Prevent dropping a folder into itself or its descendants
    const draggedNode = findNode(treeData, draggedNodeId);
    if (!draggedNode) return;
    if (draggedNode.type === "folder") {
      const isDescendant = (parent: TreeNode, childId: string): boolean => {
        if (parent.id === childId) return true;
        return (parent.children || []).some(c => isDescendant(c, childId));
      };
      if (isDescendant(draggedNode, targetFolderId)) return;
    }

    // Move on disk (Tauri mode)
    let canUpdateTree = true;
    if (isTauriAvailable()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const fromPath = getRelativePath(treeData, draggedNodeId);
        const targetDirPath = getRelativePath(treeData, targetFolderId);
        if (fromPath && targetDirPath !== null) {
          const name = fromPath.split("/").pop() || "";
          const toPath = targetDirPath ? `${targetDirPath}/${name}` : name;
          await invoke("move_notes_item", { fromRelative: fromPath, toRelative: toPath });
        }
      } catch (err) {
        console.error("[Notes] Failed to move on disk:", err);
        canUpdateTree = false;
      }
    }

    if (!canUpdateTree) {
      setDraggedNodeId(null);
      return;
    }

    // Move in tree state
    setTreeData(prev => moveNodeToFolder(prev, draggedNodeId, targetFolderId));
    // Auto-expand target folder
    setExpandedFolders(prev => new Set(prev).add(targetFolderId));
    setDraggedNodeId(null);
  };

  const handleDropOnRoot = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetId(null);

    const externalPaths = extractDroppedFilePaths(e);
    if (externalPaths.length > 0) {
      await copyDroppedFilesToFolder(externalPaths, null);
      setDraggedNodeId(null);
      return;
    }

    if (!draggedNodeId) return;

    // Move to root on disk
    let canUpdateTree = true;
    if (isTauriAvailable()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const fromPath = getRelativePath(treeData, draggedNodeId);
        if (fromPath) {
          const name = fromPath.split("/").pop() || "";
          await invoke("move_notes_item", { fromRelative: fromPath, toRelative: name });
        }
      } catch (err) {
        console.error("[Notes] Failed to move to root on disk:", err);
        canUpdateTree = false;
      }
    }

    if (!canUpdateTree) {
      setDraggedNodeId(null);
      return;
    }

    setTreeData(prev => moveNodeToFolder(prev, draggedNodeId, null));
    setDraggedNodeId(null);
  };

  // Build the relative path for a node by walking the tree
  const getRelativePath = (nodes: TreeNode[], targetId: string): string | null => {
    const walk = (items: TreeNode[], trail: string[]): string[] | null => {
      for (const n of items) {
        if (n.id === targetId) return [...trail, n.name];
        if (n.children) {
          const found = walk(n.children, [...trail, n.name]);
          if (found) return found;
        }
      }
      return null;
    };
    const parts = walk(nodes, []);
    return parts ? parts.join("/") : null;
  };

  const findFolderByRelativePath = (nodes: TreeNode[], relative: string): TreeNode | null => {
    const normalized = relative.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!normalized) return null;

    const parts = normalized.split("/").filter(Boolean);
    let currentNodes = nodes;
    let found: TreeNode | null = null;

    for (const part of parts) {
      const next = currentNodes.find(n => n.type === "folder" && n.name === part) || null;
      if (!next) return null;
      found = next;
      currentNodes = next.children || [];
    }

    return found;
  };

  const extractDroppedFilePaths = (e: React.DragEvent): string[] => {
    const result: string[] = [];

    for (const file of Array.from(e.dataTransfer.files || [])) {
      const p = (file as any)?.path as string | undefined;
      if (p) result.push(p);
    }

    if (result.length === 0) {
      for (const item of Array.from(e.dataTransfer.items || [])) {
        const file = item.getAsFile();
        const p = (file as any)?.path as string | undefined;
        if (p) result.push(p);
      }
    }

    return Array.from(new Set(result));
  };

  const copyDroppedFilesToFolder = async (sourcePaths: string[], targetFolderId: string | null) => {
    if (sourcePaths.length === 0) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const relativeDir = getRelativeDir(treeData, targetFolderId);
      type CopiedFileResult = { source_path: string; file_name: string; dest_path: string };
      const copied = await invoke<CopiedFileResult[]>("copy_files_to_notes", {
        sourcePaths,
        relativeDir,
      });

      setTreeData(prev => {
        let updated = prev;
        copied.forEach((item) => {
          const newFile: TreeNode = {
            id: `uploaded-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: item.file_name,
            type: "file",
            path: item.dest_path,
          };
          updated = addNodeToFolder(updated, targetFolderId, newFile);
        });
        return updated;
      });
      showUploadToast("success", `拖拽导入成功：${copied.length} 个文件`);
    } catch (err: any) {
      console.error("[Notes] External drop copy failed:", err);
      showUploadToast("error", `拖拽导入失败：${err?.message || String(err)}`);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current) return;
    // Calculate new width based on mouse position relative to the container
    // Assuming the container has some left padding/margin, we might need to adjust.
    // For simplicity, let's just use clientX directly if it's full width, or offset it.
    // A rough estimate:
    const newWidth = Math.max(200, Math.min(e.clientX - 280, 800)); 
    setLeftWidth(newWidth);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  const createSession = (firstMessage?: string) => {
    const id = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session: ChatSession = {
      id,
      title: firstMessage?.slice(0, 18) || "新对话",
      messages: firstMessage ? [{ role: 'user', text: firstMessage }] : [],
    };
    setChatSessions(prev => [session, ...prev]);
    setActiveSessionId(id);
    return session;
  };

  const updateSessionMessages = (sessionId: string, updater: (messages: ChatMessage[]) => ChatMessage[]) => {
    setChatSessions(prev => prev.map(session => {
      if (session.id !== sessionId) return session;
      const nextMessages = updater(session.messages);
      const nextTitle = session.title === "新对话" && nextMessages[0]?.role === 'user'
        ? nextMessages[0].text.slice(0, 18)
        : session.title;
      return { ...session, title: nextTitle, messages: nextMessages };
    }));
  };

  const buildSelectedFilesContext = async (): Promise<string> => {
    if (selected_knowledge_files.length === 0) return "";

    const filesToRead = selected_knowledge_files.slice(0, 5);
    const chunks: string[] = [];

    for (const file of filesToRead) {
      try {
        if (isTauriAvailable() && file.path) {
          const { invoke } = await import("@tauri-apps/api/core");
          const content = await invoke<string>("read_file_content", { path: file.path });
          chunks.push(`### ${file.name}\n${content.slice(0, 3000)}`);
          continue;
        }
        const local = localStorage.getItem(`eva:file:${file.name}`);
        if (local) {
          chunks.push(`### ${file.name}\n${local.slice(0, 3000)}`);
        }
      } catch (err) {
        console.error(`[Notes] Failed to read selected file for AI context: ${file.name}`, err);
      }
    }

    if (chunks.length === 0) return "";
    return `\n\n以下是用户当前选中的知识库文件内容片段，请优先结合这些上下文回答：\n${chunks.join("\n\n---\n\n")}`;
  };

  const handleAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isAiLoading) return;

    const userMsg = chatInput;
    setChatInput("");

    const currentSession = activeSession || createSession(userMsg);
    if (activeSession) {
      updateSessionMessages(activeSession.id, messages => [...messages, { role: 'user', text: userMsg }]);
    }

    updateSessionMessages(currentSession.id, messages => [...messages, { role: 'model', text: "" }]);

    setIsAiLoading(true);

    try {
      const selectedContext = await buildSelectedFilesContext();
      const context = viewingFile ? `当前文件：${viewingFile.name}。` : "当前未选中文件。";
      const runtime = getAiRuntimeConfig();
      const modelToUse = selectedModel || runtime.model || "deepseek-ai/DeepSeek-V3.2";

      const previousMessages = activeSession?.messages || [];
      const transcript = [...previousMessages, { role: "user" as const, text: userMsg }]
        .filter(m => m.text?.trim())
        .map(m => ({
          role: m.role === "model" ? "assistant" as const : "user" as const,
          content: m.text,
        }));

      await chatCompletion({
        model: modelToUse,
        temperature: 0.7,
        maxTokens: 1024,
        messages: [
          {
            role: "system",
            content: `你是EVA系统的知识库AI助手，简洁清晰地回答问题。${context}${selectedContext}`,
          },
          ...transcript,
        ],
        onDelta: (_delta, fullText) => {
          updateSessionMessages(currentSession.id, (messages) => {
            const next = [...messages];
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === "model") {
                next[i] = { ...next[i], text: fullText };
                return next;
              }
            }
            return [...next, { role: "model", text: fullText }];
          });
        },
      });
    } catch (error: any) {
      console.error("AI Error:", error);
      updateSessionMessages(currentSession.id, (messages) => {
        const next = [...messages];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === "model") {
            next[i] = { ...next[i], text: `Error: ${error.message || "Failed to get response."}` };
            return next;
          }
        }
        return [...next, { role: "model", text: `Error: ${error.message || "Failed to get response."}` }];
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const findNode = (nodes: TreeNode[], id: string): TreeNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNode(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const updateNodeName = (nodes: TreeNode[], id: string, name: string): TreeNode[] => {
    return nodes.map(node => {
      if (node.id === id) {
        return { ...node, name };
      }
      if (node.children) {
        return { ...node, children: updateNodeName(node.children, id, name) };
      }
      return node;
    });
  };

  const removeNode = (nodes: TreeNode[], id: string): TreeNode[] => {
    return nodes
      .filter(node => node.id !== id)
      .map(node => {
        if (node.children) {
          return { ...node, children: removeNode(node.children, id) };
        }
        return node;
      });
  };

  const updateNodePath = (nodes: TreeNode[], fileName: string, newPath: string): TreeNode[] => {
    return nodes.map(node => {
      if (node.type === "file" && node.name === fileName && !node.path) {
        return { ...node, path: newPath };
      }
      if (node.children) {
        return { ...node, children: updateNodePath(node.children, fileName, newPath) };
      }
      return node;
    });
  };

  // Move a node from anywhere in the tree to a target folder (or root)
  const moveNodeToFolder = (nodes: TreeNode[], nodeId: string, targetFolderId: string | null): TreeNode[] => {
    const movedNode = findNode(nodes, nodeId);
    if (!movedNode) return nodes;
    const cleaned = removeNode(nodes, nodeId);
    return addNodeToFolder(cleaned, targetFolderId, movedNode);
  };

  const addNodeToFolder = (nodes: TreeNode[], folderId: string | null, node: TreeNode): TreeNode[] => {
    if (!folderId) return [...nodes, node];
    return nodes.map(item => {
      if (item.id === folderId && item.type === "folder") {
        return { ...item, children: [...(item.children || []), node] };
      }
      if (item.children) {
        return { ...item, children: addNodeToFolder(item.children, folderId, node) };
      }
      return item;
    });
  };

  const addFilePathToTree = (nodes: TreeNode[], parts: string[]): TreeNode[] => {
    if (parts.length === 0) return nodes;
    const [head, ...tail] = parts;
    const isFile = tail.length === 0;
    if (isFile) {
      const exists = nodes.some(node => node.name === head && node.type === "file");
      if (exists) return nodes;
      return [...nodes, { id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: head, type: "file" }];
    }
    const existingIndex = nodes.findIndex(node => node.name === head && node.type === "folder");
    const existingFolder: TreeNode = existingIndex >= 0
      ? nodes[existingIndex]
      : { id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: head, type: "folder", children: [] };
    const updatedFolder = { ...existingFolder, children: addFilePathToTree(existingFolder.children || [], tail) };
    if (existingIndex >= 0) {
      return nodes.map((node, index) => index === existingIndex ? updatedFolder : node);
    }
    return [...nodes, updatedFolder];
  };

  const selectedNode = activeNodeId ? findNode(treeData, activeNodeId) : null;

  const filterTreeByKeyword = useCallback((nodes: TreeNode[], keyword: string) => {
    const expandedBySearch = new Set<string>();
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) {
      return { filtered: nodes, expanded: expandedBySearch };
    }

    const walk = (items: TreeNode[]): TreeNode[] => {
      const result: TreeNode[] = [];

      for (const node of items) {
        const selfHit = node.name.toLowerCase().includes(normalized);
        const childMatches = node.children ? walk(node.children) : [];
        const hasChildHit = childMatches.length > 0;

        if (selfHit || hasChildHit) {
          if (node.type === "folder" && hasChildHit) {
            expandedBySearch.add(node.id);
          }
          result.push({
            ...node,
            children: node.type === "folder" ? childMatches : node.children,
          });
        }
      }

      return result;
    };

    return { filtered: walk(nodes), expanded: expandedBySearch };
  }, []);

  const searchResult = useMemo(
    () => filterTreeByKeyword(treeData, searchKeyword),
    [treeData, searchKeyword, filterTreeByKeyword]
  );

  const effectiveExpandedFolders = useMemo(() => {
    if (!searchKeyword.trim()) return expandedFolders;
    const merged = new Set(expandedFolders);
    searchResult.expanded.forEach((id) => merged.add(id));
    return merged;
  }, [expandedFolders, searchResult.expanded, searchKeyword]);

  const renderTree = (nodes: TreeNode[], expandedState: Set<string>, level = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedState.has(node.id);
      const isSelected = selectedNodeIds.includes(node.id);
      const isDragTarget = dropTargetId === node.id;
      const isBeingDragged = draggedNodeId === node.id;

      return (
        <div key={node.id}>
          <div 
            data-node-row="true"
            className={cn(
              "flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer transition-all text-sm",
              isSelected ? "bg-[#88B5D3]/10 dark:bg-[#88B5D3]/20 text-[#88B5D3] dark:text-[#88B5D3]" : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300",
              isDragTarget && "ring-2 ring-[#88B5D3] bg-[#88B5D3]/15 dark:bg-[#88B5D3]/25",
              isBeingDragged && "opacity-50",
              level === 0 && "font-medium"
            )}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={(e) => handleNodeSelect(e, node)}
            onDoubleClick={() => handleNodeDoubleClick(node)}
            draggable
            onDragStart={(e) => handleDragStart(e, node.id)}
            onDragEnd={handleDragEnd}
            onDragOver={node.type === "folder" ? (e) => handleDragOver(e, node.id) : undefined}
            onDragLeave={node.type === "folder" ? handleDragLeave : undefined}
            onDrop={node.type === "folder" ? (e) => handleDropOnFolder(e, node.id) : undefined}
            onContextMenu={(e) => handleNodeContextMenu(e, node)}
          >
            {node.type === "folder" ? (
              <>
                <button
                  className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 dark:text-gray-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFolder(node.id);
                  }}
                >
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                <Folder className="w-4 h-4 text-[#88B5D3]" />
              </>
            ) : (
              <>
                <span className="w-4" /> {/* Spacer for alignment */}
                <FileText className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              </>
            )}
            <span className="truncate">{node.name}</span>
          </div>
          
          {node.type === "folder" && isExpanded && node.children && (
            <div>{renderTree(node.children, expandedState, level + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <div
      className="h-[calc(100vh-7rem)] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out"
      onContextMenu={(e) => {
        e.preventDefault();
        const target = e.target as HTMLElement;
        if (!target.closest('[data-node-row="true"]')) {
          setContextMenu(null);
          clearSelection();
        }
      }}
    >
      <header className="flex items-center justify-between mb-3 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">知识库</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">管理你的文档、笔记与资料，并使用 AI 辅助阅读。</p>
        </div>
      </header>

      <div className="flex-1 flex glass-card rounded-3xl overflow-hidden relative">
        
        {/* Left Sidebar - Tree View */}
        <div 
          className="flex flex-col bg-white/38 dark:bg-[#0f1825]/55 flex-shrink-0 border-r border-white/50 dark:border-[#2a3b52] backdrop-blur-md"
          style={{ width: leftWidth }}
        >
          <div className="p-4 border-b border-gray-200/60 dark:border-gray-800 flex items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input 
                type="text" 
                placeholder="搜索文档..." 
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#88B5D3]/20 focus:border-[#88B5D3] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all"
              />
            </div>
            <div className="flex items-center ml-2 gap-1">
              <button 
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
                onClick={() => loadTreeFromDisk()}
                title="刷新磁盘目录"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button 
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
                onClick={handleFileUpload}
                title="上传本地文件"
              >
                <Upload className="w-4 h-4" />
              </button>
              <button 
                onClick={() => handleCreateFolder()}
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors" 
                title="新建文件夹"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button 
                onClick={() => handleRenameNode()}
                disabled={!selectedNode || selectedNodeIds.length !== 1}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  selectedNode && selectedNodeIds.length === 1 ? "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800" : "text-gray-300 dark:text-gray-700 cursor-not-allowed"
                )}
                title="重命名"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button 
                onClick={handleDeleteNode}
                disabled={selectedNodeIds.length === 0}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  selectedNodeIds.length > 0 ? "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800" : "text-gray-300 dark:text-gray-700 cursor-not-allowed"
                )}
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div
            className="flex-1 overflow-y-auto p-2"
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={handleDropOnRoot}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                clearSelection();
              }
            }}
          >
            {searchResult.filtered.length === 0 ? (
              <div className="h-full min-h-48 flex flex-col items-center justify-center text-center px-4 text-gray-500 dark:text-gray-400">
                <Folder className="w-10 h-10 mb-3 text-[#88B5D3]/70" />
                <p className="font-medium">{searchKeyword.trim() ? "未找到匹配结果" : "当前暂无文档"}</p>
                <p className="text-xs mt-1">{searchKeyword.trim() ? "请尝试更换关键词" : "上传文件或新建文件夹后，这里会显示你的知识库结构"}</p>
              </div>
            ) : (
              renderTree(searchResult.filtered, effectiveExpandedFolders)
            )}
          </div>
        </div>

        {/* Resizer */}
        <div 
          className="w-1 bg-gray-200 dark:bg-gray-800 hover:bg-[#88B5D3] dark:hover:bg-[#88B5D3] cursor-col-resize transition-colors z-10"
          onMouseDown={handleMouseDown}
        />

        {/* Right Area - AI Chat */}
        <div className="flex-1 flex bg-white/40 dark:bg-[#0f1826]/58 min-w-0 backdrop-blur-md">
          <aside className="w-64 border-r border-white/45 dark:border-[#2a3b52] p-3 space-y-3 hidden lg:block">
            <button
              onClick={() => createSession()}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-[#88B5D3] bg-[#88B5D3]/10 hover:bg-[#88B5D3]/16 px-3 py-2 rounded-xl transition-colors"
            >
              <MessageSquarePlus className="w-4 h-4" /> 新建对话
            </button>
            <div className="space-y-1 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
              {chatSessions.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 p-2">暂无历史对话</p>
              ) : chatSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors truncate",
                    activeSessionId === session.id ? "bg-[#88B5D3]/14 text-[#88B5D3]" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100/70 dark:hover:bg-[#162233]"
                  )}
                >
                  {session.title}
                </button>
              ))}
            </div>
          </aside>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="p-4 border-b border-white/45 dark:border-[#2a3b52] flex items-center gap-2 bg-[#88B5D3]/6 dark:bg-[#88B5D3]/10">
              <Sparkles className="w-5 h-5 text-[#88B5D3]" />
              <h3 className="font-semibold text-gray-900 dark:text-white">知识库 AI 助手</h3>
              <select
                value={selectedModel}
                onChange={(e) => {
                  const next = e.target.value;
                  setSelectedModel(next);
                  updateSettings({ aiModel: next });
                  localStorage.setItem("eva.ai.model", next);
                }}
                className="ml-2 text-xs font-medium bg-white/90 dark:bg-[#0f1826] border border-[#88B5D3]/30 rounded-lg px-2 py-1 text-gray-700 dark:text-gray-200 focus:outline-none"
              >
                <option value="deepseek-ai/DeepSeek-V3.2">deepseek-ai/DeepSeek-V3.2</option>
                <option value="deepseek-ai/DeepSeek-R1">deepseek-ai/DeepSeek-R1</option>
                <option value="deepseek-ai/DeepSeek-V3">deepseek-ai/DeepSeek-V3</option>
              </select>
              {viewingFile && (
                <span className="ml-auto text-xs bg-white/85 dark:bg-[#0f1826] border border-[#88B5D3]/20 text-[#88B5D3] px-2 py-1 rounded-md flex items-center gap-1">
                  <FileText className="w-3 h-3" /> 当前上下文: {viewingFile.name}
                </span>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {chatHistory.length === 0 ? (
                <div className="h-full min-h-56 flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400">
                  <Bot className="w-11 h-11 mb-3 text-[#88B5D3]/70" />
                  <p className="font-medium">当前暂无历史对话，开始提问吧</p>
                  <p className="text-xs mt-1">已接入 SiliconFlow 流式输出，输入“你好”可测试连通性</p>
                </div>
              ) : chatHistory.map((msg, idx) => (
                <div key={idx} className={cn("flex gap-4", msg.role === 'user' ? "flex-row-reverse" : "")}>
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                    msg.role === 'user' ? "bg-gray-100 dark:bg-gray-800" : "bg-[#88B5D3]/10 dark:bg-[#88B5D3]/20 text-[#88B5D3]"
                  )}>
                    {msg.role === 'user' ? <User className="w-4 h-4 text-gray-600 dark:text-gray-400" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div className={cn(
                    "px-4 py-3 rounded-2xl max-w-[80%] text-sm leading-relaxed",
                    msg.role === 'user' ? "bg-gray-100/90 dark:bg-[#19283b] text-gray-900 dark:text-white rounded-tr-sm" : "bg-[#88B5D3]/7 dark:bg-[#88B5D3]/12 text-gray-800 dark:text-gray-200 rounded-tl-sm border border-[#88B5D3]/20"
                  )}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isAiLoading && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#88B5D3]/10 dark:bg-[#88B5D3]/20 text-[#88B5D3] flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl bg-[#88B5D3]/5 dark:bg-[#88B5D3]/10 text-gray-800 dark:text-gray-200 rounded-tl-sm border border-[#88B5D3]/20 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-[#88B5D3] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-[#88B5D3] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-[#88B5D3] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4 border-t border-white/45 dark:border-[#2a3b52] bg-white/35 dark:bg-[#0f1826]/55">
              <form onSubmit={handleAiSubmit} className="relative">
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="向 AI 提问关于你的知识库..." 
                  className="w-full pl-4 pr-12 py-3 bg-white/90 dark:bg-[#0f1826] border border-gray-200 dark:border-[#2c3f58] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#88B5D3]/20 focus:border-[#88B5D3] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 shadow-sm transition-all"
                />
                <button 
                  type="submit"
                  disabled={!chatInput.trim() || isAiLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-[#88B5D3] text-white rounded-lg hover:bg-[#75a0be] disabled:opacity-50 disabled:hover:bg-[#88B5D3] transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Prompt Dialogs - rendered unconditionally */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title={selectedNodeIds.length > 1 ? `确定批量删除这 ${selectedNodeIds.length} 个项目？` : `确定删除「${selectedNode?.name || ""}」？`}
        description={selectedNodeIds.length > 1 ? "仅会删除已选择文件，删除后无法恢复。" : (selectedNode?.type === "folder" ? "该文件夹及其所有子文件将一并删除。" : "删除后将无法恢复。")}
        confirmText="删除"
        variant="danger"
        onConfirm={confirmDeleteNode}
        onCancel={() => setShowDeleteConfirm(false)}
      />
      <ThemedPromptDialog
        open={promptMode === "create-folder"}
        title="请输入新文件夹名称"
        placeholder="例如：操作系统 / 线代"
        confirmText="创建"
        onCancel={() => setPromptMode(null)}
        onConfirm={(value) => {
          handleCreateFolder(value);
          setPromptMode(null);
        }}
      />
      <ThemedPromptDialog
        open={promptMode === "rename"}
        title="请输入新的名称"
        placeholder={selectedNode?.name || "新名称"}
        initialValue={selectedNode?.name || ""}
        confirmText="重命名"
        onCancel={() => setPromptMode(null)}
        onConfirm={(value) => {
          handleRenameNode(value);
          setPromptMode(null);
        }}
      />
      <ThemedPromptDialog
        open={promptMode === "move"}
        title="请输入目标文件夹路径"
        placeholder="例如：数学/错题集"
        confirmText="归档"
        onCancel={() => setPromptMode(null)}
        onConfirm={(value) => {
          handleMoveSelected(value);
          setPromptMode(null);
        }}
      />

      {/* Document Viewer Modal */}
      {viewingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm" onClick={() => setViewingFile(null)}></div>
          <div className="relative bg-white dark:bg-gray-950 rounded-[2rem] shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-200/50 dark:border-gray-800">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center gap-2">
                <File className="w-5 h-5 text-[#88B5D3]" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{viewingFile.name}</h3>
              </div>
              <button onClick={() => setViewingFile(null)} className="p-2 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 bg-gray-100 dark:bg-gray-950 overflow-y-auto">
              {(() => {
                const ext = viewingFile.name.split(".").pop()?.toLowerCase() || "";
                // PDF preview
                if (ext === "pdf") {
                  if (isTauriAvailable() && viewingFile.path) {
                    return (
                      <iframe
                        src={viewingFile.path}
                        className="w-full h-full border-none"
                        title={viewingFile.name}
                      />
                    );
                  }
                  return (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
                      <FileText className="w-16 h-16 mb-4 opacity-20" />
                      <p className="text-lg font-medium">PDF 预览</p>
                      <p className="text-sm mt-2">该 PDF 文件无法在当前模式下预览</p>
                    </div>
                  );
                }
                // Markdown preview
                if (ext === "md") {
                  if (isLoadingContent) {
                    return (
                      <div className="flex items-center justify-center h-full">
                        <div className="flex items-center gap-2 text-gray-500">
                          <span className="w-2 h-2 bg-[#88B5D3] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-[#88B5D3] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 bg-[#88B5D3] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    );
                  }
                  if (fileContent) {
                    return (
                      <div className="bg-white dark:bg-gray-900 w-full max-w-3xl mx-auto min-h-full shadow-sm border-x border-gray-200 dark:border-gray-800 p-8 md:p-12">
                        <article className="notes-markdown prose prose-gray dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-white prose-a:text-[#88B5D3]">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
                        </article>
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
                      <FileText className="w-16 h-16 mb-4 opacity-20" />
                      <p className="text-lg font-medium">无法加载文件内容</p>
                      <p className="text-sm mt-2">请确认文件已正确上传并保存至磁盘</p>
                    </div>
                  );
                }
                // Text file preview
                const isText = ["txt", "json", "js", "ts", "tsx", "jsx", "css", "html", "xml", "yaml", "yml", "toml", "csv", "log"].includes(ext);
                if (isText) {
                  if (isLoadingContent) {
                    return (
                      <div className="flex items-center justify-center h-full">
                        <div className="flex items-center gap-2 text-gray-500">
                          <span className="w-2 h-2 bg-[#88B5D3] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-[#88B5D3] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 bg-[#88B5D3] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    );
                  }
                  if (fileContent) {
                    return (
                      <div className="bg-white dark:bg-gray-900 w-full max-w-3xl mx-auto min-h-full shadow-sm border-x border-gray-200 dark:border-gray-800 p-8 md:p-12">
                        <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words font-mono leading-relaxed">
                          {fileContent}
                        </pre>
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
                      <FileText className="w-16 h-16 mb-4 opacity-20" />
                      <p className="text-lg font-medium">无法加载文件内容</p>
                    </div>
                  );
                }
                // Unsupported format
                return (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
                    <FileText className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-lg font-medium">不支持预览此文件格式</p>
                    <p className="text-sm mt-2">{viewingFile.name}（.{ext}）暂不支持在线预览</p>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {uploadToast && (
        <div className="absolute bottom-4 right-4 z-50">
          <div
            className={cn(
              "px-3 py-2 rounded-lg text-xs shadow-lg border",
              uploadToast.type === "success"
                ? "bg-emerald-500/95 text-white border-emerald-400"
                : "bg-red-500/95 text-white border-red-400"
            )}
          >
            {uploadToast.message}
          </div>
        </div>
      )}
      {contextMenu && (() => {
        const node = findNode(treeData, contextMenu.nodeId);
        if (!node || node.type !== "file") return null;
        return (
          <div
            className="fixed z-[120] min-w-[160px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#101a29] shadow-xl p-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              className="w-full text-left px-3 py-2 text-sm rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1a2a40]"
              onClick={() => {
                setViewingFile(node);
                setContextMenu(null);
              }}
            >
              打开
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1a2a40]"
              onClick={() => {
                setSelectedNodeIds([node.id]);
                setActiveNodeId(node.id);
                handleRenameNode();
                setContextMenu(null);
              }}
            >
              重命名
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
              onClick={() => {
                setShowDeleteConfirm(true);
                setContextMenu(null);
              }}
            >
              删除{selectedNodeIds.length > 1 ? `（${selectedNodeIds.length} 项）` : ""}
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1a2a40]"
              onClick={() => {
                setPromptMode("move");
                setContextMenu(null);
              }}
            >
              移动到...{selectedNodeIds.length > 1 ? `（${selectedNodeIds.length} 项）` : ""}
            </button>
          </div>
        );
      })()}
    </div>
  );
}
