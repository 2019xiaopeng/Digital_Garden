# Phase 5 桌面原生化与打包发布报告（v1.0）

## 1) Cargo.toml 新增依赖

```toml
[dependencies]
rust-embed = "8.0"
mime_guess = "2.0"

[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]
tauri-plugin-global-shortcut = "2"
```

## 2) lib.rs：托盘、快捷键、关闭拦截核心代码

```rust
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn command_or_control_modifiers() -> Modifiers {
    if cfg!(target_os = "macos") {
        Modifiers::SUPER | Modifiers::SHIFT
    } else {
        Modifiers::CONTROL | Modifiers::SHIFT
    }
}

fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        let focused = window.is_focused().unwrap_or(false);

        if visible && focused {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_main_window(app);
                    }
                })
                .build(),
        )
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let shortcut = Shortcut::new(Some(command_or_control_modifiers()), Code::KeyE);
            app.global_shortcut().register(shortcut)?;

            let tray_toggle = MenuItem::with_id(app, "tray_toggle", "显示/隐藏面板", true, None::<&str>)?;
            let tray_quit = MenuItem::with_id(app, "tray_quit", "退出系统", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&tray_toggle, &tray_quit])?;

            let _tray = TrayIconBuilder::with_id("eva_tray")
                .menu(&tray_menu)
                .tooltip("EVA 考研辅助终端")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "tray_toggle" => toggle_main_window(app),
                    "tray_quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    }
                    | TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } => {
                        let app = tray.app_handle();
                        toggle_main_window(&app);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        });
}
```

## 3) lib.rs：Axum + rust-embed 提供 SPA 静态资源（含 index.html fallback）

```rust
use axum::body::Body;
use axum::http::{header, StatusCode, Uri};
use axum::response::Response;
use mime_guess::from_path;
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../dist"]
struct FrontendAssets;

fn normalize_embedded_asset_path(uri_path: &str) -> String {
    let trimmed = uri_path.trim_start_matches('/');
    if trimmed.is_empty() {
        return "index.html".to_string();
    }
    trimmed
        .split('/')
        .filter(|seg| !seg.is_empty() && *seg != "." && *seg != "..")
        .collect::<Vec<_>>()
        .join("/")
}

fn embedded_asset_response(path: &str) -> Response<Body> {
    if let Some(asset) = FrontendAssets::get(path) {
        let mime = from_path(path).first_or_octet_stream();
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, mime.as_ref())
            .body(Body::from(asset.data.into_owned()))
            .unwrap();
    }

    // SPA fallback: 任意未知路径回退到 index.html
    if let Some(index) = FrontendAssets::get("index.html") {
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .body(Body::from(index.data.into_owned()))
            .unwrap();
    }

    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(Body::from("Embedded frontend assets not found"))
        .unwrap()
}

async fn embedded_static_handler(uri: Uri) -> Response<Body> {
    let path = normalize_embedded_asset_path(uri.path());
    embedded_asset_response(&path)
}

// Axum router 核心：移除 ServeDir，改为 fallback 嵌入静态资源
let router = Router::new()
    .route("/api/ping", get(local_ping_handler))
    .route("/api/tasks", get(api_tasks_handler).post(api_create_task_handler))
    .route("/api/tasks/{id}", put(api_update_task_handler).delete(api_delete_task_handler))
    .route("/api/resources", get(api_resources_handler))
    .route("/api/notes/tree", get(...))
    .route("/api/notes/file", get(...))
    .route("/api/quiz/all", get(api_quiz_all_handler))
    .route("/api/quiz/due", get(api_quiz_due_handler))
    .fallback(embedded_static_handler)
    .layer(CorsLayer::permissive())
    .with_state(shared_db);
```

---

## 4) Layout.tsx：背景锚定 + 断点布局 + 移动端底部导航（核心片段）

```tsx
const mobileNavItems = [
    { name: "首页", path: "/", icon: Home },
    { name: "任务", path: "/tasks", icon: CalendarDays },
    { name: "知识库", path: "/notes", icon: BookOpen },
    { name: "练功房", path: "/quiz", icon: Swords },
];

<div
    className="fixed inset-0 z-0 opacity-100 dark:opacity-100 pointer-events-none bg-cover bg-no-repeat"
    style={{ backgroundImage: "var(--bg-image)", backgroundPosition: "80% center" }}
/>

<main className="md:ml-64 min-h-screen pb-24 md:pb-0">
    <div className={`${isNotesPage ? "max-w-[96rem]" : "max-w-5xl"} mx-auto p-4 md:p-8 lg:p-10`}>
        <Outlet />
    </div>
</main>

<nav className="fixed bottom-0 inset-x-0 md:hidden z-50 border-t border-white/55 dark:border-[#2a3b52] bg-white/66 dark:bg-[#0e1724]/74 backdrop-blur-xl">
    <div className="grid grid-cols-4 gap-1 px-2 py-2">
        {mobileNavItems.map((item) => (
            <Link key={item.path} to={item.path} className="flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-medium">
                <item.icon className="w-5 h-5" />
                {item.name}
            </Link>
        ))}
    </div>
</nav>
```

