import { DEFAULT_VENDOR_ID, DEFAULT_VISION_VENDOR_ID } from "./vendors";

export type BellType = "beep" | "chime" | "digital";

export interface AppSettings {
  aiVendorId: string;
  /** vendorId -> API Key，各厂商独立 */
  aiVendorKeys: Record<string, string>;
  aiModel: string;
  aiVisionVendorId: string;
  aiVisionModel: string;
  aiVisionMode: "single" | "pipeline";
  lanShareEnabled: boolean;
  lanSharePort: number;
  fontScale: number;
  pomodoroBell: BellType;
  avatarUrl: string;
  backgroundUrl: string;
  defaultPomodoroMinutes: number;
  autoFullscreenPomodoro: boolean;
  animationLevel: "normal" | "reduced";
  docRoot: string;
  targetUniversity: string;
  examDate: string;
  targetScores: {
    politics: number;
    english: number;
    math: number;
    major: number;
  };
}

const SETTINGS_KEY = "eva.settings.v1";
const MIGRATED_FLAG = "eva.settings.v2.migrated";

export const defaultSettings: AppSettings = {
  aiVendorId: DEFAULT_VENDOR_ID,
  aiVendorKeys: {},
  aiModel: "",
  aiVisionVendorId: DEFAULT_VISION_VENDOR_ID,
  aiVisionModel: "Pro/Qwen/Qwen2.5-VL-7B-Instruct",
  aiVisionMode: "single",
  lanShareEnabled: false,
  lanSharePort: 9527,
  fontScale: 100,
  pomodoroBell: "beep",
  avatarUrl: "/pic/head.png",
  backgroundUrl: "",
  defaultPomodoroMinutes: 25,
  autoFullscreenPomodoro: false,
  animationLevel: "normal",
  docRoot: "",
  targetUniversity: "",
  examDate: "2026-12-20",
  targetScores: {
    politics: 70,
    english: 75,
    math: 130,
    major: 120,
  },
};

/**
 * A2-P0-1 一次性迁移旧密钥：
 * - aiKimiKey -> moonshot；aiMinimaxKey -> minimax
 * - 旧 aiApiKey 历史上在硅基流动/DeepSeek 两头使用过，无法判断归属 -> 双侧复制，
 *   由设置页「测试连接」分辨（默认只提示、不自动删除，防误删唯一可用 key）
 * - 清掉 5 个 eva.ai.* 镜像键
 */
function migrateLegacySettings(parsed: Partial<AppSettings> & Record<string, unknown>): AppSettings {
  const legacy = parsed as Record<string, unknown>;
  const keys: Record<string, string> = { ...(parsed.aiVendorKeys || {}) };
  const put = (vendorId: string, value: unknown) => {
    const v = typeof value === "string" ? value.trim() : "";
    if (v && !keys[vendorId]) keys[vendorId] = v;
  };
  put("moonshot", legacy.aiKimiKey);
  put("minimax", legacy.aiMinimaxKey);
  const oldMain = typeof legacy.aiApiKey === "string" ? legacy.aiApiKey.trim() : "";
  const mirror = localStorage.getItem("eva.ai.apiKey")?.trim() || localStorage.getItem("eva.ai.api.key")?.trim() || "";
  const dualKey = oldMain || mirror;
  if (dualKey) {
    put("siliconflow", dualKey);
    put("deepseek", dualKey);
  }
  const model = parsed.aiModel || localStorage.getItem("eva.ai.model")?.trim() || "";
  const visionModel = parsed.aiVisionModel || localStorage.getItem("eva.ai.visionModel")?.trim() || defaultSettings.aiVisionModel;

  ["eva.ai.apiKey", "eva.ai.api.key", "eva.ai.model", "eva.ai.visionModel", "eva.ai.visionMode"].forEach((k) => localStorage.removeItem(k));
  localStorage.setItem(MIGRATED_FLAG, "1");

  return {
    ...defaultSettings,
    ...parsed,
    aiVendorKeys: keys,
    aiModel: model,
    aiVisionModel: visionModel,
  };
}

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw && localStorage.getItem(MIGRATED_FLAG)) return defaultSettings;
    const parsed = (raw ? JSON.parse(raw) : {}) as Partial<AppSettings> & Record<string, unknown>;
    if (!localStorage.getItem(MIGRATED_FLAG)) {
      // 复审修复：无 eva.settings.v1 的老用户（只在旧 Tasks 页填过 key）也要走迁移，否则密钥"凭空消失"
      const migrated = migrateLegacySettings(parsed);
      if (raw || Object.keys(migrated.aiVendorKeys).length > 0 || migrated.aiModel) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(migrated));
      }
      return migrated;
    }
    return { ...defaultSettings, ...parsed, aiVendorKeys: parsed.aiVendorKeys || {} };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(next: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("eva:settings-updated", { detail: next }));
}

export function updateSettings(patch: Partial<AppSettings>) {
  const current = getSettings();
  saveSettings({ ...current, ...patch });
}

export function bellUrl(type: BellType): string {
  if (type === "chime") return "https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg";
  if (type === "digital") return "https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg";
  return "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";
}
