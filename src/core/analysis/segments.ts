import type { Frame } from "./frames";
import { hzToNote } from "../notes";

/** ピッチが安定して続いた区間（＝ 1 つの音） */
export interface NoteSegment {
  midi: number;
  startT: number;
  endT: number;
  /** 区間内のセント偏差の中央値 */
  cents: number;
  frames: number;
}

export interface SegmentOptions {
  a4Hz: number;
  /** 音とみなす最短の長さ（秒） */
  minDurationSec?: number;
  /** 音量の下限（dBFS） */
  gateDb?: number;
  /** 明瞭さの下限 */
  minClarity?: number;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * フレーム列を「同じ音が続いた区間」に分割する。
 * スラーのように発音の切れ目がない場合でも、音の移り変わりを検出できる。
 * 途中で一瞬だけ別の倍音に触れた場合も短い区間として残るので、リップスラーの引っかかり検出に使える。
 */
export function segmentNotes(frames: Frame[], opts: SegmentOptions): NoteSegment[] {
  const { a4Hz, minDurationSec = 0.05, gateDb = -60, minClarity = 0.6 } = opts;
  const raw: NoteSegment[] = [];
  let cur: { midi: number; startT: number; endT: number; cents: number[] } | null = null;

  const flush = () => {
    if (!cur) return;
    raw.push({ midi: cur.midi, startT: cur.startT, endT: cur.endT, cents: median(cur.cents), frames: cur.cents.length });
    cur = null;
  };

  for (const f of frames) {
    const valid = f.hz !== null && f.db > gateDb && f.clarity >= minClarity;
    if (!valid) {
      flush();
      continue;
    }
    const { midi, cents } = hzToNote(f.hz as number, a4Hz);
    if (cur && cur.midi === midi) {
      cur.endT = f.t;
      cur.cents.push(cents);
    } else {
      flush();
      cur = { midi, startT: f.t, endT: f.t, cents: [cents] };
    }
  }
  flush();

  // 短すぎる区間（1〜2 フレームの揺れ）は除き、同じ音が隣り合えば結合する
  const out: NoteSegment[] = [];
  for (const s of raw) {
    if (s.endT - s.startT < minDurationSec) continue;
    const last = out[out.length - 1];
    if (last && last.midi === s.midi && s.startT - last.endT < minDurationSec * 2) {
      last.endT = s.endT;
      last.frames += s.frames;
      last.cents = (last.cents + s.cents) / 2;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

/** 区間列から音名の並びだけを取り出す（連続する同音は 1 つにまとめる）。 */
export function segmentMidis(segments: NoteSegment[]): number[] {
  const out: number[] = [];
  for (const s of segments) if (out[out.length - 1] !== s.midi) out.push(s.midi);
  return out;
}
