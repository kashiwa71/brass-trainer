/**
 * 音声解析ワーカー。主スレッドから受け取った音声を間引き（約 12 kHz）し、
 * 一定間隔でピッチ・音量・明瞭さを計算して Frame として返す。
 */
import { yin, rmsDb } from "../analysis/yin";
import type { Frame } from "../analysis/frames";

interface InitMsg {
  type: "init";
  sampleRate: number;
  minHz: number;
  maxHz: number;
}
interface ChunkMsg {
  type: "chunk";
  t: number;
  samples: Float32Array;
}
export type WorkerInMsg = InitMsg | ChunkMsg;

const WINDOW = 1024; // 約 85 ms @ 12 kHz
const HOP = 128; // 約 10.7 ms @ 12 kHz

let decim = 4;
let sr = 12000;
let minHz = 38;
let maxHz = 500;
let ring = new Float32Array(WINDOW);
let ringPos = 0;
let filledTotal = 0;
let sinceHop = 0;
let lpAcc: number[] = [];
let lastChunkT = 0;
let samplesSinceChunkStart = 0;

self.onmessage = (ev: MessageEvent<WorkerInMsg>) => {
  const msg = ev.data;
  if (msg.type === "init") {
    decim = Math.max(1, Math.round(msg.sampleRate / 12000));
    sr = msg.sampleRate / decim;
    minHz = msg.minHz;
    maxHz = msg.maxHz;
    ring = new Float32Array(WINDOW);
    ringPos = 0;
    filledTotal = 0;
    sinceHop = 0;
    lpAcc = [];
    return;
  }
  lastChunkT = msg.t;
  samplesSinceChunkStart = 0;
  const s = msg.samples;
  for (let i = 0; i < s.length; i++) {
    samplesSinceChunkStart++;
    lpAcc.push(s[i]);
    if (lpAcc.length < decim) continue;
    // 単純移動平均で低域通過してから間引く
    let sum = 0;
    for (const v of lpAcc) sum += v;
    lpAcc = [];
    ring[ringPos] = sum / decim;
    ringPos = (ringPos + 1) % WINDOW;
    filledTotal++;
    sinceHop++;
    if (sinceHop >= HOP && filledTotal >= WINDOW) {
      sinceHop = 0;
      const win = new Float32Array(WINDOW);
      for (let k = 0; k < WINDOW; k++) win[k] = ring[(ringPos + k) % WINDOW];
      const db = rmsDb(win);
      const res = db > -70 ? yin(win, { sampleRate: sr, minHz, maxHz }) : { hz: null, clarity: 0 };
      const t = lastChunkT + samplesSinceChunkStart / (sr * decim);
      const frame: Frame = { t, hz: res.hz, db, clarity: res.clarity };
      (self as unknown as Worker).postMessage(frame);
    }
  }
};
