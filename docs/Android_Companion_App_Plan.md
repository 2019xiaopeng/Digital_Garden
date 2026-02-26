# Android Companion App 技术方案

> QCBs Digital Garden · Android 端伴侣应用  
> 目标：锁屏任务展示 · 番茄钟同步 · 应用锁  
> 平台：Android（ColorOS / OPPO）  
> 撰写日期：2026-02-26

---

## 0. 需求总览

| # | 功能 | 系统层级 | 难度 |
|---|------|----------|------|
| F1 | 锁屏展示今日任务列表 | Widget / 息屏显示 | ★★★★ |
| F2 | 同步桌面端数据（任务 CRUD、统计） | 网络层 + 本地缓存 | ★★☆ |
| F3 | 番茄钟计时（前台 Service） | 前台通知 + 计时 | ★★★ |
| F4 | 应用锁（锁定在本 App，禁止切屏） | Kiosk / 辅助功能 | ★★★★★ |

---

## 1. 技术栈选型

### 1.1 为什么用原生 Kotlin + Jetpack Compose？

你的三个核心需求（锁屏 Widget、Foreground Service、应用锁）全部涉及 **Android 系统级 API**，跨平台框架在这些场景下要么不支持、要么需要大量 Native Bridge：

| 方案 | 锁屏 Widget | 前台 Service | 应用锁/Kiosk | 代码复用 | 结论 |
|------|-------------|-------------|-------------|---------|------|
| **Kotlin + Compose** | ✅ Glance API 原生支持 | ✅ 原生 ForegroundService | ✅ LockTask / DeviceAdmin | 无 | **推荐** |
| Tauri Mobile (v2) | ❌ 无 Widget 支持 | ❌ 无 Service 机制 | ❌ 无法控制系统 | 可复用前端 | 不适合 |
| React Native | ⚠️ 需 Native Module | ⚠️ 需 Native Module | ⚠️ 极难 | 可复用 React 经验 | 过度封装 |
| Flutter | ⚠️ 需 Platform Channel | ⚠️ 需 Platform Channel | ⚠️ 极难 | 无 | 新学习曲线 |

### 1.2 最终技术栈

```
┌─────────────────────────────────────────────────────────────┐
│                    Android Companion App                     │
├─────────────────────────────────────────────────────────────┤
│  UI 层        │  Jetpack Compose (声明式 UI，类似 React)      │
│  Widget       │  Glance (Compose 风格的桌面/锁屏小组件)      │
│  网络层       │  Retrofit2 + OkHttp (HTTP REST)              │
│               │  OkHttp WebSocket (实时同步)                  │
│  本地缓存     │  Room (SQLite ORM，离线缓冲)                  │
│  计时服务     │  ForegroundService + NotificationCompat       │
│  应用锁       │  LockTask Mode / DevicePolicyManager          │
│  依赖注入     │  Hilt (Dagger 简化版)                         │
│  异步         │  Kotlin Coroutines + Flow                    │
│  构建工具     │  Gradle (Kotlin DSL)                         │
│  最低 API     │  API 26 (Android 8.0)，覆盖 ColorOS 全线      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 系统架构

### 2.1 整体拓扑

```
                        ┌──────────────────────┐
                        │   桌面端 (Windows)    │
                        │  Tauri + Axum Server  │
                        │  SQLite (主数据库)     │
                        │  Port: 9527           │
                        └──────────┬───────────┘
                                   │
                         局域网 / Tailscale
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
     ┌────────▼───────┐  ┌────────▼───────┐  ┌────────▼───────┐
     │  Android App   │  │   平板浏览器    │  │  其他客户端     │
     │  (Companion)   │  │  (LAN Web UI)  │  │                │
     │  Room 缓存     │  │                │  │                │
     └────────────────┘  └────────────────┘  └────────────────┘
```

### 2.2 数据同步策略

Android App 与桌面端的同步分为两种模式：

#### 模式 A：局域网直连（主要模式）

```
Android App  ──HTTP REST──►  桌面端 Axum Server (192.168.x.x:9527)
             ◄──WebSocket──  实时推送任务变更
