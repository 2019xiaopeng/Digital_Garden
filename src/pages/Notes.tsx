import React, { useState, useRef, useEffect } from "react";
import { 
  Folder, FileText, ChevronRight, ChevronDown, 
  Search, Plus, Sparkles, Send, Bot, User, X, File, Upload, Edit2, Trash2, MessageSquarePlus
} from "lucide-react";
import { cn } from "../lib/utils";
import { ThemedPromptDialog } from "../components/ThemedPromptDialog";
import { isTauriAvailable, AiService } from "../lib/dataService";
import { getSettings } from "../lib/settings";

// --- Types & Mock Data ---
type TreeNode = {
  id: string;
  name: string;
  type: "folder" | "file";
  children?: TreeNode[];
};

const initialTree: TreeNode[] = [
  
];

type ChatMessage = { role: 'user' | 'model'; text: string };
type ChatSession = { id: string; title: string; messages: ChatMessage[] };

export function Notes() {
  const [treeData, setTreeData] = useState<TreeNode[]>(() => {
    try {
      const saved = localStorage.getItem("eva:knowledge-tree");
      if (saved) return JSON.parse(saved) as TreeNode[];
    } catch {}
    return initialTree;
  });
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<TreeNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  
  // Resizable pane state
  const [leftWidth, setLeftWidth] = useState(300);
  const isDragging = useRef(false);

  // AI Chat State
  const [chatInput, setChatInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<"deepseek" | "kimi" | "minimax">("deepseek");
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [promptMode, setPromptMode] = useState<null | "create-folder" | "rename">(null);

  const activeSession = chatSessions.find(session => session.id === activeSessionId) || null;
  const chatHistory = activeSession?.messages || [];

  const directoryInputProps = { webkitdirectory: "true" } as React.HTMLAttributes<HTMLInputElement>;

  // Persist tree data to localStorage
  useEffect(() => {
    localStorage.setItem("eva:knowledge-tree", JSON.stringify(treeData));
  }, [treeData]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const toggleFolder = (id: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedFolders(newExpanded);
  };

  const handleNodeClick = (node: TreeNode) => {
    setSelectedNodeId(node.id);
    if (node.type === "folder") {
      toggleFolder(node.id);
      return;
    }
    setViewingFile(node);
  };

  const handleCreateFolder = (folderName?: string) => {
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
  };

  const handleFileUpload = async (e?: React.ChangeEvent<HTMLInputElement>) => {
    if (isTauriAvailable() && !e) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const picked = await open({ multiple: true, filters: [{ name: "All", extensions: ["*"] }] });
        const list = Array.isArray(picked) ? picked : picked ? [picked] : [];
        if (list.length === 0) return;
        const targetFolderId = selectedNode?.type === "folder" ? selectedNode.id : null;
        setTreeData(prev => {
          let updated = prev;
          list.forEach((path, index) => {
            const name = String(path).split(/[\\/]/).pop() || `文件-${index + 1}`;
            const newFile: TreeNode = {
              id: `uploaded-${Date.now()}-${name}-${Math.random().toString(36).slice(2, 8)}`,
              name,
              type: "file"
            };
            updated = addNodeToFolder(updated, targetFolderId, newFile);
          });
          return updated;
        });
        return;
      } catch {}
    }
    if (!e) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const targetFolderId = selectedNode?.type === "folder" ? selectedNode.id : null;
    setTreeData(prev => {
      let updated = prev;
      Array.from(files).forEach((file: File) => {
        const newFile: TreeNode = {
          id: `uploaded-${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          type: "file"
        };
        updated = addNodeToFolder(updated, targetFolderId, newFile);
      });
      return updated;
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFolderUpload = async (e?: React.ChangeEvent<HTMLInputElement>) => {
    if (isTauriAvailable() && !e) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const picked = await open({ directory: true, multiple: false });
        if (picked && typeof picked === "string") {
          const folderName = picked.split(/[\\/]/).pop() || "新目录";
          const newFolder: TreeNode = {
            id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: folderName,
            type: "folder",
            children: [],
          };
          const targetFolderId = selectedNode?.type === "folder" ? selectedNode.id : null;
          setTreeData(prev => addNodeToFolder(prev, targetFolderId, newFolder));
        }
        return;
      } catch {}
    }
    if (!e) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setTreeData(prev => {
      let updated = prev;
      Array.from(files).forEach((file: File) => {
        const relativePath = (file as any).webkitRelativePath || file.name;
        const parts = relativePath.split("/").filter(Boolean);
        updated = addFilePathToTree(updated, parts);
      });
      return updated;
    });
    if (directoryInputRef.current) {
      directoryInputRef.current.value = '';
    }
  };

  const handleRenameNode = (nextName?: string) => {
    if (!selectedNode) return;
    if (!nextName) {
      setPromptMode("rename");
      return;
    }
    setTreeData(prev => updateNodeName(prev, selectedNode.id, nextName));
    if (viewingFile?.id === selectedNode.id) {
      setViewingFile({ ...viewingFile, name: nextName });
    }
  };

  const handleDeleteNode = () => {
    if (!selectedNode) return;
    const confirmed = confirm(`确定要删除 "${selectedNode.name}" 吗？`);
    if (!confirmed) return;
    setTreeData(prev => removeNode(prev, selectedNode.id));
    if (viewingFile?.id === selectedNode.id) {
      setViewingFile(null);
    }
    setSelectedNodeId(null);
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

  const getModelLabel = (model: "deepseek" | "kimi" | "minimax") => {
    if (model === "deepseek") return "DeepSeek";
    if (model === "kimi") return "Kimi";
    return "MiniMax";
  };

  const getAiReply = async (userMsg: string) => {
    const settings = getSettings();
    const modelLabel = getModelLabel(selectedModel);
    const context = viewingFile ? `当前文件：${viewingFile.name}。` : '当前未选中文件。';

    // Determine API config based on selected model
    let apiUrl: string;
    let apiKey: string;
    let model: string;

    if (selectedModel === "kimi") {
      apiUrl = "https://api.moonshot.cn/v1/chat/completions";
      apiKey = settings.aiKimiKey || "";
      model = "moonshot-v1-8k";
    } else if (selectedModel === "minimax") {
      apiUrl = "https://api.minimax.chat/v1/text/chatcompletion_v2";
      apiKey = settings.aiMinimaxKey || "";
      model = "MiniMax-Text-01";
    } else {
      apiUrl = "https://api.deepseek.com/v1/chat/completions";
      apiKey = settings.aiApiKey || "";
      model = "deepseek-chat";
    }

    if (!apiKey) {
      return `【${modelLabel}】已收到你的问题：${userMsg}\n\n当前未配置 ${modelLabel} 的 API Key，请前往"设置"页面填写。已进入离线回执模式。`;
    }

    try {
      const response = await AiService.callApi({
        api_url: apiUrl,
        api_key: apiKey,
        model,
        system_prompt: `你是EVA系统的知识库AI助手，简洁清晰地回答问题。${context}`,
        user_message: userMsg,
        temperature: 0.7,
        max_tokens: 1024,
      });
      return response.content || "No response.";
    } catch (error: any) {
      return `调用 ${modelLabel} API 失败: ${error.message || "未知错误"}`;
    }
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

    setIsAiLoading(true);

    try {
      const aiText = await getAiReply(userMsg);
      updateSessionMessages(currentSession.id, messages => [...messages, { role: 'model', text: aiText }]);
    } catch (error: any) {
      console.error("AI Error:", error);
      updateSessionMessages(currentSession.id, messages => [...messages, { role: 'model', text: `Error: ${error.message || "Failed to get response."}` }]);
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

  const selectedNode = selectedNodeId ? findNode(treeData, selectedNodeId) : null;

  const renderTree = (nodes: TreeNode[], level = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedFolders.has(node.id);
      const isSelected = selectedNodeId === node.id;

      return (
        <div key={node.id}>
          <div 
            className={cn(
              "flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer transition-colors text-sm",
              isSelected ? "bg-[#88B5D3]/10 dark:bg-[#88B5D3]/20 text-[#88B5D3] dark:text-[#88B5D3]" : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300",
              level === 0 && "font-medium"
            )}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={() => handleNodeClick(node)}
          >
            {node.type === "folder" ? (
              <>
                <button className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 dark:text-gray-500">
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
            <div>{renderTree(node.children, level + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      <header className="flex items-center justify-between mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">知识库</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">管理你的文档、笔记与资料，并使用 AI 辅助阅读。</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">建议存储目录：~/Documents/EVA_Knowledge_Base/Notes</p>
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
                className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#88B5D3]/20 focus:border-[#88B5D3] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all"
              />
            </div>
            <div className="flex items-center ml-2 gap-1">
              <button 
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
                onClick={() => isTauriAvailable() ? handleFileUpload() : fileInputRef.current?.click()}
                title="上传本地文件"
              >
                <Upload className="w-4 h-4" />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                multiple 
                onChange={handleFileUpload} 
              />
              <button 
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
                onClick={() => isTauriAvailable() ? handleFolderUpload() : directoryInputRef.current?.click()}
                title="上传文件夹"
              >
                <Folder className="w-4 h-4" />
              </button>
              <input 
                type="file" 
                ref={directoryInputRef} 
                className="hidden" 
                multiple 
                onChange={handleFolderUpload}
                {...directoryInputProps}
              />
              <button 
                onClick={() => handleCreateFolder()}
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors" 
                title="新建文件夹"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button 
                onClick={() => handleRenameNode()}
                disabled={!selectedNode}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  selectedNode ? "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800" : "text-gray-300 dark:text-gray-700 cursor-not-allowed"
                )}
                title="重命名"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button 
                onClick={handleDeleteNode}
                disabled={!selectedNode}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  selectedNode ? "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800" : "text-gray-300 dark:text-gray-700 cursor-not-allowed"
                )}
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {treeData.length === 0 ? (
              <div className="h-full min-h-48 flex flex-col items-center justify-center text-center px-4 text-gray-500 dark:text-gray-400">
                <Folder className="w-10 h-10 mb-3 text-[#88B5D3]/70" />
                <p className="font-medium">当前暂无文档</p>
                <p className="text-xs mt-1">上传文件或新建文件夹后，这里会显示你的知识库结构</p>
              </div>
            ) : (
              renderTree(treeData)
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
                onChange={(e) => setSelectedModel(e.target.value as "deepseek" | "kimi" | "minimax")}
                className="ml-2 text-xs font-medium bg-white/90 dark:bg-[#0f1826] border border-[#88B5D3]/30 rounded-lg px-2 py-1 text-gray-700 dark:text-gray-200 focus:outline-none"
              >
                <option value="deepseek">DeepSeek</option>
                <option value="kimi">Kimi</option>
                <option value="minimax">MiniMax</option>
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
                  <p className="text-xs mt-1">已支持模型切换：DeepSeek / Kimi / MiniMax</p>
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
            <div className="flex-1 bg-gray-100 dark:bg-gray-950 flex items-center justify-center p-8 overflow-y-auto">
              {/* Placeholder for PDF/Markdown content */}
              <div className="bg-white dark:bg-gray-900 w-full max-w-3xl min-h-full shadow-sm border border-gray-200 dark:border-gray-800 p-12 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                <FileText className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">文档预览区域</p>
                <p className="text-sm mt-2 text-center max-w-md">
                  这里将渲染 {viewingFile.name} 的内容。如果是 PDF，可以使用 react-pdf；如果是 Markdown，可以使用 react-markdown。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
