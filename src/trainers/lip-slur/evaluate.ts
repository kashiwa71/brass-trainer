import type { Frame } from "../../core/analysis/frames";
import { segmentNotes, segmentMidis, type NoteSegment } from "../../core/analysis/segments";

export interface SlurEvaluation {
  expected: number[];
  played: number[];
  correct: boolean;
  /** 予定になかった音（途中で引っかかった倍音など） */
  extra: number[];
  /** 出なかった音 */
  missing: number[];
  /** 音と音の間でピッチが取れなかった時間の最大値（秒）。移行の滑らかさの目安 */
  maxGapSec: number;
  segments: NoteSegment[];
}

/** 最長共通部分列で対応付ける */
function lcsMatch(a: number[], b: number[]): { matchedA: boolean[]; matchedB: boolean[] } {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const matchedA = new Array<boolean>(n).fill(false);
  const matchedB = new Array<boolean>(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      matchedA[i] = true;
      matchedB[j] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { matchedA, matchedB };
}

export function evaluateSlur(frames: Frame[], expected: number[], a4Hz: number, gateDb: number): SlurEvaluation {
  const segments = segmentNotes(frames, { a4Hz, gateDb, minDurationSec: 0.04 });
  const played = segmentMidis(segments);
  const { matchedA, matchedB } = lcsMatch(expected, played);
  const missing = expected.filter((_, i) => !matchedA[i]);
  const extra = played.filter((_, j) => !matchedB[j]);
  let maxGapSec = 0;
  for (let k = 1; k < segments.length; k++) maxGapSec = Math.max(maxGapSec, segments[k].startT - segments[k - 1].endT);
  const correct = missing.length === 0 && extra.length === 0 && played.length === expected.length;
  return { expected, played, correct, extra, missing, maxGapSec, segments };
}

export interface SlurPattern {
  id: string;
  label: string;
  /** 倍音番号の並び（基準倍音からの相対ではなく絶対の倍音番号） */
  partials: number[];
}

export const SLUR_PATTERNS: SlurPattern[] = [
  { id: "p23", label: "隣の倍音 往復（2→3→2）", partials: [2, 3, 2] },
  { id: "p234", label: "3 つの倍音 上下（2→3→4→3→2）", partials: [2, 3, 4, 3, 2] },
  { id: "p2345", label: "4 つの倍音 上下（2→3→4→5→4→3→2）", partials: [2, 3, 4, 5, 4, 3, 2] },
  { id: "oct24", label: "オクターブ 往復（2→4→2）", partials: [2, 4, 2] },
  { id: "oct24x2", label: "オクターブ 連続（2→4→2→4→2）", partials: [2, 4, 2, 4, 2] },
  { id: "oct36", label: "オクターブ 高め（3→6→3）", partials: [3, 6, 3] },
  { id: "oct12", label: "オクターブ 低め（1→2→1）", partials: [1, 2, 1] },
  { id: "p3456", label: "高い倍音 上下（3→4→5→6→5→4→3）", partials: [3, 4, 5, 6, 5, 4, 3] },
];