```

已有的 REST API 可以直接复用：

| 端点 | 方法 | 功能 | Android 对应 |
|------|------|------|-------------|
| `/api/tasks` | GET | 获取任务列表 | 首页 + Widget |
| `/api/tasks` | POST | 创建任务 | 快捷添加 |
| `/api/tasks/{id}` | PUT | 更新任务 | 状态切换/番茄钟记录 |
| `/api/tasks/{id}` | DELETE | 删除任务 | 滑动删除 |
| `/api/stats/weekly` | GET | 周统计 | 统计页 |
| `/api/ping` | GET | 心跳检测 | 连接状态指示 |
| `/api/ws` | WS | 实时同步 | 即时通知 |

#### 模式 B：离线缓存 + 后台同步

当手机不在局域网内时：
1. 所有操作写入本地 Room 数据库
2. 标记为 `pendingSync = true`
3. 下次连上局域网时，后台 WorkManager 自动推送积压变更
4. 冲突解决：以 `updated_at` 时间戳为准，后写入者胜出

### 2.3 远程访问扩展（可选）

如果需要在非局域网环境同步，有两条路径：

| 方案 | 原理 | 复杂度 | 推荐度 |
|------|------|--------|--------|
| **Tailscale** | P2P VPN，把手机和电脑组成虚拟局域网 | 低（装个 App） | ⭐⭐⭐⭐⭐ |
| Cloudflare Tunnel | 将桌面端 9527 端口暴露到公网 | 中 | ⭐⭐⭐ |
| 自建中转服务器 | 云服务器做消息中转 | 高 | ⭐⭐ |

**强烈推荐 Tailscale**：零配置，免费计划支持 100 台设备，延迟低，不改现有代码。

---

## 3. 核心功能详细设计

### 3.1 F1：锁屏任务展示

#### 3.1.1 实现路径

Android 锁屏展示有三种方案，按可行性排序：

| 方案 | 原理 | ColorOS 兼容性 | 推荐 |
|------|------|---------------|------|
| **App Widget (Glance)** | 系统桌面小组件，可放到锁屏 | ✅ ColorOS 13+ 支持锁屏 Widget | **首选** |
| 自定义通知 | 常驻通知栏展示任务摘要 | ✅ 通用 | 补充方案 |
| 息屏显示 (AOD) | 修改 Always-On Display | ❌ ColorOS 不开放 | 不可行 |

#### 3.1.2 Glance Widget 技术要点

```kotlin
// 使用 Jetpack Glance 构建 Widget（类 Compose 语法）
class TaskListWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            TaskWidgetContent(loadTasks())
        }
    }
}

@Composable
fun TaskWidgetContent(tasks: List<TaskItem>) {
    LazyColumn {
        items(tasks) { task ->
            Row(modifier = GlanceModifier.fillMaxWidth().padding(8.dp)) {
                CheckBox(
                    checked = task.status == "done",
                    onCheckedChange = actionRunCallback<ToggleTaskAction>(
                        parameters = actionParametersOf(taskIdKey to task.id)
                    )
                )
                Text(
                    text = task.title,
                    style = TextStyle(
                        textDecoration = if (task.status == "done")
                            TextDecoration.LineThrough else TextDecoration.None
                    )
                )
            }
        }
    }
}
```

#### 3.1.3 Widget 数据更新机制

```
┌──────────────┐     WorkManager      ┌──────────────┐
│  Axum Server │ ◄── 每15分钟轮询 ──── │  Android App │
│  /api/tasks  │                      │  Room Cache  │
└──────────────┘                      └──────┬───────┘
                                             │
                                    AppWidgetManager
                                       .updateAll()
                                             │
                                      ┌──────▼───────┐
                                      │  锁屏 Widget  │
                                      │  任务列表     │
                                      └──────────────┘
