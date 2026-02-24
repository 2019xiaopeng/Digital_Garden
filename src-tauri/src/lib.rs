use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

// ═══════════════════════════════════════════════════════════
// Data Structures (shared between Rust & Frontend)
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: String,      // "todo" | "in-progress" | "done"
    pub priority: String,    // "low" | "medium" | "high"
    pub date: String,        // YYYY-MM-DD
    pub start_time: String,  // HH:mm
    pub duration: f64,       // hours
    pub tags: String,        // comma-separated
    pub repeat_type: String, // "none" | "daily" | "weekly"
    pub timer_type: String,  // "none" | "pomodoro" | "countdown"
    pub timer_duration: i32, // minutes
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailyLog {
    pub id: String,
    pub date: String,        // YYYY-MM-DD
    pub title: String,
    pub content: String,     // Markdown content
    pub mood: String,        // "happy" | "sad" | "neutral" | "focused"
    pub sync_rate: i32,      // 0-100
    pub tags: String,        // comma-separated
    pub auto_generated: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FocusSession {
    pub id: String,
    pub date: String,
    pub checked_in_at: Option<String>,
    pub checked_out_at: Option<String>,
    pub total_focus_seconds: i64,
    pub active_task_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiProxyRequest {
    pub api_url: String,
    pub api_key: String,
    pub model: String,
    pub system_prompt: String,
    pub user_message: String,
    pub temperature: Option<f64>,
    pub max_tokens: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiProxyResponse {
    pub content: String,
    pub model: String,
    pub usage: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportedTask {
    pub title: String,
    pub date: String,
    pub priority: String,
    pub tags: Vec<String>,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportReport {
    pub total: usize,
    pub created: usize,
    pub skipped: usize,
    pub tasks: Vec<ImportedTask>,
}

pub struct AppDb {
    pub db: sqlx::SqlitePool,
}

// ═══════════════════════════════════════════════════════════
// Database Initialization
// ═══════════════════════════════════════════════════════════

async fn init_db(db_path: &str) -> Result<sqlx::SqlitePool, String> {
    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(db_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create db directory: {}", e))?;
    }

    let db_url = format!("sqlite:{}?mode=rwc", db_path);
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    // Create tables
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            status TEXT DEFAULT 'todo',
            priority TEXT DEFAULT 'medium',
            date TEXT NOT NULL,
            start_time TEXT DEFAULT '09:00',
            duration REAL DEFAULT 1.0,
            tags TEXT DEFAULT '',
            repeat_type TEXT DEFAULT 'none',
            timer_type TEXT DEFAULT 'none',
            timer_duration INTEGER DEFAULT 25,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create tasks table: {}", e))?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS daily_logs (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT DEFAULT '',
            mood TEXT DEFAULT 'neutral',
            sync_rate INTEGER DEFAULT 80,
            tags TEXT DEFAULT '',
            auto_generated INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create daily_logs table: {}", e))?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS focus_sessions (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            checked_in_at TEXT,
            checked_out_at TEXT,
            total_focus_seconds INTEGER DEFAULT 0,
            active_task_id TEXT
        )"
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create focus_sessions table: {}", e))?;

    // Create index for date-based queries
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date)")
        .execute(&pool)
        .await
        .ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON daily_logs(date)")
        .execute(&pool)
        .await
        .ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_focus_sessions_date ON focus_sessions(date)")
        .execute(&pool)
        .await
        .ok();

    Ok(pool)
}

// ═══════════════════════════════════════════════════════════
// Task CRUD Commands
// ═══════════════════════════════════════════════════════════

#[tauri::command]
async fn get_tasks(db: State<'_, Arc<Mutex<AppDb>>>) -> Result<Vec<Task>, String> {
    let db = db.lock().await;
    let rows = sqlx::query_as!(
        Task,
        "SELECT id, title, description, status, priority, date, start_time, duration, tags, repeat_type, timer_type, timer_duration, created_at, updated_at FROM tasks ORDER BY date ASC, start_time ASC"
    )
    .fetch_all(&db.db)
    .await
    .map_err(|e| format!("Failed to fetch tasks: {}", e))?;
    Ok(rows)
}

#[tauri::command]
async fn get_tasks_by_date(date: String, db: State<'_, Arc<Mutex<AppDb>>>) -> Result<Vec<Task>, String> {
    let db = db.lock().await;
    let rows = sqlx::query_as!(
        Task,
        "SELECT id, title, description, status, priority, date, start_time, duration, tags, repeat_type, timer_type, timer_duration, created_at, updated_at FROM tasks WHERE date = ? ORDER BY start_time ASC",
        date
    )
    .fetch_all(&db.db)
    .await
    .map_err(|e| format!("Failed to fetch tasks by date: {}", e))?;
    Ok(rows)
}

#[tauri::command]
async fn create_task(task: Task, db: State<'_, Arc<Mutex<AppDb>>>) -> Result<Task, String> {
    let db = db.lock().await;
    sqlx::query(
        "INSERT INTO tasks (id, title, description, status, priority, date, start_time, duration, tags, repeat_type, timer_type, timer_duration, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&task.id)
    .bind(&task.title)
    .bind(&task.description)
    .bind(&task.status)
    .bind(&task.priority)
    .bind(&task.date)
    .bind(&task.start_time)
    .bind(&task.duration)
    .bind(&task.tags)
    .bind(&task.repeat_type)
    .bind(&task.timer_type)
    .bind(&task.timer_duration)
    .bind(&task.created_at)
    .bind(&task.updated_at)
    .execute(&db.db)
    .await
    .map_err(|e| format!("Failed to create task: {}", e))?;
    Ok(task)
}

#[tauri::command]
async fn update_task(task: Task, db: State<'_, Arc<Mutex<AppDb>>>) -> Result<Task, String> {
    let db = db.lock().await;
    sqlx::query(
        "UPDATE tasks SET title=?, description=?, status=?, priority=?, date=?, start_time=?, duration=?, tags=?, repeat_type=?, timer_type=?, timer_duration=?, updated_at=? WHERE id=?"
    )
    .bind(&task.title)
    .bind(&task.description)
    .bind(&task.status)
    .bind(&task.priority)
    .bind(&task.date)
    .bind(&task.start_time)
    .bind(&task.duration)
    .bind(&task.tags)
    .bind(&task.repeat_type)
    .bind(&task.timer_type)
    .bind(&task.timer_duration)
    .bind(&task.updated_at)
    .bind(&task.id)
    .execute(&db.db)
    .await
    .map_err(|e| format!("Failed to update task: {}", e))?;
    Ok(task)
}

#[tauri::command]
async fn delete_task(id: String, db: State<'_, Arc<Mutex<AppDb>>>) -> Result<(), String> {
    let db = db.lock().await;
    sqlx::query("DELETE FROM tasks WHERE id = ?")
        .bind(&id)
        .execute(&db.db)
        .await
        .map_err(|e| format!("Failed to delete task: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn batch_create_tasks(tasks: Vec<Task>, db: State<'_, Arc<Mutex<AppDb>>>) -> Result<usize, String> {
    let db = db.lock().await;
    let mut count = 0;
    for task in &tasks {
        let result = sqlx::query(
            "INSERT OR IGNORE INTO tasks (id, title, description, status, priority, date, start_time, duration, tags, repeat_type, timer_type, timer_duration, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&task.id)
        .bind(&task.title)
        .bind(&task.description)
        .bind(&task.status)
        .bind(&task.priority)
        .bind(&task.date)
        .bind(&task.start_time)
        .bind(&task.duration)
        .bind(&task.tags)
        .bind(&task.repeat_type)
        .bind(&task.timer_type)
        .bind(&task.timer_duration)
        .bind(&task.created_at)
        .bind(&task.updated_at)
        .execute(&db.db)
        .await;
        if result.is_ok() { count += 1; }
    }
    Ok(count)
}

// ═══════════════════════════════════════════════════════════
// Daily Log CRUD Commands
// ═══════════════════════════════════════════════════════════

#[tauri::command]
async fn get_daily_logs(db: State<'_, Arc<Mutex<AppDb>>>) -> Result<Vec<DailyLog>, String> {
    let db = db.lock().await;
    let rows = sqlx::query_as!(
        DailyLog,
        r#"SELECT id, date, title, content, mood, sync_rate, tags, auto_generated as "auto_generated: bool", created_at, updated_at FROM daily_logs ORDER BY date DESC"#
    )
    .fetch_all(&db.db)
    .await
    .map_err(|e| format!("Failed to fetch daily logs: {}", e))?;
    Ok(rows)
}

#[tauri::command]
async fn create_daily_log(log: DailyLog, db: State<'_, Arc<Mutex<AppDb>>>) -> Result<DailyLog, String> {
    let db = db.lock().await;
    sqlx::query(
        "INSERT INTO daily_logs (id, date, title, content, mood, sync_rate, tags, auto_generated, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&log.id)
    .bind(&log.date)
    .bind(&log.title)
    .bind(&log.content)
    .bind(&log.mood)
    .bind(&log.sync_rate)
    .bind(&log.tags)
    .bind(log.auto_generated)
    .bind(&log.created_at)
    .bind(&log.updated_at)
    .execute(&db.db)
    .await
    .map_err(|e| format!("Failed to create daily log: {}", e))?;
    Ok(log)
}

#[tauri::command]
async fn update_daily_log(log: DailyLog, db: State<'_, Arc<Mutex<AppDb>>>) -> Result<DailyLog, String> {
    let db = db.lock().await;
    sqlx::query(
        "UPDATE daily_logs SET title=?, content=?, mood=?, sync_rate=?, tags=?, updated_at=? WHERE id=?"
    )
    .bind(&log.title)
    .bind(&log.content)
    .bind(&log.mood)
    .bind(&log.sync_rate)
    .bind(&log.tags)
    .bind(&log.updated_at)
    .bind(&log.id)
    .execute(&db.db)
    .await
    .map_err(|e| format!("Failed to update daily log: {}", e))?;
    Ok(log)
}

// ═══════════════════════════════════════════════════════════
// Focus Session Commands
// ═══════════════════════════════════════════════════════════

#[tauri::command]
async fn get_focus_sessions(db: State<'_, Arc<Mutex<AppDb>>>) -> Result<Vec<FocusSession>, String> {
    let db = db.lock().await;
    let rows = sqlx::query_as!(
        FocusSession,
        "SELECT id, date, checked_in_at, checked_out_at, total_focus_seconds, active_task_id FROM focus_sessions ORDER BY date DESC"
    )
    .fetch_all(&db.db)
    .await
    .map_err(|e| format!("Failed to fetch focus sessions: {}", e))?;
    Ok(rows)
}

#[tauri::command]
async fn upsert_focus_session(session: FocusSession, db: State<'_, Arc<Mutex<AppDb>>>) -> Result<FocusSession, String> {
    let db = db.lock().await;
    sqlx::query(
        "INSERT INTO focus_sessions (id, date, checked_in_at, checked_out_at, total_focus_seconds, active_task_id) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET checked_in_at=excluded.checked_in_at, checked_out_at=excluded.checked_out_at, total_focus_seconds=excluded.total_focus_seconds, active_task_id=excluded.active_task_id"
    )
    .bind(&session.id)
    .bind(&session.date)
    .bind(&session.checked_in_at)
    .bind(&session.checked_out_at)
    .bind(&session.total_focus_seconds)
    .bind(&session.active_task_id)
    .execute(&db.db)
    .await
    .map_err(|e| format!("Failed to upsert focus session: {}", e))?;
    Ok(session)
}

// ═══════════════════════════════════════════════════════════
// Markdown Import Command
// ═══════════════════════════════════════════════════════════

#[tauri::command]
async fn parse_markdown_plan(content: String) -> Result<ImportReport, String> {
    let mut tasks: Vec<ImportedTask> = Vec::new();
    let mut current_date = String::new();

    for line in content.lines() {
        let trimmed = line.trim();
        
        // Parse date headers: ## 2026-03-01 or ## YYYY-MM-DD ...
        if trimmed.starts_with("## ") || trimmed.starts_with("# ") {
            let header = trimmed.trim_start_matches('#').trim();
            // Try extract ISO date
            if let Some(date) = extract_iso_date(header) {
                current_date = date;
            }
        }
        
        // Parse task lines: - [ ] or - [x]
        if trimmed.starts_with("- [ ] ") || trimmed.starts_with("- [x] ") || trimmed.starts_with("- [X] ") {
            let is_done = trimmed.starts_with("- [x] ") || trimmed.starts_with("- [X] ");
            let rest = &trimmed[6..];
            
            // Extract @date
            let mut task_date = current_date.clone();
            let mut task_text = rest.to_string();
            if let Some(pos) = rest.find('@') {
                let after_at = &rest[pos + 1..];
                if let Some(date) = extract_iso_date(after_at) {
                    task_date = date;
                }
                task_text = rest[..pos].trim().to_string();
                // Remove trailing date from text if present
                if let Some(space_pos) = task_text.rfind(" @") {
                    task_text = task_text[..space_pos].trim().to_string();
                }
            }
            
            // Extract #tags and #priority
            let mut tags: Vec<String> = Vec::new();
            let mut priority = "medium".to_string();
            let mut clean_title = String::new();
            
            for part in task_text.split_whitespace() {
                if part.starts_with('#') {
                    let tag = part.trim_start_matches('#').to_lowercase();
                    match tag.as_str() {
                        "high" | "urgent" => priority = "high".to_string(),
                        "low" => priority = "low".to_string(),
                        "medium" => priority = "medium".to_string(),
                        _ => tags.push(tag),
                    }
                } else {
                    if !clean_title.is_empty() { clean_title.push(' '); }
                    clean_title.push_str(part);
                }
            }
            
            if !clean_title.is_empty() {
                tasks.push(ImportedTask {
                    title: clean_title,
                    date: if task_date.is_empty() {
                        chrono_today()
                    } else {
                        task_date
                    },
                    priority,
                    tags,
                    status: if is_done { "done".to_string() } else { "todo".to_string() },
                });
            }
        }
    }

    let total = tasks.len();
    Ok(ImportReport {
        total,
        created: 0,
        skipped: 0,
        tasks,
    })
}

fn extract_iso_date(s: &str) -> Option<String> {
    // Match YYYY-MM-DD pattern
    let chars: Vec<char> = s.chars().collect();
    if chars.len() < 10 { return None; }
    
    for i in 0..=chars.len().saturating_sub(10) {
        if chars.len() >= i + 10
            && chars[i].is_ascii_digit() && chars[i+1].is_ascii_digit()
            && chars[i+2].is_ascii_digit() && chars[i+3].is_ascii_digit()
            && chars[i+4] == '-'
            && chars[i+5].is_ascii_digit() && chars[i+6].is_ascii_digit()
            && chars[i+7] == '-'
            && chars[i+8].is_ascii_digit() && chars[i+9].is_ascii_digit()
        {
            return Some(chars[i..i+10].iter().collect());
        }
    }
    None
}

fn chrono_today() -> String {
    let now = std::time::SystemTime::now();
    let since_epoch = now.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    let secs = since_epoch.as_secs() as i64;
    let days = secs / 86400;
    // Simple date calculation
    let mut y = 1970i32;
    let mut remaining = days;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if remaining < days_in_year { break; }
        remaining -= days_in_year;
        y += 1;
    }
    let month_days = if is_leap(y) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut m = 0;
    for (i, &md) in month_days.iter().enumerate() {
        if remaining < md { m = i + 1; break; }
        remaining -= md;
    }
    let d = remaining + 1;
    format!("{:04}-{:02}-{:02}", y, m, d)
}

fn is_leap(y: i32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

// ═══════════════════════════════════════════════════════════
// AI Proxy Command (DeepSeek / Kimi API)
// ═══════════════════════════════════════════════════════════

#[tauri::command]
async fn ai_proxy(request: AiProxyRequest) -> Result<AiProxyResponse, String> {
    let client = reqwest::Client::new();
    
    let body = serde_json::json!({
        "model": request.model,
        "messages": [
            { "role": "system", "content": request.system_prompt },
            { "role": "user", "content": request.user_message }
        ],
        "temperature": request.temperature.unwrap_or(0.7),
        "max_tokens": request.max_tokens.unwrap_or(2048),
    });

    let response = client
        .post(&request.api_url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", request.api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("AI API request failed: {}", e))?;

    let status = response.status();
    let response_text = response.text().await.map_err(|e| format!("Failed to read AI response: {}", e))?;

    if !status.is_success() {
        return Err(format!("AI API returned error {}: {}", status, response_text));
    }

    let json: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse AI response JSON: {}", e))?;

    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let usage = json.get("usage").cloned();

    Ok(AiProxyResponse {
        content,
        model: request.model,
        usage,
    })
}

// ═══════════════════════════════════════════════════════════
// Read file content (for MD import)
// ═══════════════════════════════════════════════════════════

#[tauri::command]
async fn read_file_content(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file {}: {}", path, e))
}

// ═══════════════════════════════════════════════════════════
// App Entry Point
// ═══════════════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize SQLite database
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let home = dirs_next_home();
                let db_dir = format!("{}/Documents/EVA_Knowledge_Base/Database", home);
                let db_path = format!("{}/eva.db", db_dir);
                
                match init_db(&db_path).await {
                    Ok(pool) => {
                        let db_state = Arc::new(Mutex::new(AppDb { db: pool }));
                        app_handle.manage(db_state);
                        log::info!("SQLite database initialized at: {}", db_path);
                    }
                    Err(e) => {
                        log::error!("Failed to init database: {}", e);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_tasks,
            get_tasks_by_date,
            create_task,
            update_task,
            delete_task,
            batch_create_tasks,
            get_daily_logs,
            create_daily_log,
            update_daily_log,
            get_focus_sessions,
            upsert_focus_session,
            parse_markdown_plan,
            ai_proxy,
            read_file_content,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn dirs_next_home() -> String {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Default".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string())
    }
}
