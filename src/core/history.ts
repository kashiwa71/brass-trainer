/** 練習結果の履歴。localStorage に保存する。 */
export interface HistoryEntry<T = unknown> {
  id: string;
  trainerId: string;
  /** ISO 8601 */
  at: string;
  data: T;
}

const KEY = "brass-trainer.history.v1";
const MAX_ENTRIES = 5000;

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class HistoryStore {
  private entries: HistoryEntry[] = [];
  private listeners = new Set<() => void>();

  constructor(private readonly storage: Storage | null = typeof localStorage !== "undefined" ? localStorage : null) {
    this.load();
  }

  private load(): void {
    try {
      const raw = this.storage?.getItem(KEY);
      if (raw) this.entries = JSON.parse(raw) as HistoryEntry[];
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.entries));
    } catch {
      /* 容量超過などは無視する */
    }
    for (const l of this.listeners) l();
  }

  add<T>(trainerId: string, data: T): HistoryEntry<T> {
    const entry: HistoryEntry<T> = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      trainerId,
      at: new Date().toISOString(),
      data,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    this.save();
    return entry;
  }

  list<T = unknown>(trainerId?: string): HistoryEntry<T>[] {
    const xs = trainerId ? this.entries.filter((e) => e.trainerId === trainerId) : this.entries;
    return xs as HistoryEntry<T>[];
  }

  clear(trainerId?: string): void {
    this.entries = trainerId ? this.entries.filter((e) => e.trainerId !== trainerId) : [];
    this.save();
  }

  onChange(l: () => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  exportJson(): string {
    return JSON.stringify(this.entries, null, 2);
  }
}