```

- **定时更新**：WorkManager 每 15 分钟拉取最新任务（Android 限制最小间隔 15 分钟）
- **即时更新**：App 内操作时主动调用 `GlanceAppWidgetManager.updateAll()`
- **WebSocket 推送**：桌面端变更通过 WS 推送 → 收到后刷新 Widget

#### 3.1.4 ColorOS 特殊适配

ColorOS（OPPO 系统）对后台进程和 Widget 有额外限制：

1. **电池优化白名单**：引导用户将 App 加入"不受限"列表
2. **自启动管理**：申请自启动权限，否则 WorkManager 可能不执行
3. **锁屏 Widget**：ColorOS 13 (Android 13) 起支持锁屏 Widget，但需要用户手动添加
4. **通知渠道**：必须创建 `NotificationChannel`，否则通知被静默

```kotlin
// ColorOS 自启动引导
fun guideAutoStart(context: Context) {
    try {
        val intent = Intent().apply {
            component = ComponentName(
                "com.coloros.safecenter",
                "com.coloros.safecenter.permission.startup.StartupAppListActivity"
            )
        }
        context.startActivity(intent)
    } catch (e: Exception) {
        // Fallback: 打开系统设置
        context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", context.packageName, null)
        })
    }
}
```

---

### 3.2 F2：数据同步与浏览操作

#### 3.2.1 Retrofit API 定义

```kotlin
interface DigitalGardenApi {
    @GET("/api/tasks")
    suspend fun getTasks(@Query("date") date: String? = null): List<TaskDto>

    @POST("/api/tasks")
    suspend fun createTask(@Body task: CreateTaskDto): TaskDto

    @PUT("/api/tasks/{id}")
    suspend fun updateTask(@Path("id") id: String, @Body task: UpdateTaskDto): TaskDto

    @DELETE("/api/tasks/{id}")
    suspend fun deleteTask(@Path("id") id: String)

    @GET("/api/stats/weekly")
    suspend fun getWeeklyStats(@Query("end_date") endDate: String): WeeklyStatsDto

    @GET("/api/ping")
    suspend fun ping(): PingResponse

    @GET("/api/notes/tree")
    suspend fun getNotesTree(): List<NotesFsNodeDto>

    @GET("/api/notes/file")
    suspend fun getNoteContent(@Query("path") path: String): NoteContentDto

    @GET("/api/resources")
    suspend fun getResources(): List<ResourceDto>
}
```

#### 3.2.2 Repository 层（离线优先）

```kotlin
class TaskRepository(
    private val api: DigitalGardenApi,
    private val dao: TaskDao,
    private val connectivityManager: ConnectivityManager
) {
    // 获取任务：优先本地 → 有网时后台刷新
    fun getTasks(date: String): Flow<List<Task>> = flow {
        // 1. 先发射本地缓存
        emit(dao.getTasksByDate(date))

        // 2. 尝试从服务器拉取
        if (isOnline()) {
            try {
                val remote = api.getTasks(date)
                dao.upsertAll(remote.map { it.toEntity() })
                emit(dao.getTasksByDate(date))
            } catch (e: Exception) {
                // 网络失败，静默使用本地数据
            }
        }
    }

    // 更新任务：写本地 + 异步上传
    suspend fun updateTask(task: Task) {
        dao.update(task.copy(pendingSync = true, updatedAt = now()))
        if (isOnline()) {
            try {
                api.updateTask(task.id, task.toUpdateDto())
                dao.markSynced(task.id)
            } catch (e: Exception) {
                // 留给 SyncWorker 后续处理
            }
        }
    }
}
```

#### 3.2.3 服务发现

App 需要自动发现局域网内的桌面端服务：

```kotlin
// 方案 1：手动输入 IP（最简单）
// 方案 2：mDNS/NSD 自动发现（推荐）
class ServiceDiscovery(private val context: Context) {
    private val nsdManager = context.getSystemService<NsdManager>()

