import type { Frame } from "./frames";

/**
 * 音量の立ち上がりで発音（アタック）を検出する。判定には直近約 10 ms の音量（dbFast）を使う。
 * - 無音区間の後に音量が閾値を超えた瞬間（新しい音の出だし）
 * - 音が鳴っている最中でも、短時間に音量が急に上がった瞬間（タンギングの再発音）
 */
export interface OnsetOptions {
  /** この音量（dBFS）を超えたら「音が鳴っている」とみなす */
  gateDb: number;
  /** 再発音とみなす音量の跳ね上がり幅（dB） */
  jumpDb?: number;
  /** 跳ね上がりを見る時間幅（秒） */
  jumpWindowSec?: number;
  /** 連続する発音の最短間隔（秒）。これより短い検出は無視する */
  minIntervalSec?: number;
}

export class OnsetDetector {
  private history: Frame[] = [];
  private lastOnsetT = -Infinity;
  private sounding = false;
  readonly opts: Required<OnsetOptions>;

  constructor(opts: OnsetOptions) {
    this.opts = {
      gateDb: opts.gateDb,
      jumpDb: opts.jumpDb ?? 6,
      jumpWindowSec: opts.jumpWindowSec ?? 0.04,
      minIntervalSec: opts.minIntervalSec ?? 0.06,
    };
  }

  reset(): void {
    this.history = [];
    this.lastOnsetT = -Infinity;
    this.sounding = false;
  }

  get isSounding(): boolean {
    return this.sounding;
  }

  /** フレームを 1 つ処理し、発音を検出したら true を返す。 */
  push(frame: Frame): boolean {
    const { gateDb, jumpDb, jumpWindowSec, minIntervalSec } = this.opts;
    this.history.push(frame);
    const cutoff = frame.t - jumpWindowSec * 3;
    while (this.history.length > 2 && this.history[0].t < cutoff) this.history.shift();

    let onset = false;
    const level = frame.dbFast;
    const above = level > gateDb;
    if (!this.sounding && above) {
      onset = true;
    } else if (this.sounding && above) {
      // 直近の窓の最小音量からの跳ね上がり
      let minDb = Infinity;
      for (const h of this.history) {
        if (h.t < frame.t - jumpWindowSec) continue;
        if (h.t >= frame.t) break;
        minDb = Math.min(minDb, h.dbFast);
      }
      if (minDb !== Infinity && level - minDb >= jumpDb) onset = true;
    }
    this.sounding = above;

    if (onset && frame.t - this.lastOnsetT >= minIntervalSec) {
      this.lastOnsetT = frame.t;
      return true;
    }
    return false;
  }
}

/** 発音間隔の均一さ。変動係数（標準偏差 / 平均）を返す。 */
export function intervalCv(onsetTimes: number[]): number | null {
  if (onsetTimes.length < 3) return null;
  const iv: number[] = [];
  for (let i = 1; i < onsetTimes.length; i++) iv.push(onsetTimes[i] - onsetTimes[i - 1]);
  const mean = iv.reduce((a, b) => a + b, 0) / iv.length;
  if (mean <= 0) return null;
  const varSum = iv.reduce((a, b) => a + (b - mean) ** 2, 0) / iv.length;
  return Math.sqrt(varSum) / mean;
}
