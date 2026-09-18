import type { Frame } from "../../core/analysis/frames";
import { validFrames, midiFloat } from "../shared";

/**
 * 目標音と同じ音名の最寄りのオクターブからのずれ（セント、-600〜600）。
 * 声は楽器より高いオクターブで歌うので、オクターブ違いは同じ音として扱う。
 */
export function pitchClassCents(midiF: number, targetMidi: number): number {
  let d = ((midiF - targetMidi) % 12 + 12) % 12; // 0〜12
  if (d > 6) d -= 12;
  return d * 100;
}

export interface SingMatch {
  matched: boolean;
  /** 開始から合うまでの時間（秒） */
  timeToMatchSec: number | null;
  /** 合ったときのずれ、または最後に聞こえた音のずれ */
  cents: number | null;
  /** 最後に聞こえた音の MIDI（オクターブは実際のもの） */
  lastMidi: number | null;
}

export interface SingOptions {
  tolCents?: number;
  /** 合っているとみなすために保ち続ける長さ（秒） */
  holdSec?: number;
}

/** 歌声（またはバズ）が目標の音名に一定時間収まったかを判定する。 */
export function evaluateSing(frames: Frame[], startT: number, targetMidi: number, a4Hz: number, gateDb: number, opts: SingOptions = {}): SingMatch {
  const tol = opts.tolCents ?? 40;
  const hold = opts.holdSec ?? 0.6;
  const valid = validFrames(frames, gateDb).filter((f) => f.t >= startT);
  if (valid.length === 0) return { matched: false, timeToMatchSec: null, cents: null, lastMidi: null };
  const devs = valid.map((f) => ({ t: f.t, c: pitchClassCents(midiFloat(f.hz as number, a4Hz), targetMidi), m: Math.round(midiFloat(f.hz as number, a4Hz)) }));
  for (let i = 0; i < devs.length; i++) {
    if (Math.abs(devs[i].c) > tol) continue;
    let j = i;
    let ok = true;
    while (j < devs.length && devs[j].t - devs[i].t <= hold) {
      if (Math.abs(devs[j].c) > tol) {
        ok = false;
        break;
      }
      j++;
    }
    const spanned = j > 0 && devs[Math.min(j, devs.length) - 1].t - devs[i].t >= hold - 0.02;
    if (ok && spanned) {
      const held = devs.slice(i, j);
      const mean = held.reduce((a, d) => a + d.c, 0) / held.length;
      return { matched: true, timeToMatchSec: devs[i].t - startT, cents: mean, lastMidi: devs[i].m };
    }
  }
  const last = devs[devs.length - 1];
  return { matched: false, timeToMatchSec: null, cents: last.c, lastMidi: last.m };
}
