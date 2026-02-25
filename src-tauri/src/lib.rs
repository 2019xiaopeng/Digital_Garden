use chrono::{Local, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, State};
use tokio::fs;
use tokio::sync::Mutex;

// ═══════════════════════════════════════════════════════════
// Data Structures (shared between Rust & Frontend)
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
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

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct DailyLog {
    pub id: String,
    pub date: String, // YYYY-MM-DD
    pub title: String,
    pub content: String, // Markdown content
    pub mood: String,    // "happy" | "sad" | "neutral" | "focused"
    pub sync_rate: i32,  // 0-100
    pub tags: String,    // comma-separated
    pub auto_generated: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BilibiliMetadata {
    pub bvid: String,
    pub title: String,
    pub pic: String,
    pub owner_name: String,
    pub duration: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct VideoBookmark {
    pub id: String,
    pub bvid: String,
    pub title: String,
    pub pic: String,
    pub owner_name: String,
    pub duration: i64,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
struct BilibiliApiOwner {
    name: String,
}

#[derive(Debug, Deserialize)]
struct BilibiliApiData {
    bvid: String,
    title: String,
    pic: String,
    duration: i64,
    owner: BilibiliApiOwner,
}

#[derive(Debug, Deserialize)]
struct BilibiliApiResponse {
    code: i32,
    message: String,
    data: Option<BilibiliApiData>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportedTask {
    pub title: String,
    pub date: String,
    pub priority: String,
    pub tags: Vec<String>,
    pub status: String,
    #[serde(rename = "startTime")]
    pub start_time: Option<String>,
    pub duration: Option<f64>,
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
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create db directory: {}", e))?;
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
        )",
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
        )",
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
        )",
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create focus_sessions table: {}", e))?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS video_bookmarks (
            id TEXT PRIMARY KEY,
            bvid TEXT NOT NULL,
            title TEXT NOT NULL,
            pic TEXT DEFAULT '',
            owner_name TEXT DEFAULT '',
            duration INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        )",
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create video_bookmarks table: {}", e))?;

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
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_video_bookmarks_created_at ON video_bookmarks(created_at DESC)")
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
    let rows = sqlx::query_as::<_, Task>(
        "SELECT id, title, description, status, priority, date, start_time, duration, tags, repeat_type, timer_type, timer_duration, created_at, updated_at FROM tasks ORDER BY date ASC, start_time ASC"
    )
    .fetch_all(&db.db)
    .await
    .map_err(|e| format!("Failed to fetch tasks: {}", e))?;
    Ok(rows)
}

#[tauri::command]
async fn get_tasks_by_date(
    date: String,
    db: State<'_, Arc<Mutex<AppDb>>>,
) -> Result<Vec<Task>, String> {
    let db = db.lock().await;
    let rows = sqlx::query_as::<_, Task>(
        "SELECT id, title, description, status, priority, date, start_time, duration, tags, repeat_type, timer_type, timer_duration, created_at, updated_at FROM tasks WHERE date = ? ORDER BY start_time ASC"
    )
    .bind(date)
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
async fn batch_create_tasks(
    tasks: Vec<Task>,
    db: State<'_, Arc<Mutex<AppDb>>>,
) -> Result<usize, String> {
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
        if result.is_ok() {
            count += 1;
        }
    }
    Ok(count)
}

// ═══════════════════════════════════════════════════════════
// Daily Log CRUD Commands
// ═══════════════════════════════════════════════════════════

fn parse_frontmatter_value<'a>(lines: &'a [String], key: &str) -> Option<&'a str> {
    lines
        .iter()
        .find_map(|line| line.strip_prefix(&format!("{}:", key)).map(|v| v.trim()))
}

