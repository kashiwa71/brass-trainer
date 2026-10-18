/**
 * 音当てゲームの判定とゲームの進行（DOM・音声に依存しない）。
 * 的（音符）が右から次々に来る。先頭の的の音を一定時間吹けたら命中、左端の線まで来たらライフを 1 失う。
 */
import { pitchClassCents } from "../ear-training/evaluate";

/** exact: 楽器（オクターブまで一致）。pitch-class: 声（オクターブ違いも可） */
export type MatchMode = "exact" | "pitch-class";

/** 目標からのずれ（セント） */
export function centsFromTarget(midiF: number, targetMidi: number, mode: MatchMode): number {
  return mode === "pitch-class" ? pitchClassCents(midiF, targetMidi) : (midiF - targetMidi) * 100;
}

/** 目標の幅に一定時間収まり続けたら true を返す。音が途切れたり外れたりしたら数え直す。 */
export class HoldMatcher {
  private since: number | null = null;

  constructor(
    private readonly tolCents: number,
    private readonly holdSec: number,
  ) {}

  /** cents は目標からのずれ。無音なら null */
  push(t: number, cents: number | null): boolean {
    if (cents === null || Math.abs(cents) > this.tolCents) {
      this.since = null;
      return false;
    }
    if (this.since === null) this.since = t;
    return t - this.since >= this.holdSec - 1e-6;
  }

  reset(): void {
    this.since = null;
  }
}

/**
 * 次の的の音を選ぶ。直前の音から maxLeap 半音以内（0 なら制限なし）で、同じ音は続けない。
 * 条件に合う音がなければ条件をゆるめる。
 */
export function nextTarget(pool: number[], prev: number | null, maxLeap: number, rnd = Math.random): number {
  const notes = pool.length ? pool : [47];
  let candidates = notes.filter((m) => m !== prev && (prev === null || maxLeap <= 0 || Math.abs(m - prev) <= maxLeap));
  if (candidates.length === 0) candidates = notes.filter((m) => m !== prev);
  if (candidates.length === 0) candidates = notes;
  return candidates[Math.floor(rnd() * candidates.length)];
}

/** 何個撃ち落とすごとに速くなるか */
export const HITS_PER_LEVEL = 5;

/** レベルに応じた、的が左端に届くまでの秒数 */
export function travelSecFor(level: number, startSec: number, minSec = 2.5): number {
  return Math.max(minSec, startSec * Math.pow(0.88, level - 1));
}

/** 得点。早く当てるほど高く、連続で当てるほど倍率が上がる（10 連続で 2 倍） */
export function pointsFor(progress: number, combo: number): number {
  const base = 100 * (0.5 + 0.5 * (1 - Math.max(0, Math.min(1, progress))));
  return Math.round((base * (1 + 0.1 * Math.min(Math.max(combo - 1, 0), 10))) / 10) * 10;
}

export interface Target {
  id: number;
  midi: number;
  spawnT: number;
  travelSec: number;
  /** 先頭（狙う的）になった時刻 */
  frontT: number | null;
  /** 狙っている間に聞こえた音の回数（外したときに乗っていた音を残すため） */
  heard: Map<number, number>;
}

export interface TargetResult {
  midi: number;
  hit: boolean;
  /** 先頭になってから当てるまでの秒数 */
  reactionSec: number | null;
  /** 外したときにいちばん長く吹いていた音 */
  landedMidi: number | null;
}

export interface GameRecord {
  score: number;
  hits: number;
  misses: number;
  maxCombo: number;
  level: number;
  results: TargetResult[];
}

export type GameEvent = { type: "spawn"; target: Target } | { type: "escape"; target: Target; result: TargetResult };

export interface GameOptions {
  pool: number[];
  maxLeap: number;
  lives: number;
  startTravelSec: number;
  minTravelSec?: number;
  /** 次の的が出るまでの間隔（移動時間に対する割合） */
  gapRatio?: number;
  rnd?: () => number;
}

export class GameModel {
  lives: number;
  score = 0;
  combo = 0;
  maxCombo = 0;
  hits = 0;
  readonly results: TargetResult[] = [];
  /** 画面にいる的（出た順。先頭が狙う的） */
  readonly targets: Target[] = [];
  private nextId = 1;
  private nextSpawnT = Infinity;
  private lastMidi: number | null = null;

