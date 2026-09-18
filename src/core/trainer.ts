/**
 * トレーナー（練習モード）の共通インターフェース。
 * 新しい練習を追加するときは、この TrainerModule を実装して src/trainers/index.ts に登録するだけでよい。
 */
import type { AudioEngine } from "./audio/engine";
import type { ToneGenerator } from "./audio/tone";
import type { Metronome } from "./audio/metronome";
import type { TubaModel } from "./tuba";
import type { HistoryStore, HistoryEntry } from "./history";

/** 設定画面を自動生成するためのフィールド定義 */
export type SettingField =
  | { key: string; label: string; type: "number"; min: number; max: number; step?: number; unit?: string; help?: string }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; help?: string }
  | { key: string; label: string; type: "boolean"; help?: string }
  /** 1 つの音を選ぶ（値は MIDI 番号） */
  | { key: string; label: string; type: "note"; help?: string }
  /** 複数の音を選ぶ（値は MIDI 番号の配列） */
  | { key: string; label: string; type: "notes"; help?: string };

export type SettingsValues = Record<string, number | string | boolean | number[]>;

export interface AppSettings {
  tubaKey: TubaModel["key"];
  a4Hz: number;
}

export interface TrainerContext {
  audio: AudioEngine;
  tone: ToneGenerator;
  metronome: Metronome;
  tuba: TubaModel;
  app: AppSettings;
  settings: SettingsValues;
  history: HistoryStore;
  /** トレーナーが UI を描画する領域 */
  root: HTMLElement;
  /** 画面上部の状態表示を更新する */
  setStatus(text: string): void;
}

export interface TrainerInstance {
  /** UI を root に構築する。start 前に一度呼ばれる。 */
  mount(): void;
  /** 練習を開始する（マイクは既に動いている） */
  start(): Promise<void> | void;
  /** 練習を止める。何度呼んでも安全であること。 */
  stop(): void;
  /** 画面を離れるときの後始末 */
  dispose(): void;
}

export interface TrainerModule {
  /** URL や保存キーに使う一意の ID */
  id: string;
  title: string;
  /** 一覧に出す短い説明 */
  summary: string;
  /** 練習画面に出す詳しい説明（使い方） */
  description: string;
  /** 一覧の並び順（小さいほど上） */
  order: number;
  settingsSchema: SettingField[];
  defaultSettings: SettingsValues;
  create(ctx: TrainerContext): TrainerInstance;
  /** ホーム画面用に履歴の要約を描画する（省略可） */
  renderSummary?(entries: HistoryEntry[], tuba: TubaModel): HTMLElement | null;
}

export class TrainerRegistry {
  private modules = new Map<string, TrainerModule>();

  register(mod: TrainerModule): this {
    if (this.modules.has(mod.id)) throw new Error(`trainer id が重複しています: ${mod.id}`);
    this.modules.set(mod.id, mod);
    return this;
  }

  get(id: string): TrainerModule | undefined {
    return this.modules.get(id);
  }

  all(): TrainerModule[] {
    return [...this.modules.values()].sort((a, b) => a.order - b.order);
  }
}
