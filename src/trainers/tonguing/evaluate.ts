import { intervalCv } from "../../core/analysis/onset";

export interface TonguingEvaluation {
  expectedCount: number;
  count: number;
  /** 発音間隔のばらつき（変動係数）。小さいほど均等 */
  cv: number | null;
  /** 拍の格子からの平均ずれ（秒） */
  meanAbsErrSec: number | null;
  pass: boolean;
  reasons: string[];
}

export interface TonguingOptions {
  /** 拍の長さ（秒） */
  beatSec: number;
  /** 演奏する拍数 */
  beats: number;
  /** 1 拍あたりの音数 */
  perBeat: number;
  maxCv?: number;
  /** 許容する格子からのずれ（音の間隔に対する割合） */
  maxErrRatio?: number;
}

/**
 * 拍の格子と発音時刻を照合して、指定数の音を均等に出せたかを判定する。
 */
export function evaluateTonguing(onsets: number[], repStart: number, opts: TonguingOptions): TonguingEvaluation {
  const { beatSec, beats, perBeat, maxCv = 0.2, maxErrRatio = 0.25 } = opts;
  const sub = beatSec / perBeat;
  const expectedCount = beats * perBeat;
  const repEnd = repStart + beats * beatSec;
  const tol = sub * 0.5;
  const inRep = onsets.filter((t) => t >= repStart - tol && t < repEnd - tol);
  const count = inRep.length;
  const cv = intervalCv(inRep);

  let meanAbsErrSec: number | null = null;
  if (count > 0) {
    let sum = 0;
    for (const t of inRep) {
      const k = Math.round((t - repStart) / sub);
      sum += Math.abs(t - (repStart + k * sub));
    }
    meanAbsErrSec = sum / count;
  }

  const reasons: string[] = [];
  if (count !== expectedCount) reasons.push(count < expectedCount ? `音数が足りない（${count}/${expectedCount}）` : `音数が多い（${count}/${expectedCount}）`);
  if (cv !== null && cv > maxCv) reasons.push("間隔が不均等");
  if (meanAbsErrSec !== null && meanAbsErrSec > sub * maxErrRatio) reasons.push("拍からずれている");
  return { expectedCount, count, cv, meanAbsErrSec, pass: reasons.length === 0, reasons };
}

/** 合否に応じて次のテンポを決める。 */
export function nextTempo(bpm: number, pass: boolean, step: number, min: number, max: number): number {
  const next = pass ? bpm + step : bpm - Math.ceil(step / 2);
  return Math.max(min, Math.min(max, next));
}