    fun discover(onFound: (String, Int) -> Unit) {
        nsdManager?.discoverServices(
            "_digitalgarden._tcp",  // 需要桌面端注册此服务类型
            NsdManager.PROTOCOL_DNS_SD,
            object : NsdManager.DiscoveryListener {
                override fun onServiceFound(info: NsdServiceInfo) {
                    nsdManager.resolveService(info, object : NsdManager.ResolveListener {
                        override fun onServiceResolved(info: NsdServiceInfo) {
                            onFound(info.host.hostAddress, info.port)
                        }
                        override fun onResolveFailed(info: NsdServiceInfo, code: Int) {}
                    })
                }
                // ... 其他回调
            }
        )
    }
}
```

> **桌面端配合改动**（可选）：在 Axum 启动时注册 mDNS 服务，便于手机自动发现。第一版可以先手动填 IP。

---

### 3.3 F3：番茄钟

#### 3.3.1 Foreground Service

番茄钟必须使用 Foreground Service，否则 ColorOS 会在后台杀死计时：

```kotlin
class PomodoroService : Service() {
    private val binder = PomodoroBinder()
    private var remainingSeconds = 25 * 60
    private var isRunning = false
    private lateinit var ticker: Job

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "START" -> startTimer(intent.getIntExtra("duration", 25))
            "PAUSE" -> pauseTimer()
            "STOP"  -> stopTimer()
        }
        return START_STICKY  // 被杀后自动重启
    }

    private fun startTimer(minutes: Int) {
        remainingSeconds = minutes * 60
        isRunning = true
        startForeground(NOTIFICATION_ID, buildNotification())

        ticker = CoroutineScope(Dispatchers.Default).launch {
            while (remainingSeconds > 0 && isRunning) {
                delay(1000)
                remainingSeconds--
                updateNotification()
                broadcastTick()
            }
            if (remainingSeconds <= 0) onTimerComplete()
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🍅 番茄钟进行中")
            .setContentText(formatTime(remainingSeconds))
            .setSmallIcon(R.drawable.ic_timer)
            .setOngoing(true)
            .addAction(R.drawable.ic_pause, "暂停", pausePendingIntent)
            .addAction(R.drawable.ic_stop, "停止", stopPendingIntent)
            .build()
    }

    private fun onTimerComplete() {
        // 1. 振动 + 铃声提醒
        // 2. 同步到桌面端：PUT /api/tasks/{id} 更新番茄钟完成数
        // 3. 更新 Widget
    }
}
```

#### 3.3.2 与桌面端同步

番茄钟完成后，自动同步到桌面端：

```kotlin
// 番茄钟完成回调
suspend fun syncPomodoroCompletion(taskId: String, focusMinutes: Int) {
    val task = api.getTask(taskId)
    // 当前桌面端任务的 timer_duration 字段记录了番茄时长
    // 通过 PUT /api/tasks/{id} 更新状态
    api.updateTask(taskId, UpdateTaskDto(
        status = if (task.status == "todo") "in-progress" else task.status,
        // 可以扩展一个 focus_completed_count 字段
    ))
}
```

---

### 3.4 F4：应用锁（专注模式）

#### 3.4.1 实现路径分析

"锁住手机只能用这个 App"在 Android 上有几种实现方式：

| 方案 | 原理 | 用户体验 | ColorOS 限制 | 推荐 |
|------|------|---------|-------------|------|
| **Screen Pinning (屏幕固定)** | 系统自带功能，API 调用 `startLockTask()` | 需要先在设置中开启 | ✅ 支持 | **首选** |
| **Device Owner (设备管理员)** | 企业级 Kiosk 模式，可无缝锁定 | 最强控制力 | ⚠️ 需 `adb` 设置 | 次选 |
| Accessibility Service | 监听切屏并强制拉回 | 体验差，有延迟 | ❌ ColorOS 限制严格 | 不推荐 |
| Usage Stats + Overlay | 检测前台 App → 显示遮罩 | 有延迟，可被绕过 | ❌ 需多项权限 | 不推荐 |

#### 3.4.2 方案一：Screen Pinning（屏幕固定）— 推荐

Android 5.0+ 原生支持，用户可以"固定"一个 App，固定后：
- 不能回到桌面
- 不能打开通知
- 不能切换 App
- 需要特定手势 + PIN 码才能退出

```kotlin
class FocusModeManager(private val activity: Activity) {

    fun enterFocusMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            // 请求屏幕固定
            activity.startLockTask()
            // 此时用户无法离开本 App
        }
    }

    fun exitFocusMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            activity.stopLockTask()
        }
    }
}
```

**限制**：首次使用时，系统会弹出确认对话框。如果 App 不是 Device Owner，用户可以通过同时按住 Back + Recent 键退出。

#### 3.4.3 方案二：Device Owner Kiosk 模式 — 最强

如果你愿意用 ADB 做一次设置，可以获得完全的 Kiosk 锁定能力：

```bash
# 1. 在手机上（设置 → 账户）移除所有 Google 账户
# 2. 通过 ADB 设置 Device Owner
adb shell dpm set-device-owner com.qcbs.companion/.admin.FocusDeviceAdminReceiver
```

```kotlin
class FocusDeviceAdminReceiver : DeviceAdminReceiver()

class KioskManager(private val context: Context) {
    private val dpm = context.getSystemService<DevicePolicyManager>()!!
    private val adminComponent = ComponentName(context, FocusDeviceAdminReceiver::class.java)

