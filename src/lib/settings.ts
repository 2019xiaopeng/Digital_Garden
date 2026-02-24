export type BellType = "beep" | "chime" | "digital";

export interface AppSettings {
  aiApiKey: string;
  aiKimiKey: string;
  aiMinimaxKey: string;
  fontScale: number;
  pomodoroBell: BellType;
  avatarUrl: string;
  backgroundUrl: string;
  defaultPomodoroMinutes: number;
  autoFullscreenPomodoro: boolean;
  animationLevel: "normal" | "reduced";
  docRoot: string;
}

const SETTINGS_KEY = "eva.settings.v1";

export const defaultSettings: AppSettings = {
  aiApiKey: "",
  aiKimiKey: "",
  aiMinimaxKey: "",
  fontScale: 100,
  pomodoroBell: "beep",
  avatarUrl: "/pic/head.png",
  backgroundUrl: "",
  defaultPomodoroMinutes: 25,
  autoFullscreenPomodoro: false,
  animationLevel: "normal",
  docRoot: "~/Documents/EVA_Knowledge_Base",
};

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...defaultSettings, ...parsed };
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
