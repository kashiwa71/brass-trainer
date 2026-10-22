import type { Frame } from "../src/core/analysis/frames";
import { midiToHz } from "../src/core/notes";

/** 正弦波に倍音を重ねた合成音 */
export function synth(hz: number, seconds: number, sampleRate: number, harmonics = [1, 0.7, 0.5, 0.3]): Float32Array {
  const n = Math.floor(seconds * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let v = 0;
    harmonics.forEach((a, k) => (v += a * Math.sin(2 * Math.PI * hz * (k + 1) * t)));
    out[i] = v * 0.3;
  }
  return out;
}

export interface FrameSpec {
  /** 秒 */
  from: number;
  to: number;
  midi: number | null;
  cents?: number;
  db?: number;
  /** 省略時は db と同じ */
  dbFast?: number;
}

/** 10 ms 間隔のフレーム列を仕様から作る */
export function frames(specs: FrameSpec[], a4Hz = 442, hop = 0.01): Frame[] {
  const out: Frame[] = [];
  for (const s of specs) {
    for (let t = s.from; t < s.to - 1e-9; t += hop) {
      const hz = s.midi === null ? null : midiToHz(s.midi + (s.cents ?? 0) / 100, a4Hz);
      const db = s.db ?? (s.midi === null ? -80 : -20);
      out.push({ t: Number(t.toFixed(4)), hz, db, dbFast: s.dbFast ?? db, clarity: s.midi === null ? 0 : 0.95 });
    }
  }
  return out;
}

/**
 * スマホのマイクで録ったような音: 倍音を重ねた音に白色雑音（noise は振幅の標準偏差）を足し、
 * 2 次の高域通過（hpHz）で低音を削る。乱数は seed で固定する。
 */
export function noisyTone(hz: number, seconds: number, sampleRate: number, opts: { harmonics?: number[]; noise: number; hpHz: number; seed?: number }): Float32Array {
  const harmonics = opts.harmonics ?? [0.5, 1, 0.7, 0.5, 0.3];
  const total = harmonics.reduce((a, b) => a + b, 0);
  let seed = opts.seed ?? 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const n = Math.floor(seconds * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let v = 0;
    harmonics.forEach((a, k) => (v += a * Math.sin(2 * Math.PI * hz * (k + 1) * t + k * 0.7)));
    out[i] = (0.2 * v) / total + opts.noise * gauss();
  }
  const w0 = (2 * Math.PI * opts.hpHz) / sampleRate;
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const cs = Math.cos(w0);
  const [b0, b1, b2, a0, a1, a2] = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2, 1 + alpha, -2 * cs, 1 - alpha];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const x = out[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}