    fun enableKioskMode(activity: Activity) {
        if (dpm.isDeviceOwnerApp(context.packageName)) {
            // 设置允许锁定的白名单包名
            dpm.setLockTaskPackages(adminComponent, arrayOf(context.packageName))
            // 进入 Kiosk 模式 — 完全锁定，无法退出
            activity.startLockTask()
        }
    }

    fun disableKioskMode(activity: Activity) {
        activity.stopLockTask()
    }
}
```

**效果**：进入后无任何方式退出（包括重启），只能在 App 内点击"退出专注模式"按钮。

#### 3.4.4 专注模式 UI 流程

```
┌────────────────────────────┐
│      🍅 专注模式           │
│                            │
│   当前任务: 高数·极限      │
│                            │
│      ┌────────────┐        │
│      │   18:42    │        │  ← 倒计时
│      └────────────┘        │
│                            │
│   [暂停]     [放弃本轮]    │
│                            │
│   ⚠️ 专注期间无法切换应用   │
│   剩余锁定: 25 分钟        │
│                            │
│   ─────────────────────    │
│   📋 番茄完成 3/8          │
│   🔥 今日专注 127 分钟     │
│                            │
│   [结束专注模式 🔓]        │  ← 需要确认
└────────────────────────────┘
```

---

## 4. 项目结构

```
qcbs-companion-android/
├── app/
│   ├── src/main/
│   │   ├── java/com/qcbs/companion/
│   │   │   ├── QcbsApp.kt                    # Application 入口
│   │   │   ├── di/                            # Hilt 依赖注入
│   │   │   │   ├── AppModule.kt
│   │   │   │   ├── NetworkModule.kt
│   │   │   │   └── DatabaseModule.kt
│   │   │   ├── data/
│   │   │   │   ├── remote/
│   │   │   │   │   ├── DigitalGardenApi.kt    # Retrofit 接口
│   │   │   │   │   ├── WebSocketClient.kt     # WS 实时同步
│   │   │   │   │   └── dto/                   # 数据传输对象
│   │   │   │   ├── local/
│   │   │   │   │   ├── AppDatabase.kt         # Room 数据库
│   │   │   │   │   ├── TaskDao.kt
│   │   │   │   │   └── entity/
│   │   │   │   ├── repository/
│   │   │   │   │   ├── TaskRepository.kt
│   │   │   │   │   ├── StatsRepository.kt
│   │   │   │   │   └── SyncManager.kt
│   │   │   │   └── worker/
│   │   │   │       └── SyncWorker.kt          # 后台同步
│   │   │   ├── ui/
│   │   │   │   ├── theme/                     # Material3 主题
│   │   │   │   ├── navigation/
│   │   │   │   │   └── AppNavGraph.kt
│   │   │   │   ├── screen/
│   │   │   │   │   ├── HomeScreen.kt          # 首页/任务列表
│   │   │   │   │   ├── PomodoroScreen.kt      # 番茄钟
│   │   │   │   │   ├── StatsScreen.kt         # 统计
│   │   │   │   │   ├── NotesScreen.kt         # 笔记浏览
│   │   │   │   │   └── SettingsScreen.kt      # 设置（IP/同步）
│   │   │   │   └── component/
│   │   │   │       ├── TaskCard.kt
│   │   │   │       └── TimerDisplay.kt
│   │   │   ├── service/
│   │   │   │   └── PomodoroService.kt         # 前台计时服务
│   │   │   ├── widget/
│   │   │   │   ├── TaskListWidget.kt          # Glance Widget
│   │   │   │   └── TaskWidgetReceiver.kt
│   │   │   └── admin/
│   │   │       ├── FocusModeManager.kt
│   │   │       └── FocusDeviceAdminReceiver.kt
│   │   ├── res/
│   │   │   ├── xml/
│   │   │   │   ├── device_admin_receiver.xml
│   │   │   │   └── task_widget_info.xml
│   │   │   └── ...
│   │   └── AndroidManifest.xml
│   ├── build.gradle.kts
│   └── proguard-rules.pro
├── gradle/
│   └── libs.versions.toml                     # 版本目录
├── build.gradle.kts                           # 根构建文件
├── settings.gradle.kts
└── gradle.properties
```

---

## 5. 关键依赖版本

```toml
# gradle/libs.versions.toml
[versions]
kotlin = "2.0.21"
agp    = "8.7.3"
compose-bom = "2024.12.01"
glance = "1.1.1"
retrofit = "2.11.0"
okhttp = "4.12.0"
room = "2.6.1"
hilt = "2.52"
coroutines = "1.9.0"
work = "2.10.0"

