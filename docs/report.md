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
