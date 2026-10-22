import { describe, it, expect } from "vitest";
import { FrameAnalyzer } from "../src/core/analysis/analyzer";
import type { Frame } from "../src/core/analysis/frames";
import { hzToMidiFloat, midiToHz } from "../src/core/notes";
import { noisyTone, synth } from "./helpers";

const SR = 48000;

function analyze(samples: Float32Array): Frame[] {
  const an = new FrameAnalyzer({ sampleRate: SR, minHz: 36, maxHz: 600 });
  const out: Frame[] = [];
  // マイクと同じく 1024 サンプルずつ渡す
  for (let i = 0; i < samples.length; i += 1024) out.push(...an.push(i / SR, samples.subarray(i, i + 1024)));
  return out;
}

describe("FrameAnalyzer", () => {
  it("約 10.7 ms ごとに、時刻とピッチの付いたフレームを出す", () => {
    const fs = analyze(synth(116.5, 1, SR));
    expect(fs.length).toBeGreaterThan(80);
    const dt = fs[1].t - fs[0].t;
    expect(dt).toBeCloseTo(512 / SR, 6);
    for (const f of fs) expect(Math.abs(hzToMidiFloat(f.hz as number, 442) - hzToMidiFloat(116.5, 442))).toBeLessThan(0.05);
  });

  // スマホのマイクは低音が弱く、雑音も乗る。以前はここで 1 オクターブ下・12 度下と行き来していた
  for (const midi of [41, 46, 47, 53]) {
    it(`雑音と低域の減衰があっても ${midi} を保ち、オクターブ下などに飛ばない`, () => {
      const fs = analyze(noisyTone(midiToHz(midi, 442), 3, SR, { noise: 0.05, hpHz: 200, seed: midi })).slice(10);
      const off = fs.filter((f) => f.hz === null || Math.abs(hzToMidiFloat(f.hz, 442) - midi) > 0.5);
      expect(off.length / fs.length).toBeLessThan(0.02);
    });
  }
});