fn sanitize_title_for_filename(title: &str) -> String {
    title
        .chars()
        .map(|ch| {
            if ch.is_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(24)
        .collect()
}

fn normalize_log_date(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.len() >= 10 {
        let prefix = &trimmed[0..10];
        if prefix.chars().nth(4) == Some('-') && prefix.chars().nth(7) == Some('-') {
            return prefix.to_string();
        }
    }
    Local::now().format("%Y-%m-%d").to_string()
}

fn build_log_stem(date: &str, title: &str) -> String {
    let time_part = Local::now().format("%H-%M-%S").to_string();
    let slug = sanitize_title_for_filename(title);
    if slug.is_empty() {
        format!("{}_{}", date, time_part)
    } else {
        format!("{}_{}_{}", date, time_part, slug)
    }
}

fn parse_daily_log_markdown(raw: &str, fallback_stem: &str) -> DailyLog {
    let mut frontmatter: Vec<String> = Vec::new();
    let mut body = raw.to_string();

    if raw.starts_with("---\n") {
        let mut parts = raw.splitn(3, "---\n");
        let _ = parts.next();
        if let (Some(fm), Some(rest)) = (parts.next(), parts.next()) {
            frontmatter = fm.lines().map(|s| s.trim().to_string()).collect();
            body = rest.to_string();
        }
    }

    let fallback_date = normalize_log_date(fallback_stem);
    let id = parse_frontmatter_value(&frontmatter, "id")
        .map(|v| v.to_string())
        .unwrap_or_else(|| fallback_stem.to_string());
    let date = parse_frontmatter_value(&frontmatter, "date")
        .map(|v| v.to_string())
        .unwrap_or_else(|| fallback_date.clone());
    let title = parse_frontmatter_value(&frontmatter, "title")
        .map(|v| v.to_string())
        .unwrap_or_else(|| format!("留痕 {}", fallback_date));
    let mood = parse_frontmatter_value(&frontmatter, "mood")
        .map(|v| v.to_string())
        .unwrap_or_else(|| "neutral".to_string());
    let sync_rate = parse_frontmatter_value(&frontmatter, "sync_rate")
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(80);
    let tags = parse_frontmatter_value(&frontmatter, "tags")
        .map(|v| v.to_string())
        .unwrap_or_default();
    let auto_generated = parse_frontmatter_value(&frontmatter, "auto_generated")
        .map(|v| v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let created_at = parse_frontmatter_value(&frontmatter, "created_at")
        .map(|v| v.to_string())
        .unwrap_or_else(now_iso);
    let updated_at = parse_frontmatter_value(&frontmatter, "updated_at")
        .map(|v| v.to_string())
        .unwrap_or_else(now_iso);

    DailyLog {
        id,
        date,
        title,
        content: body.trim_start_matches('\n').to_string(),
        mood,
        sync_rate,
        tags,
        auto_generated,
        created_at,
        updated_at,
    }
}

fn daily_log_to_markdown(log: &DailyLog) -> String {
    format!(
        "---\nid: {}\ndate: {}\ntitle: {}\nmood: {}\nsync_rate: {}\ntags: {}\nauto_generated: {}\ncreated_at: {}\nupdated_at: {}\n---\n\n{}\n",
        log.id,
        log.date,
        log.title,
        log.mood,
        log.sync_rate,
        log.tags,
        if log.auto_generated { "true" } else { "false" },
        log.created_at,
        log.updated_at,
        log.content
    )
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

async fn resolve_log_path_by_id(logs_dir: &Path, id: &str) -> Result<Option<PathBuf>, String> {
    let direct = logs_dir.join(format!("{}.md", id));
    if fs::metadata(&direct).await.is_ok() {
        return Ok(Some(direct));
    }

    let mut entries = fs::read_dir(logs_dir).await.map_err(|e| {
        format!(
            "Failed to read logs dir {}: {}",
            logs_dir.to_string_lossy(),
            e
        )
    })?;
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("Failed to iterate logs dir: {}", e))?
    {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let fallback_stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let raw = fs::read_to_string(&path)
            .await
            .map_err(|e| format!("Failed to read log file {}: {}", path.to_string_lossy(), e))?;
        let parsed = parse_daily_log_markdown(&raw, &fallback_stem);
        if parsed.id == id {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

#[tauri::command]
async fn get_daily_logs(app: tauri::AppHandle) -> Result<Vec<DailyLog>, String> {
    let root = PathBuf::from(ensure_workspace_dirs(&app).await?);
    let logs_dir = root.join("Logs");
    fs::create_dir_all(&logs_dir).await.map_err(|e| {
        format!(
            "Failed to ensure logs dir {}: {}",
            logs_dir.to_string_lossy(),
            e
        )
    })?;

    let mut entries = fs::read_dir(&logs_dir).await.map_err(|e| {
        format!(
            "Failed to read logs dir {}: {}",
            logs_dir.to_string_lossy(),
            e
        )
    })?;

    let mut logs: Vec<DailyLog> = Vec::new();
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("Failed to iterate logs dir: {}", e))?
    {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }

        let fallback_stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let raw = fs::read_to_string(&path)
            .await
            .map_err(|e| format!("Failed to read log file {}: {}", path.to_string_lossy(), e))?;
        logs.push(parse_daily_log_markdown(&raw, &fallback_stem));
    }

    logs.sort_by(|a, b| b.id.cmp(&a.id));
    Ok(logs)
}

#[tauri::command]
async fn create_daily_log(app: tauri::AppHandle, mut log: DailyLog) -> Result<DailyLog, String> {
    let root = PathBuf::from(ensure_workspace_dirs(&app).await?);
    let logs_dir = root.join("Logs");
    fs::create_dir_all(&logs_dir).await.map_err(|e| {
        format!(
            "Failed to ensure logs dir {}: {}",
            logs_dir.to_string_lossy(),
            e
        )
    })?;

    let normalized_date = normalize_log_date(&log.date);
    log.date = normalized_date.clone();

    let mut stem = build_log_stem(&normalized_date, &log.title);
    let mut file_path = logs_dir.join(format!("{}.md", stem));
    let mut suffix = 1usize;
    while fs::metadata(&file_path).await.is_ok() {
        stem = format!(
            "{}-{}",
            build_log_stem(&normalized_date, &log.title),
            suffix
        );
        file_path = logs_dir.join(format!("{}.md", stem));
        suffix += 1;
    }

    log.id = stem;
    if log.created_at.trim().is_empty() {
        log.created_at = now_iso();
    }
    log.updated_at = now_iso();

    let markdown = daily_log_to_markdown(&log);
    fs::write(&file_path, markdown).await.map_err(|e| {
        format!(
            "Failed to write log file {}: {}",
            file_path.to_string_lossy(),
            e
        )
    })?;

    Ok(log)
}

#[tauri::command]
async fn update_daily_log(app: tauri::AppHandle, mut log: DailyLog) -> Result<DailyLog, String> {
    if log.id.trim().is_empty() {
        return Err("Daily log id is required for update".to_string());
    }

    let root = PathBuf::from(ensure_workspace_dirs(&app).await?);
    let logs_dir = root.join("Logs");
    fs::create_dir_all(&logs_dir).await.map_err(|e| {
        format!(
            "Failed to ensure logs dir {}: {}",
            logs_dir.to_string_lossy(),
            e
        )
    })?;

    let existing_path = resolve_log_path_by_id(&logs_dir, &log.id)
        .await?
        .ok_or_else(|| format!("Daily log not found for id {}", log.id))?;

    let existing_raw = fs::read_to_string(&existing_path).await.map_err(|e| {
        format!(
            "Failed to read existing log file {}: {}",
            existing_path.to_string_lossy(),
            e
        )
    })?;
    let fallback_stem = existing_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    let existing_log = parse_daily_log_markdown(&existing_raw, &fallback_stem);

    if log.date.trim().is_empty() {
        log.date = existing_log.date;
    } else {
        log.date = normalize_log_date(&log.date);
    }
    if log.created_at.trim().is_empty() {
        log.created_at = existing_log.created_at;
    }
    log.updated_at = now_iso();

    let markdown = daily_log_to_markdown(&log);
    fs::write(&existing_path, markdown).await.map_err(|e| {
        format!(
            "Failed to update log file {}: {}",
            existing_path.to_string_lossy(),
            e
        )
    })?;

    Ok(log)
}

#[tauri::command]
async fn delete_daily_log(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let root = PathBuf::from(ensure_workspace_dirs(&app).await?);
    let logs_dir = root.join("Logs");
    fs::create_dir_all(&logs_dir).await.map_err(|e| {
        format!(
            "Failed to ensure logs dir {}: {}",
            logs_dir.to_string_lossy(),
            e
        )
    })?;

    if let Some(path) = resolve_log_path_by_id(&logs_dir, &id).await? {
        fs::remove_file(&path).await.map_err(|e| {
            format!(
                "Failed to delete log file {}: {}",
                path.to_string_lossy(),
                e
            )
        })?;
    }

    Ok(())
}

// ═══════════════════════════════════════════════════════════
// Focus Session Commands
// ═══════════════════════════════════════════════════════════

#[tauri::command]
async fn get_focus_sessions(db: State<'_, Arc<Mutex<AppDb>>>) -> Result<Vec<FocusSession>, String> {
    let db = db.lock().await;
    let rows = sqlx::query_as::<_, FocusSession>(
        "SELECT id, date, checked_in_at, checked_out_at, total_focus_seconds, active_task_id FROM focus_sessions ORDER BY date DESC"
    )
    .fetch_all(&db.db)
    .await
    .map_err(|e| format!("Failed to fetch focus sessions: {}", e))?;
    Ok(rows)
}

#[tauri::command]
async fn upsert_focus_session(
    session: FocusSession,
    db: State<'_, Arc<Mutex<AppDb>>>,
) -> Result<FocusSession, String> {
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
// Video Bookmark Commands (SQLite)
// ═══════════════════════════════════════════════════════════

#[tauri::command]
async fn get_video_bookmarks(
    db: State<'_, Arc<Mutex<AppDb>>>,
) -> Result<Vec<VideoBookmark>, String> {
    let db = db.lock().await;
    let rows = sqlx::query_as::<_, VideoBookmark>(
        "SELECT id, bvid, title, pic, owner_name, duration, created_at FROM video_bookmarks ORDER BY created_at DESC"
    )
    .fetch_all(&db.db)
    .await
    .map_err(|e| format!("Failed to fetch video bookmarks: {}", e))?;
    Ok(rows)
}

#[tauri::command]
async fn add_video_bookmark(
    bookmark: VideoBookmark,
    db: State<'_, Arc<Mutex<AppDb>>>,
) -> Result<VideoBookmark, String> {
    let db = db.lock().await;
    sqlx::query(
        "INSERT INTO video_bookmarks (id, bvid, title, pic, owner_name, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&bookmark.id)
    .bind(&bookmark.bvid)
    .bind(&bookmark.title)
    .bind(&bookmark.pic)
    .bind(&bookmark.owner_name)
    .bind(bookmark.duration)
    .bind(&bookmark.created_at)
    .execute(&db.db)
    .await
    .map_err(|e| format!("Failed to add video bookmark: {}", e))?;
    Ok(bookmark)
}

#[tauri::command]
async fn delete_video_bookmark(id: String, db: State<'_, Arc<Mutex<AppDb>>>) -> Result<(), String> {
    let db = db.lock().await;
    sqlx::query("DELETE FROM video_bookmarks WHERE id = ?")
        .bind(id)
        .execute(&db.db)
        .await
        .map_err(|e| format!("Failed to delete video bookmark: {}", e))?;
    Ok(())
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
        if trimmed.starts_with("- [ ] ")
            || trimmed.starts_with("- [x] ")
            || trimmed.starts_with("- [X] ")
        {
            let is_done = trimmed.starts_with("- [x] ") || trimmed.starts_with("- [X] ");
            let rest = &trimmed[6..];
            let mut start_time: Option<String> = None;
            let mut rest_text = rest.trim().to_string();

            if rest_text.starts_with('[') {
                if let Some(end_idx) = rest_text.find(']') {
                    let maybe_time = rest_text[1..end_idx].trim();
                    if parse_clock_minutes(maybe_time).is_some() {
                        start_time = Some(maybe_time.to_string());
                        rest_text = rest_text[end_idx + 1..].trim().to_string();
                    }
                }
            }

            // Extract @date
            let mut task_date = current_date.clone();
            let mut task_text = rest_text.clone();
            if let Some(pos) = rest_text.find('@') {
                let after_at = &rest_text[pos + 1..];
                if let Some(date) = extract_iso_date(after_at) {
                    task_date = date;
                }
                task_text = rest_text[..pos].trim().to_string();
                // Remove trailing date from text if present
                if let Some(space_pos) = task_text.rfind(" @") {
                    task_text = task_text[..space_pos].trim().to_string();
                }
            }

            // Extract #tags and #priority
            let mut tags: Vec<String> = Vec::new();
            let mut priority = "medium".to_string();
            let mut clean_title = String::new();

            if task_text.ends_with(')') {
                if let Some(open_idx) = task_text.rfind('(') {
                    let level = task_text[open_idx + 1..task_text.len() - 1]
                        .trim()
                        .to_lowercase();
                    match level.as_str() {
                        "high" => {
                            priority = "high".to_string();
                            task_text = task_text[..open_idx].trim().to_string();
                        }
                        "low" => {
                            priority = "low".to_string();
                            task_text = task_text[..open_idx].trim().to_string();
                        }
                        "medium" => {
                            priority = "medium".to_string();
                            task_text = task_text[..open_idx].trim().to_string();
                        }
                        _ => {}
                    }
                }
            }

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
                    if !clean_title.is_empty() {
                        clean_title.push(' ');
                    }
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
                    status: if is_done {
                        "done".to_string()
                    } else {
                        "todo".to_string()
                    },
                    start_time,
                    duration: None,
                });
            }
        }
    }

    infer_import_durations(&mut tasks);

    let total = tasks.len();
    Ok(ImportReport {
        total,
        created: 0,
        skipped: 0,
        tasks,
    })
}

fn parse_clock_minutes(input: &str) -> Option<i32> {
    let parts: Vec<&str> = input.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let hh: i32 = parts[0].parse().ok()?;
    let mm: i32 = parts[1].parse().ok()?;
    if !(0..=23).contains(&hh) || !(0..=59).contains(&mm) {
        return None;
    }
    Some(hh * 60 + mm)
}

fn infer_import_durations(tasks: &mut Vec<ImportedTask>) {
    use std::collections::HashMap;
    let mut by_date: HashMap<String, Vec<usize>> = HashMap::new();
    for (idx, task) in tasks.iter().enumerate() {
        by_date.entry(task.date.clone()).or_default().push(idx);
    }

    for (_, mut indices) in by_date {
        indices.sort_by_key(|idx| {
            tasks[*idx]
                .start_time
                .as_ref()
                .and_then(|v| parse_clock_minutes(v))
                .unwrap_or(24 * 60)
        });

        for i in 0..indices.len() {
            let cur_idx = indices[i];
            if tasks[cur_idx].duration.is_some() {
                continue;
            }
            let current_minutes = tasks[cur_idx]
                .start_time
                .as_ref()
                .and_then(|v| parse_clock_minutes(v));

            if current_minutes.is_none() {
                tasks[cur_idx].duration = Some(1.0);
                continue;
            }

            let mut duration_hours = 2.0;
            for j in i + 1..indices.len() {
                let next_idx = indices[j];
                if let Some(next_minutes) = tasks[next_idx]
                    .start_time
                    .as_ref()
                    .and_then(|v| parse_clock_minutes(v))
                {
                    let diff = (next_minutes - current_minutes.unwrap()) as f64 / 60.0;
                    if diff > 0.0 {
                        duration_hours = (diff * 10.0).round() / 10.0;
                        if duration_hours < 0.5 {
                            duration_hours = 0.5;
                        }
                        break;
                    }
                }
            }

            tasks[cur_idx].duration = Some(duration_hours);
        }
    }
}

fn extract_iso_date(s: &str) -> Option<String> {
    // Match YYYY-MM-DD pattern
    let chars: Vec<char> = s.chars().collect();
    if chars.len() < 10 {
        return None;
    }

    for i in 0..=chars.len().saturating_sub(10) {
        if chars.len() >= i + 10
            && chars[i].is_ascii_digit()
            && chars[i + 1].is_ascii_digit()
            && chars[i + 2].is_ascii_digit()
            && chars[i + 3].is_ascii_digit()
            && chars[i + 4] == '-'
            && chars[i + 5].is_ascii_digit()
            && chars[i + 6].is_ascii_digit()
            && chars[i + 7] == '-'
            && chars[i + 8].is_ascii_digit()
            && chars[i + 9].is_ascii_digit()
        {
            return Some(chars[i..i + 10].iter().collect());
        }
    }
    None
}

fn chrono_today() -> String {
    let now = std::time::SystemTime::now();
    let since_epoch = now
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = since_epoch.as_secs() as i64;
    let days = secs / 86400;
    // Simple date calculation
    let mut y = 1970i32;
    let mut remaining = days;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if remaining < days_in_year {
            break;
        }
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
        if remaining < md {
            m = i + 1;
            break;
        }
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
    let response_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read AI response: {}", e))?;

    if !status.is_success() {
        return Err(format!(
            "AI API returned error {}: {}",
            status, response_text
        ));
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

#[tauri::command]
async fn fetch_bilibili_metadata(bvid: String) -> Result<BilibiliMetadata, String> {
    println!("[Bilibili] fetch start raw_bvid={}", bvid);
    let clean_bvid = bvid.trim().to_uppercase();
    if !clean_bvid.starts_with("BV") {
        println!("[Bilibili] invalid bvid after normalize={}", clean_bvid);
        return Err("Invalid bvid: must start with BV".to_string());
    }

    let url = format!(
        "https://api.bilibili.com/x/web-interface/view?bvid={}",
        clean_bvid
    );
    println!("[Bilibili] request url={}", url);

    let client = reqwest::Client::new();
    let response = match client
        .get(&url)
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .header(reqwest::header::REFERER, "https://www.bilibili.com")
        .header(reqwest::header::ACCEPT, "application/json,text/plain,*/*")
        .send()
        .await {
        Ok(resp) => {
            println!("[Bilibili] send success status={}", resp.status());
            resp
        }
        Err(err) => {
            println!("[Bilibili] send error detail={:?}", err);
            return Err(format!("Bilibili request send error: {:?}", err));
        }
    };

    let status = response.status();
    let body = match response.text().await {
        Ok(text) => {
            println!("[Bilibili] read body bytes={}", text.len());
            text
        }
        Err(err) => {
            println!("[Bilibili] read body error detail={:?}", err);
            return Err(format!("Bilibili response body read error: {:?}", err));
        }
    };

    if !status.is_success() {
        log::error!(
            "[Bilibili] HTTP {} bvid={} body={}",
            status,
            clean_bvid,
            body
        );
        println!(
            "[Bilibili] HTTP {} bvid={} body={}",
            status, clean_bvid, body
        );
        return Err(format!("Bilibili HTTP {} body: {}", status, body));
    }

    let payload = match serde_json::from_str::<BilibiliApiResponse>(&body) {
        Ok(json) => {
            println!(
                "[Bilibili] parse json ok code={} message={}",
                json.code, json.message
            );
            json
        }
        Err(err) => {
            println!("[Bilibili] parse json error detail={:?}", err);
            return Err(format!(
                "Bilibili response parse error: {:?} | raw body: {}",
                err, body
            ));
        }
    };

    if payload.code != 0 {
        log::error!(
            "[Bilibili] API code error code={} msg={} bvid={} raw={}",
            payload.code,
            payload.message,
            clean_bvid,
            body
        );
        println!(
            "[Bilibili] API code error code={} msg={} bvid={} raw={}",
            payload.code, payload.message, clean_bvid, body
        );
        return Err(format!(
            "Bilibili API error {}: {} | raw body: {}",
            payload.code, payload.message, body
        ));
    }

    let data = payload
        .data
        .ok_or_else(|| "Bilibili API returned empty data".to_string())?;

    println!(
        "[Bilibili] success bvid={} title={} owner={} duration={}",
        data.bvid, data.title, data.owner.name, data.duration
    );

    Ok(BilibiliMetadata {
        bvid: data.bvid,
        title: data.title,
        pic: data.pic,
        owner_name: data.owner.name,
        duration: data.duration,
    })
}

// ═══════════════════════════════════════════════════════════
// Read file content (for MD import)
// ═══════════════════════════════════════════════════════════

#[tauri::command]
async fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read file {}: {}", path, e))
}

// ═══════════════════════════════════════════════════════════
// Knowledge base file operations
// ═══════════════════════════════════════════════════════════

fn workspace_root_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let document_dir = app
        .path()
        .document_dir()
        .map_err(|e| format!("Failed to resolve document_dir: {}", e))?;

    Ok(document_dir.join("EVA_Knowledge_Base"))
}

fn sanitize_relative_path(relative: &str) -> Result<PathBuf, String> {
    let trimmed = relative.trim().replace('\\', "/");
    if trimmed.is_empty() {
        return Ok(PathBuf::new());
    }

    let mut out = PathBuf::new();
    for component in Path::new(&trimmed).components() {
        match component {
            Component::Normal(seg) => out.push(seg),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(format!("Invalid relative path: {}", relative));
            }
        }
    }
    Ok(out)
}

async fn ensure_workspace_dirs(app: &tauri::AppHandle) -> Result<String, String> {
    let root = workspace_root_path(app)?;
    let required = [
        root.clone(),
        root.join("Database"),
        root.join("Logs"),
        root.join("Notes"),
        root.join("Resources"),
    ];

    for dir in required {
        fs::create_dir_all(&dir).await.map_err(|e| {
            format!(
                "Failed to create workspace dir {}: {}",
                dir.to_string_lossy(),
                e
            )
        })?;
    }

    Ok(root.to_string_lossy().to_string())
}

async fn ensure_workspace_dirs_at(root: &str) -> Result<String, String> {
    let root_path = PathBuf::from(root);
    let required = [
        root_path.clone(),
        root_path.join("Database"),
        root_path.join("Logs"),
        root_path.join("Notes"),
        root_path.join("Resources"),
    ];

    for dir in required {
        fs::create_dir_all(&dir).await.map_err(|e| {
            format!(
                "Failed to create workspace dir {}: {}",
                dir.to_string_lossy(),
                e
            )
        })?;
    }

    Ok(root_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn initialize_workspace(app: tauri::AppHandle) -> Result<String, String> {
    ensure_workspace_dirs(&app).await
}

#[tauri::command]
async fn get_workspace_root(app: tauri::AppHandle) -> Result<String, String> {
    ensure_workspace_dirs(&app).await
}

#[tauri::command]
async fn initialize_workspace_at(root_path: String) -> Result<String, String> {
    let normalized = root_path.replace('\\', "/").trim().to_string();
    if normalized.is_empty() {
        return Err("Workspace root path cannot be empty".to_string());
    }
    ensure_workspace_dirs_at(&normalized).await
}

/// Get the Notes directory path, creating it if needed
#[tauri::command]
async fn get_notes_dir(app: tauri::AppHandle) -> Result<String, String> {
    let root = ensure_workspace_dirs(&app).await?;
    Ok(PathBuf::from(root)
        .join("Notes")
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
async fn get_logs_dir(app: tauri::AppHandle) -> Result<String, String> {
    let root = ensure_workspace_dirs(&app).await?;
    Ok(PathBuf::from(root)
        .join("Logs")
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
async fn get_resources_dir(app: tauri::AppHandle) -> Result<String, String> {
    let root = ensure_workspace_dirs(&app).await?;
    Ok(PathBuf::from(root)
        .join("Resources")
        .to_string_lossy()
        .to_string())
}

#[derive(Debug, Serialize)]
struct CopiedFileResult {
    source_path: String,
    file_name: String,
    dest_path: String,
}

/// Copy a file into the Notes directory (preserving name), return the dest path
#[tauri::command]
async fn copy_file_to_notes(
    app: tauri::AppHandle,
    source_path: String,
    relative_dir: String,
) -> Result<String, String> {
    let root = PathBuf::from(ensure_workspace_dirs(&app).await?);
    let base = root.join("Notes");
    let relative = sanitize_relative_path(&relative_dir)?;
    let target_dir = base.join(relative);
    fs::create_dir_all(&target_dir).await.map_err(|e| {
        format!(
            "Failed to create directory {}: {}",
            target_dir.to_string_lossy(),
            e
        )
    })?;

    let file_name = std::path::Path::new(&source_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");
    let dest = target_dir.join(file_name);
    fs::copy(&source_path, &dest).await.map_err(|e| {
        format!(
            "Failed to copy {} -> {}: {}",
            source_path,
            dest.to_string_lossy(),
            e
        )
    })?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
async fn copy_files_to_notes(
    app: tauri::AppHandle,
    source_paths: Vec<String>,
    relative_dir: String,
) -> Result<Vec<CopiedFileResult>, String> {
    if source_paths.is_empty() {
        return Err("No source files provided".to_string());
    }

    let root = PathBuf::from(ensure_workspace_dirs(&app).await?);
    let base = root.join("Notes");
    let relative = sanitize_relative_path(&relative_dir)?;
    let target_dir = base.join(relative);

    fs::create_dir_all(&target_dir).await.map_err(|e| {
        format!(
            "Failed to create directory {}: {}",
            target_dir.to_string_lossy(),
            e
        )
    })?;

    let mut copied = Vec::new();

    for (index, source_path) in source_paths.into_iter().enumerate() {
        let metadata = fs::metadata(&source_path).await.map_err(|e| {
            format!(
                "Source file metadata error [index={} path={}]: {}",
                index, source_path, e
            )
        })?;
        if !metadata.is_file() {
            return Err(format!(
                "Source path is not a file [index={} path={}]",
                index, source_path
            ));
        }

        let file_name = Path::new(&source_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let dest = target_dir.join(&file_name);
        fs::copy(&source_path, &dest).await.map_err(|e| {
            format!(
                "Failed to copy [index={} source={} dest={}]: {}",
                index,
                source_path,
                dest.to_string_lossy(),
                e
            )
        })?;

        copied.push(CopiedFileResult {
            source_path,
            file_name,
            dest_path: dest.to_string_lossy().to_string(),
        });
    }

    Ok(copied)
}

#[tauri::command]
async fn batch_delete_notes_files(
    app: tauri::AppHandle,
    absolute_paths: Vec<String>,
) -> Result<usize, String> {
    if absolute_paths.is_empty() {
        return Ok(0);
    }

    let notes_root = PathBuf::from(ensure_workspace_dirs(&app).await?).join("Notes");
    let mut deleted = 0usize;

    for (index, raw_path) in absolute_paths.into_iter().enumerate() {
        let candidate = PathBuf::from(&raw_path);
        if !candidate.starts_with(&notes_root) {
            return Err(format!(
                "Refused to delete outside Notes root [index={} path={}]",
                index, raw_path
            ));
        }

        let metadata = fs::metadata(&candidate).await.map_err(|e| {
            format!(
                "Failed to stat file [index={} path={}]: {}",
                index, raw_path, e
            )
        })?;

        if !metadata.is_file() {
            return Err(format!(
                "Target is not a file [index={} path={}]",
                index, raw_path
            ));
        }

        fs::remove_file(&candidate).await.map_err(|e| {
            format!(
                "Failed to delete file [index={} path={}]: {}",
                index, raw_path, e
            )
        })?;
        deleted += 1;
    }

    Ok(deleted)
}

#[tauri::command]
async fn batch_move_notes_items(
    app: tauri::AppHandle,
    from_relatives: Vec<String>,
    target_relative_dir: String,
) -> Result<usize, String> {
    if from_relatives.is_empty() {
        return Ok(0);
    }

    let root = PathBuf::from(ensure_workspace_dirs(&app).await?);
    let base = root.join("Notes");
    let target_rel = sanitize_relative_path(&target_relative_dir)?;
    let target_dir = base.join(target_rel);

    fs::create_dir_all(&target_dir).await.map_err(|e| {
        format!(
            "Failed to create target dir {}: {}",
            target_dir.to_string_lossy(),
            e
        )
    })?;

    let mut moved = 0usize;

    for (index, rel) in from_relatives.into_iter().enumerate() {
        let src_rel = sanitize_relative_path(&rel)?;
        let src = base.join(&src_rel);
        let file_name = src
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| {
                format!(
                    "Invalid source file name [index={} relative={}]",
                    index, rel
                )
            })?
            .to_string();
        let dest = target_dir.join(file_name);

        fs::rename(&src, &dest).await.map_err(|e| {
            format!(
                "Failed to move item [index={} from={} to={}]: {}",
                index,
                src.to_string_lossy(),
                dest.to_string_lossy(),
                e
            )
        })?;
        moved += 1;
    }

    Ok(moved)
}

#[tauri::command]
async fn copy_files_to_resources(
    app: tauri::AppHandle,
    source_paths: Vec<String>,
    relative_dir: String,
) -> Result<Vec<CopiedFileResult>, String> {
    if source_paths.is_empty() {
        return Err("No source files provided".to_string());
    }

    let root = PathBuf::from(ensure_workspace_dirs(&app).await?);
    let base = root.join("Resources");
    let relative = sanitize_relative_path(&relative_dir)?;
    let target_dir = base.join(relative);

    fs::create_dir_all(&target_dir).await.map_err(|e| {
        format!(
            "Failed to create directory {}: {}",
            target_dir.to_string_lossy(),
            e
        )
    })?;

    let mut copied = Vec::new();

    for (index, source_path) in source_paths.into_iter().enumerate() {
        let metadata = fs::metadata(&source_path).await.map_err(|e| {
            format!(
                "Source file metadata error [index={} path={}]: {}",
                index, source_path, e
            )
        })?;
        if !metadata.is_file() {
            return Err(format!(
                "Source path is not a file [index={} path={}]",
                index, source_path
            ));
        }

        let file_name = Path::new(&source_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let dest = target_dir.join(&file_name);
        fs::copy(&source_path, &dest).await.map_err(|e| {
            format!(
                "Failed to copy [index={} source={} dest={}]: {}",
                index,
                source_path,
                dest.to_string_lossy(),
                e
            )
        })?;

        copied.push(CopiedFileResult {
            source_path,
            file_name,
            dest_path: dest.to_string_lossy().to_string(),
        });
    }

    Ok(copied)
}

/// Write text content to a file in the Notes directory
#[tauri::command]
async fn write_notes_file(
    app: tauri::AppHandle,
    relative_path: String,
    content: String,
) -> Result<String, String> {
    let root = PathBuf::from(ensure_workspace_dirs(&app).await?);
    let rel = sanitize_relative_path(&relative_path)?;
    let full_path = root.join("Notes").join(rel);
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create dir: {}", e))?;
    }
    fs::write(&full_path, content)
        .await
        .map_err(|e| format!("Failed to write {}: {}", full_path.to_string_lossy(), e))?;
    Ok(full_path.to_string_lossy().to_string())
}

/// Create a folder in the Notes directory
#[tauri::command]
async fn create_notes_folder(
    app: tauri::AppHandle,
    relative_path: String,
) -> Result<String, String> {
    let root = PathBuf::from(ensure_workspace_dirs(&app).await?);
    let rel = sanitize_relative_path(&relative_path)?;
    let full_path = root.join("Notes").join(rel);
    fs::create_dir_all(&full_path).await.map_err(|e| {
        format!(
            "Failed to create folder {}: {}",
            full_path.to_string_lossy(),
            e
        )
    })?;
    Ok(full_path.to_string_lossy().to_string())
}

/// Delete a file or folder from Notes directory
#[tauri::command]
async fn delete_notes_item(app: tauri::AppHandle, relative_path: String) -> Result<(), String> {
    let root = PathBuf::from(ensure_workspace_dirs(&app).await?);
    let rel = sanitize_relative_path(&relative_path)?;
    let full_path = root.join("Notes").join(rel);
    let path = full_path.as_path();
    if fs::metadata(path)
        .await
        .map(|m| m.is_dir())
        .unwrap_or(false)
    {
        fs::remove_dir_all(path)
            .await
            .map_err(|e| format!("Failed to delete folder: {}", e))?;
    } else if fs::metadata(path)
        .await
        .map(|m| m.is_file())
        .unwrap_or(false)
    {
        fs::remove_file(path)
            .await
            .map_err(|e| format!("Failed to delete file: {}", e))?;
    }
    Ok(())
}

/// Move (rename) a file or folder within Notes directory
#[tauri::command]
async fn move_notes_item(
    app: tauri::AppHandle,
    from_relative: String,
    to_relative: String,
) -> Result<(), String> {
    let root = PathBuf::from(ensure_workspace_dirs(&app).await?);
    let base = root.join("Notes");
    let src = base.join(sanitize_relative_path(&from_relative)?);
    let dest = base.join(sanitize_relative_path(&to_relative)?);
    // Ensure destination parent directory exists
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create dest dir: {}", e))?;
    }
    fs::rename(&src, &dest).await.map_err(|e| {
        format!(
            "Failed to move {} -> {}: {}",
            src.to_string_lossy(),
            dest.to_string_lossy(),
            e
        )
    })?;
    Ok(())
}

// ═══════════════════════════════════════════════════════════
// App Entry Point
// ═══════════════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if let Err(e) = window.hide() {
                    log::error!("Failed to hide window on close: {}", e);
                }
            }
        })
        .setup(|app| {
            let tray_show =
                MenuItem::with_id(app, "tray_show", "显示 EVA 终端", true, None::<&str>)?;
            let tray_quit = MenuItem::with_id(app, "tray_quit", "退出系统", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&tray_show, &tray_quit])?;

            let mut tray_builder = TrayIconBuilder::with_id("eva_tray")
                .menu(&tray_menu)
                .tooltip("EVA 考研辅助终端")
                .on_menu_event(|app: &tauri::AppHandle, event| match event.id.as_ref() {
                    "tray_show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "tray_quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event| match event {
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
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                });

            if let Some(default_icon) = app.default_window_icon().cloned() {
                tray_builder = tray_builder.icon(default_icon);
            }

            let _tray = tray_builder.build(app)?;

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
                let workspace_root = match ensure_workspace_dirs(&app_handle).await {
                    Ok(root) => {
                        log::info!("Workspace initialized at: {}", root);
                        root
                    }
                    Err(e) => {
                        log::error!("Failed to initialize workspace dirs: {}", e);
                        return;
                    }
                };

                let db_dir = format!("{}/Database", workspace_root);
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
            delete_daily_log,
            get_focus_sessions,
            upsert_focus_session,
            get_video_bookmarks,
            add_video_bookmark,
            delete_video_bookmark,
            parse_markdown_plan,
            ai_proxy,
            fetch_bilibili_metadata,
            initialize_workspace,
            initialize_workspace_at,
            get_workspace_root,
            read_file_content,
            get_notes_dir,
            get_logs_dir,
            get_resources_dir,
            copy_file_to_notes,
            copy_files_to_notes,
            batch_delete_notes_files,
            batch_move_notes_items,
            copy_files_to_resources,
            write_notes_file,
            create_notes_folder,
            delete_notes_item,
            move_notes_item,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
