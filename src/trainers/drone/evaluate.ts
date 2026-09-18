import type { Frame } from "../../core/analysis/frames";
import { validFrames, midiFloat } from "../shared";
import { pitchClassCents } from "../ear-training/evaluate";

export interface DroneResult {
  /** 音が鳴っていた割合（0〜1） */
  soundingRatio: number;
  /** ±tight セント以内だった時間の割合 */
  tightRatio: number;
  /** ±loose セント以内だった時間の割合 */
  looseRatio: number;
  meanCents: number | null;
  /** ずれの標準偏差（揺れの大きさ） */
  wobbleCents: number | null;
  score: number;
}

export interface DroneOptions {
  tightCents?: number;
  looseCents?: number;
}

/** ドローンに合わせて伸ばした音が、どれだけ合っていたかを評価する。 */
export function evaluateDrone(frames: Frame[], startT: number, endT: number, targetMidi: number, a4Hz: number, gateDb: number, opts: DroneOptions = {}): DroneResult {
  const tight = opts.tightCents ?? 10;
  const loose = opts.looseCents ?? 25;
  const span = frames.filter((f) => f.t >= startT && f.t <= endT);
  const valid = validFrames(span, gateDb);
  if (span.length === 0 || valid.length === 0) return { soundingRatio: 0, tightRatio: 0, looseRatio: 0, meanCents: null, wobbleCents: null, score: 0 };
  const cents = valid.map((f) => pitchClassCents(midiFloat(f.hz as number, a4Hz), targetMidi));
  const tightN = cents.filter((c) => Math.abs(c) <= tight).length;
  const looseN = cents.filter((c) => Math.abs(c) <= loose).length;
  const mean = cents.reduce((a, b) => a + b, 0) / cents.length;
  const wobble = Math.sqrt(cents.reduce((a, c) => a + (c - mean) ** 2, 0) / cents.length);
  const soundingRatio = valid.length / span.length;
  const tightRatio = tightN / valid.length;
  const looseRatio = looseN / valid.length;
  // 点数: 締まった範囲にいた割合を主に、揺れと鳴っていない時間で減点
  let score = Math.round(tightRatio * 70 + looseRatio * 30);
  if (soundingRatio < 0.7) score = Math.round(score * soundingRatio);
  if (wobble > 20) score -= Math.min(15, Math.round((wobble - 20) / 2));
  return { soundingRatio, tightRatio, looseRatio, meanCents: mean, wobbleCents: wobble, score: Math.max(0, Math.min(100, score)) };
}