## 5) 路由防守：拦截 Settings（核心片段）

```tsx
function SettingsDesktopOnly() {
    if (isTauriAvailable()) return <Settings />;

    return (
        <section className="glass-card rounded-3xl p-8 text-center">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">设置仅在桌面端开放</h2>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                当前为局域网 Web 模式。系统级设置与数据清理操作仅支持桌面端执行。
            </p>
        </section>
    );
}

<Route path="settings" element={<SettingsDesktopOnly />} />
```

## 6) Dashboard / Tasks 响应式与触控关键类名对照

- Dashboard 首屏卡片：`grid-cols-1 xl:grid-cols-3`
- Dashboard 数据大盘：`grid-cols-1 lg:grid-cols-[1fr_auto]`
- Dashboard NERV 数据块：`grid-cols-2 sm:grid-cols-4 lg:grid-cols-2`
- Tasks 列表行间距：`space-y-5`
- Tasks Checkbox 热区：`w-10 h-10 rounded-xl flex items-center justify-center`

---

## 7) lib.rs：WebSocket 路由 + 广播触发（核心片段）

```rust
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use tokio::sync::{broadcast, oneshot, Mutex};

struct SyncHub {
        tx: broadcast::Sender<String>,
        app: tauri::AppHandle,
}

#[derive(Clone)]
struct LanAppState {
        db: Arc<Mutex<AppDb>>,
        sync_hub: Arc<SyncHub>,
}

fn emit_sync_action(sync_hub: &SyncHub, action: &str) {
        let payload = serde_json::json!({ "action": action }).to_string();
        let _ = sync_hub.tx.send(payload.clone());
        let _ = sync_hub.app.emit("sync-update", payload);
}

async fn api_ws_handler(AxumState(state): AxumState<LanAppState>, ws: WebSocketUpgrade) -> impl IntoResponse {
        let tx = state.sync_hub.tx.clone();
        ws.on_upgrade(move |socket| async move {
                let rx = tx.subscribe();
                ws_client_loop(socket, rx).await;
        })
}

let router = Router::new()
        .route("/api/ws", get(api_ws_handler))
        .route("/api/tasks", get(api_tasks_handler).post(api_create_task_handler))
        .route("/api/tasks/{id}", put(api_update_task_handler).delete(api_delete_task_handler))
        .with_state(lan_state);

// 任务写入后触发广播 + 桌面事件
emit_sync_action(&state.sync_hub, "SYNC_TASKS");
```

## 8) useSync.ts：双模监听器完整代码

```ts
export function useSync(action: string, onSync: () => void) {
    useEffect(() => {
        if (isTauriRuntime()) {
            import("@tauri-apps/api/event")
                .then(({ listen }) => listen("sync-update", (event) => {
                    const incomingAction = normalizeAction(event.payload);
                    if (incomingAction === action) onSync();
                }));
            return;
        }

        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        let socket = new WebSocket(`${protocol}://${window.location.host}/api/ws`);
        let timer: ReturnType<typeof setTimeout> | null = null;

        const reconnect = () => {
            timer = setTimeout(() => {
                socket = new WebSocket(`${protocol}://${window.location.host}/api/ws`);
            }, 1200);
        };

        socket.onmessage = (event) => {
            const incomingAction = normalizeAction(event.data);
            if (incomingAction === action) onSync();
        };
        socket.onerror = () => socket.close();
        socket.onclose = reconnect;

        return () => {
            if (timer) clearTimeout(timer);
            if (socket.readyState === WebSocket.OPEN) socket.close();
        };
    }, [action, onSync]);
}
```

## 9) Tasks.tsx：接入监听并静默刷新（关键片段）

```tsx
const refreshTasksSilently = useCallback(() => {
    fetchTasks()
        .then((loaded) => {
            setTasks(loaded);
        })
        .catch(() => {});
}, []);

useSync("SYNC_TASKS", refreshTasksSilently);
```
