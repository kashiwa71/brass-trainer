import type { AppSettings, SettingsValues } from "./trainer";
import { DEFAULT_A4_HZ } from "./notes";

const APP_KEY = "brass-trainer.app.v1";
const trainerKey = (id: string) => `brass-trainer.trainer.${id}.v1`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export const DEFAULT_APP_SETTINGS: AppSettings = { tubaKey: "Bb", a4Hz: DEFAULT_A4_HZ, fontScale: "large" };

export function loadAppSettings(): AppSettings {
  return { ...DEFAULT_APP_SETTINGS, ...(read<Partial<AppSettings>>(APP_KEY) ?? {}) };
}

export function saveAppSettings(s: AppSettings): void {
  write(APP_KEY, s);
}

export function loadTrainerSettings(id: string, defaults: SettingsValues): SettingsValues {
  return { ...defaults, ...(read<SettingsValues>(trainerKey(id)) ?? {}) };
}

export function saveTrainerSettings(id: string, values: SettingsValues): void {
  write(trainerKey(id), values);
}