[libraries]
# Compose
compose-bom       = { group = "androidx.compose", name = "compose-bom", version.ref = "compose-bom" }
compose-material3 = { group = "androidx.compose.material3", name = "material3" }
compose-ui        = { group = "androidx.compose.ui", name = "ui" }
compose-navigation = { group = "androidx.navigation", name = "navigation-compose", version = "2.8.5" }

# Glance (Widget)
glance             = { group = "androidx.glance", name = "glance-appwidget", version.ref = "glance" }
glance-material3   = { group = "androidx.glance", name = "glance-material3", version.ref = "glance" }

# Network
retrofit           = { group = "com.squareup.retrofit2", name = "retrofit", version.ref = "retrofit" }
retrofit-gson      = { group = "com.squareup.retrofit2", name = "converter-gson", version.ref = "retrofit" }
okhttp             = { group = "com.squareup.okhttp3", name = "okhttp", version.ref = "okhttp" }
okhttp-logging     = { group = "com.squareup.okhttp3", name = "logging-interceptor", version.ref = "okhttp" }

# Database
room-runtime       = { group = "androidx.room", name = "room-runtime", version.ref = "room" }
room-ktx           = { group = "androidx.room", name = "room-ktx", version.ref = "room" }
room-compiler      = { group = "androidx.room", name = "room-compiler", version.ref = "room" }

# DI
hilt-android       = { group = "com.google.dagger", name = "hilt-android", version.ref = "hilt" }
hilt-compiler      = { group = "com.google.dagger", name = "hilt-android-compiler", version.ref = "hilt" }

# Async
coroutines         = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-android", version.ref = "coroutines" }

# WorkManager
work-runtime       = { group = "androidx.work", name = "work-runtime-ktx", version.ref = "work" }
```

---

## 6. 开发环境准备

### 6.1 你现在只有 VS Code + Copilot，需要做什么？

#### 必装工具

| 工具 | 用途 | 安装方式 |
|------|------|---------|
| **Android Studio** | Android 开发 IDE（含模拟器 + SDK） | [下载](https://developer.android.com/studio) |
| JDK 17+ | Kotlin/Gradle 编译 | Android Studio 自带，或 `winget install Microsoft.OpenJDK.17` |
| Android SDK 34 | 编译目标 API | Android Studio → SDK Manager 下载 |
| OPPO 手机 USB 驱动 | 真机调试 | [OPPO 官方驱动](https://www.oppo.com/cn/accessory/) 或自动识别 |

> **注意**：虽然可以用 VS Code 写 Kotlin，但 Android 开发强烈建议使用 Android Studio。Gradle 构建系统、模拟器管理、布局预览、APK 签名等功能深度集成在 Android Studio 中。VS Code 在 Android 开发中只适合辅助编辑。

#### 可选：VS Code 继续用

如果你坚持用 VS Code 辅助开发，安装以下扩展：

| 扩展 | 用途 |
|------|------|
| `Kotlin` (fwcd) | Kotlin 语法高亮 + 补全 |
| `Gradle for Java` | Gradle 任务面板 |
| `Android` (nicovs) | ADB 快捷操作 |

**推荐工作流**：Android Studio 做构建/调试/预览，VS Code + Copilot 做辅助代码编写。

### 6.2 环境配置步骤

```powershell
# 1. 安装 Android Studio (手动下载安装)
# https://developer.android.com/studio

# 2. 安装后，打开 Android Studio → SDK Manager
#    勾选安装：
#    - Android SDK Platform 34 (Android 14)
#    - Android SDK Build-Tools 34.0.0
#    - Android SDK Platform-Tools (含 adb)
#    - Google Play services (可选)

# 3. 配置环境变量
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
[Environment]::SetEnvironmentVariable("Path", "$env:Path;$env:ANDROID_HOME\platform-tools", "User")

# 4. 验证安装
adb version
# → Android Debug Bridge version 1.0.41

# 5. 创建项目 (在 Android Studio 中)
#    - New Project → Empty Activity (Compose)
#    - Package name: com.qcbs.companion
#    - Min SDK: API 26 (Android 8.0)
#    - Build language: Kotlin DSL

