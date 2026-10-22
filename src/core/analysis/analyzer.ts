/**
 * マイクの音を間引き（約 12 kHz）し、一定間隔でピッチ・音量・明瞭さを計算して Frame にする。
 * 解析ワーカーの中身。DOM やワーカーに依存しないので、テストでも同じ処理を通せる。
 */
import { yin, rmsDb } from "./yin";
import type { Frame } from "./frames";

const WINDOW = 1024; // 約 85 ms @ 12 kHz
const HOP = 128; // 約 10.7 ms @ 12 kHz

export interface AnalyzerOptions {
  /** 入力のサンプリング周波数 */
  sampleRate: number;
  minHz: number;
  maxHz: number;
}

export class FrameAnalyzer {
  private readonly decim: number;
  private readonly sr: number;
  private readonly ring = new Float32Array(WINDOW);
  private ringPos = 0;
  private filledTotal = 0;
  private sinceHop = 0;
  private lpSum = 0;
  private lpCount = 0;

  constructor(private readonly opts: AnalyzerOptions) {
    this.decim = Math.max(1, Math.round(opts.sampleRate / 12000));
    this.sr = opts.sampleRate / this.decim;
  }

  /** t はこのまとまりの先頭の AudioContext 時刻（秒）。できたフレームを返す。 */
  push(t: number, samples: Float32Array): Frame[] {
    const out: Frame[] = [];
    const { decim, sr } = this;
    for (let i = 0; i < samples.length; i++) {
      // 単純移動平均で低域通過してから間引く
      this.lpSum += samples[i];
      if (++this.lpCount < decim) continue;
      this.ring[this.ringPos] = this.lpSum / decim;
      this.lpSum = 0;
      this.lpCount = 0;
      this.ringPos = (this.ringPos + 1) % WINDOW;
      this.filledTotal++;
      this.sinceHop++;
      if (this.sinceHop < HOP || this.filledTotal < WINDOW) continue;
      this.sinceHop = 0;
      const win = new Float32Array(WINDOW);
      for (let k = 0; k < WINDOW; k++) win[k] = this.ring[(this.ringPos + k) % WINDOW];
      const db = rmsDb(win);
      const dbFast = rmsDb(win.subarray(WINDOW - HOP));
      const res = db > -70 ? yin(win, { sampleRate: sr, minHz: this.opts.minHz, maxHz: this.opts.maxHz }) : { hz: null, clarity: 0 };
      out.push({ t: t + (i + 1) / this.opts.sampleRate, hz: res.hz, db, dbFast, clarity: res.clarity });
    }
    return out;
  }
}
