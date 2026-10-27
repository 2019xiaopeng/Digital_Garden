import { useEffect, useRef } from "react";

type SyncCallback = () => void;

type SyncPayload = {
  action?: string;
};

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return Boolean(win.__TAURI__ || win.__TAURI_INTERNALS__);
}

function normalizeAction(payload: unknown): string | null {
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload) as SyncPayload;
      if (parsed?.action) return parsed.action;
    } catch {
      return payload;
    }
    return payload;
  }

  if (payload && typeof payload === "object" && "action" in payload) {
    const action = (payload as SyncPayload).action;
    return typeof action === "string" ? action : null;
  }

  return null;
}

export function useSync(action: string, onSync: SyncCallback) {
  // 回调用 ref 中转：onSync 通常是调用方每次渲染新建的函数，直接进依赖数组会导致每次渲染断开重连
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    if (isTauriRuntime()) {
      import("@tauri-apps/api/event")
        .then(({ listen }) => listen<unknown>("sync-update", (event) => {
          const incomingAction = normalizeAction(event.payload);
          if (incomingAction === action) {
            onSyncRef.current();
          }
        }))
        .then((dispose) => {
          if (disposed) {
            dispose();
            return;
          }
          unlisten = dispose;
        })
        .catch((error) => {
          console.warn("[useSync] Failed to listen desktop sync event:", error);
        });

      return () => {
        disposed = true;
        if (unlisten) unlisten();
      };
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    // 复审修复：指数退避 + 上限，令牌缺失/失效时不再 1.2s 永久重连风暴
    let reconnectAttempts = 0;

    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      clearReconnect();
      reconnectAttempts += 1;
      if (reconnectAttempts > 12) {
        console.warn("[useSync] LAN 连接多次失败，已停止重连（令牌无效或服务未开启）");
        return;
      }
      const delay = Math.min(1200 * 2 ** Math.min(reconnectAttempts - 1, 5), 30000);
      reconnectTimer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      // F1: WebSocket 无法带 Authorization 头，令牌走查询参数
      const token = window.localStorage.getItem("eva.lan.token") || "";
      const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";
      socket = new WebSocket(`${protocol}://${window.location.host}/api/ws${tokenQuery}`);
      socket.onopen = () => {
        reconnectAttempts = 0;
      };

      socket.onmessage = (event) => {
        const incomingAction = normalizeAction(event.data);
        if (incomingAction === action) {
          onSyncRef.current();
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      disposed = true;
      clearReconnect();
      // 不论 OPEN 还是 CONNECTING 都要关，否则连接中的 socket 会泄漏并继续触发回调
      socket?.close();
    };
  }, [action]);
}