# 6. OPPO 手机开启开发者选项
#    设置 → 关于手机 → 连点"版本号"7次 → 开发者选项 → USB 调试 开启
#    连接 USB → 允许 USB 调试
adb devices
# → List of devices attached
# → XXXXXXXX  device
```

### 6.3 项目初始化命令

在 Android Studio 中创建好项目后，目录结构自动生成。后续可以用 VS Code + Copilot 并行编写代码：

```powershell
# 在 Digital Garden 工作区外创建 Android 项目（建议独立仓库）
cd F:\
# 用 Android Studio 创建项目到 F:\qcbs-companion-android

# 或创建在同一仓库的子目录中
cd F:\qcbs-digital-garden
mkdir android-companion
# 然后在 Android Studio 中 Import 该目录

# Gradle 命令行构建
cd F:\qcbs-companion-android
.\gradlew assembleDebug      # 构建 Debug APK
.\gradlew installDebug       # 安装到连接的手机
.\gradlew connectedCheck     # 运行设备测试
```

---

## 7. 开发路线图

### Phase 1：基础连接（1-2 周）

```
目标：App 能连上桌面端，展示任务列表
├── 搭建 Android Studio 项目，配好 Compose + Hilt
├── 实现设置页：手动输入桌面端 IP:Port
├── 实现 Retrofit API 对接 /api/tasks
├── 首页展示今日任务列表（只读）
└── 验证：手机上看到桌面端的任务
```

### Phase 2：任务交互 + 离线缓存（1-2 周）

```
目标：在手机上操作任务，断网不丢数据
├── Room 数据库建表，映射桌面端 Task 结构
├── 实现离线优先的 Repository 层
├── 任务状态切换（todo → done）
├── 快捷添加任务
├── SyncWorker 后台同步
└── 验证：断 WiFi 操作 → 连 WiFi 自动同步
```

### Phase 3：番茄钟（1 周）

```
目标：手机端独立计时，完成后同步到桌面
├── PomodoroService 前台服务 + 通知
├── 番茄钟 UI (Compose)
├── 计时完成 → 更新任务状态 + 同步
├── ColorOS 适配：电池优化白名单引导
└── 验证：锁屏后番茄钟继续运行
```

### Phase 4：锁屏 Widget（1 周）

```
目标：锁屏看到今日任务
├── Glance Widget 开发
├── WorkManager 定时刷新
├── Widget 上直接勾选任务完成
├── ColorOS 锁屏 Widget 测试
└── 验证：不解锁就能看到任务列表
```

### Phase 5：应用锁 / 专注模式（1 周）

```
目标：番茄钟期间锁定手机
├── Screen Pinning 模式实现
├── (可选) Device Owner Kiosk 模式
├── 专注模式 UI：倒计时 + 退出确认
├── 番茄钟联动：开始番茄 → 自动锁定
└── 验证：专注期间无法切到微信/抖音
```

### Phase 6：完善 + 发版（1 周）

```
目标：可日常使用的完整 App
├── WebSocket 实时同步
├── 服务自动发现 (mDNS)
├── Material You 动态取色主题
├── 错误处理 + 断连重试
├── Release 签名 + APK 打包
└── (可选) Tailscale 远程访问指南
```

**预计总工期：5-7 周**（每天 1-2 小时开发，有 Copilot 辅助）

---

## 8. 桌面端需要做的配合改动

Android App 主要复用现有 API，但有几处需要扩展：

### 8.1 新增 API 端点（可选）

```rust
// src-tauri/src/lib.rs — 新增路由
.route("/api/pomodoro/complete", post(api_pomodoro_complete_handler))
.route("/api/dashboard/stats", get(api_dashboard_stats_handler))

// 番茄钟完成记录
async fn api_pomodoro_complete_handler(
    State(state): State<LanAppState>,
    Json(body): Json<PomodoroCompleteRequest>,
) -> impl IntoResponse {
    // 记录番茄钟完成，更新任务专注时长
}
```

### 8.2 WebSocket 消息格式统一

当前 `/api/ws` 已有基础 WebSocket 支持。建议统一消息格式：

```json
// 服务端 → 客户端推送
{
    "type": "task_updated",
    "payload": {
        "id": "xxx",
        "status": "done",
        "updated_at": "2026-02-26T10:30:00Z"
    }
}