  constructor(private readonly opts: GameOptions) {
    this.lives = opts.lives;
  }

  get level(): number {
    return 1 + Math.floor(this.hits / HITS_PER_LEVEL);
  }

  get travelSec(): number {
    return travelSecFor(this.level, this.opts.startTravelSec, this.opts.minTravelSec);
  }

  get over(): boolean {
    return this.lives <= 0;
  }

  get front(): Target | null {
    return this.targets[0] ?? null;
  }

  /** 0（出たところ）〜1（左端の線） */
  progress(target: Target, t: number): number {
    return (t - target.spawnT) / target.travelSec;
  }

  begin(t: number): void {
    this.nextSpawnT = t;
  }

  /** t まで進める。出現と、左端に届いた的を順に返す。 */
  step(t: number): GameEvent[] {
    const events: GameEvent[] = [];
    while (!this.over) {
      const front = this.front;
      const escapeT = front ? front.spawnT + front.travelSec : Infinity;
      if (this.nextSpawnT <= t && this.nextSpawnT <= escapeT) {
        events.push({ type: "spawn", target: this.spawn(this.nextSpawnT) });
      } else if (front && escapeT <= t) {
        events.push({ type: "escape", target: front, result: this.escape(front) });
      } else break;
    }
    return events;
  }

  /** 先頭の的に聞こえた音を記録する */
  hear(midi: number): void {
    const f = this.front;
    if (f) f.heard.set(midi, (f.heard.get(midi) ?? 0) + 1);
  }

  /** 先頭の的に命中させる */
  hitFront(t: number): { target: Target; progress: number; points: number } | null {
    const target = this.front;
    if (!target || this.over) return null;
    const progress = this.progress(target, t);
    this.targets.shift();
    this.hits++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const points = pointsFor(progress, this.combo);
    this.score += points;
    this.results.push({ midi: target.midi, hit: true, reactionSec: t - (target.frontT ?? target.spawnT), landedMidi: null });
    this.promote(t);
    // 画面が空になったら待たせずに次を出す
    if (this.targets.length === 0) this.nextSpawnT = Math.min(this.nextSpawnT, t + 0.8);
    return { target, progress, points };
  }

  record(): GameRecord {
    return { score: this.score, hits: this.hits, misses: this.results.length - this.hits, maxCombo: this.maxCombo, level: this.level, results: this.results };
  }

  private spawn(t: number): Target {
    const midi = nextTarget(this.opts.pool, this.lastMidi, this.opts.maxLeap, this.opts.rnd);
    this.lastMidi = midi;
    const target: Target = { id: this.nextId++, midi, spawnT: t, travelSec: this.travelSec, frontT: null, heard: new Map() };
    this.targets.push(target);
    this.promote(t);
    this.nextSpawnT = t + target.travelSec * (this.opts.gapRatio ?? 0.5);
    return target;
  }

  private escape(target: Target): TargetResult {
    const t = target.spawnT + target.travelSec;
    this.targets.shift();
    this.lives--;
    this.combo = 0;
    let landed: number | null = null;
    for (const [m, n] of target.heard) if (m !== target.midi && (landed === null || n > target.heard.get(landed)!)) landed = m;
    const result: TargetResult = { midi: target.midi, hit: false, reactionSec: null, landedMidi: landed };
    this.results.push(result);
    this.promote(t);
    return result;
  }

  private promote(t: number): void {
    const f = this.front;
    if (f && f.frontT === null) f.frontT = t;
  }
}

export interface NoteGameStats {
  attempts: number;
  hits: number;
  /** 命中までの平均秒数 */
  meanReactionSec: number | null;
}

export function summarizeGames(records: GameRecord[]): Map<number, NoteGameStats> {
  const map = new Map<number, NoteGameStats>();
  for (const r of records.flatMap((g) => g.results)) {
    let s = map.get(r.midi);
    if (!s) {
      s = { attempts: 0, hits: 0, meanReactionSec: null };
      map.set(r.midi, s);
    }
    s.attempts++;
    if (r.hit) {
      s.hits++;
      const x = r.reactionSec ?? 0;
      s.meanReactionSec = s.meanReactionSec === null ? x : s.meanReactionSec + (x - s.meanReactionSec) / s.hits;
    }
  }
  return map;
}
