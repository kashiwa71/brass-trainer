import type { Frame } from "../../core/analysis/frames";
import { validFrames, dominantNote } from "../shared";

export interface AttackJudgement {
  targetMidi: number;
  /** 実際に乗った音。ピッチが取れなければ null */
  landedMidi: number | null;
  cents: number | null;
  hit: boolean;
}

/**
 * 発音直後（50〜300 ms）のピッチから、狙った音に乗ったかを判定する。
 * 最初の 50 ms は舌の雑音で不安定なので除く。
 */
export function judgeAttack(
  frames: Frame[],
  onsetT: number,
  targetMidi: number,
  a4Hz: number,
  gateDb: number,
  window: { from: number; to: number } = { from: 0.05, to: 0.3 },
): AttackJudgement {
  const inWindow = validFrames(frames, gateDb).filter((f) => f.t >= onsetT + window.from && f.t <= onsetT + window.to);
  const dom = dominantNote(inWindow, a4Hz);
  if (!dom) return { targetMidi, landedMidi: null, cents: null, hit: false };
  return { targetMidi, landedMidi: dom.midi, cents: dom.cents, hit: dom.midi === targetMidi };
}

export interface NoteStats {
  attempts: number;
  hits: number;
  /** 外したときに乗った音の回数 */
  misses: Record<number, number>;
  /** 命中時のセント偏差の平均 */
  meanCents: number | null;
}

export function summarize(results: AttackJudgement[]): Map<number, NoteStats> {
  const map = new Map<number, NoteStats>();
  for (const r of results) {
    let s = map.get(r.targetMidi);
    if (!s) {
      s = { attempts: 0, hits: 0, misses: {}, meanCents: null };
      map.set(r.targetMidi, s);
    }
    s.attempts++;
    if (r.hit) {
      s.hits++;
      const c = r.cents ?? 0;
      s.meanCents = s.meanCents === null ? c : s.meanCents + (c - s.meanCents) / s.hits;
    } else if (r.landedMidi !== null) {
      s.misses[r.landedMidi] = (s.misses[r.landedMidi] ?? 0) + 1;
    }
  }
  return map;
}
