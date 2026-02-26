import { useEffect } from "react";

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
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    if (isTauriRuntime()) {
      import("@tauri-apps/api/event")
        .then(({ listen }) => listen<unknown>("sync-update", (event) => {
          const incomingAction = normalizeAction(event.payload);
          if (incomingAction === action) {
            onSync();
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
    const reconnectDelayMs = 1200;

    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      clearReconnect();
      reconnectTimer = setTimeout(connect, reconnectDelayMs);
    };

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${protocol}://${window.location.host}/api/ws`);

      socket.onmessage = (event) => {
        const incomingAction = normalizeAction(event.data);
        if (incomingAction === action) {
          onSync();
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
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [action, onSync]);
}
