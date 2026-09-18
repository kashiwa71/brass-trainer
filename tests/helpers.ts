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
}

/** 10 ms 間隔のフレーム列を仕様から作る */
export function frames(specs: FrameSpec[], a4Hz = 442, hop = 0.01): Frame[] {
  const out: Frame[] = [];
  for (const s of specs) {
    for (let t = s.from; t < s.to - 1e-9; t += hop) {
      const hz = s.midi === null ? null : midiToHz(s.midi + (s.cents ?? 0) / 100, a4Hz);
      out.push({ t: Number(t.toFixed(4)), hz, db: s.db ?? (s.midi === null ? -80 : -20), clarity: s.midi === null ? 0 : 0.95 });
    }
  }
  return out;
}