// 客户端 → 服务端（手机端操作）
{
    "type": "task_toggle",
    "payload": {
        "id": "xxx",
        "status": "done"
    }
}
```

### 8.3 鉴权（后期）

当前 API 无鉴权，局域网内可接受。若后续开放公网访问，需加入：
- API Key 认证（Header: `X-API-Key: xxx`）
- 或 JWT Token（登录后获取）

---

## 9. AndroidManifest.xml 权限清单

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- 网络通信 -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />

    <!-- 前台服务（番茄钟） -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <!-- 振动提醒 -->
    <uses-permission android:name="android.permission.VIBRATE" />

    <!-- 保活/精确闹钟 -->
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />

    <!-- NSD 服务发现 -->
    <uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />

    <application
        android:name=".QcbsApp"
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="QCBs 伴侣"
        android:theme="@style/Theme.QcbsCompanion"
        android:usesCleartextTraffic="true">

        <!-- 主 Activity -->
        <activity
            android:name=".ui.MainActivity"
            android:exported="true"
            android:lockTaskMode="if_whitelisted">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- 番茄钟服务 -->
        <service
            android:name=".service.PomodoroService"
            android:foregroundServiceType="specialUse"
            android:exported="false" />

        <!-- Widget -->
        <receiver
            android:name=".widget.TaskWidgetReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/task_widget_info" />
        </receiver>

        <!-- Device Admin (应用锁) -->
        <receiver
            android:name=".admin.FocusDeviceAdminReceiver"
            android:exported="true"
            android:permission="android.permission.BIND_DEVICE_ADMIN">
            <intent-filter>
                <action android:name="android.app.action.DEVICE_ADMIN_ENABLED" />
            </intent-filter>
            <meta-data
                android:name="android.app.device_admin"
                android:resource="@xml/device_admin_receiver" />
        </receiver>

        <!-- 后台同步 -->
        <provider
            android:name="androidx.startup.InitializationProvider"
            android:authorities="${applicationId}.androidx-startup"
            android:exported="false">
            <meta-data
                android:name="androidx.work.WorkManagerInitializer"
                android:value="androidx.startup" />
        </provider>

    </application>
</manifest>
```

---

## 10. 常见问题

### Q: 我完全不会 Kotlin，能做吗？

**能。** Kotlin 语法对有 TypeScript 经验的人非常友好：
- `val` / `var` ≈ `const` / `let`
- `data class` ≈ TypeScript `interface`/`type`
- `suspend fun` ≈ `async function`
- Jetpack Compose 的声明式 UI ≈ React JSX
- 有 Copilot 辅助，绝大多数代码可以自动生成

### Q: 需要买 Mac 吗？

**不需要。** 这只做 Android，Windows 上的 Android Studio 完全满足。

### Q: ColorOS 会杀后台怎么办？

1. App 内引导用户加入电池优化白名单
2. 使用 `START_STICKY` 的 Service
3. 使用 `WorkManager`（系统级调度，ColorOS 不会杀）
4. 番茄钟使用 Foreground Service + 常驻通知

### Q: 没有服务器怎么远程同步？

装 **Tailscale**（手机 + 电脑各装一个），免费，零配置打通。效果等同于两台设备在同一局域网。

### Q: 项目放同一个仓库还是分开？

**建议分开**。Android 项目有独立的 Gradle 构建系统，混在一起会让两边的 CI 和依赖管理互相干扰。

```
F:\qcbs-digital-garden\           # 桌面端 (Tauri + React)
F:\qcbs-companion-android\        # Android 伴侣 App
```

两个仓库共享同一套 REST API 协议，天然解耦。

---

## 11. 总结：你需要做的第一步

```
1. 下载安装 Android Studio
   → https://developer.android.com/studio

2. 安装完成后：SDK Manager → 安装 Android 14 (API 34)

3. 创建新项目：
   → Empty Activity (Jetpack Compose)
   → Package: com.qcbs.companion
   → Min SDK: API 26

4. OPPO 手机开启 USB 调试 → 连 USB → adb devices 确认连接

5. 运行 Hello World → 手机上看到界面 → 开发环境搭建完成！

然后回来告诉我 "环境搭好了"，我们开始 Phase 1 🚀
```
