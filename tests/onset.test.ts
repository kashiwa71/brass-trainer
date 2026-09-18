import { describe, it, expect } from "vitest";
import { OnsetDetector, intervalCv } from "../src/core/analysis/onset";
import { frames } from "./helpers";

describe("OnsetDetector", () => {
  it("無音から音が出た瞬間を検出する", () => {
    const det = new OnsetDetector({ gateDb: -50 });
    const fs = frames([
      { from: 0, to: 0.2, midi: null },
      { from: 0.2, to: 0.5, midi: 46 },
    ]);
    const onsets = fs.filter((f) => det.push(f)).map((f) => f.t);
    expect(onsets).toEqual([0.2]);
  });
  it("鳴っている最中の音量の跳ね上がりを再発音として検出する", () => {
    const det = new OnsetDetector({ gateDb: -50, jumpDb: 6 });
    const fs = frames([
      { from: 0, to: 0.1, midi: null },
      { from: 0.1, to: 0.3, midi: 46, db: -20 },
      { from: 0.3, to: 0.32, midi: 46, db: -30 },
      { from: 0.32, to: 0.5, midi: 46, db: -18 },
    ]);
    const onsets = fs.filter((f) => det.push(f)).map((f) => f.t);
    expect(onsets.length).toBe(2);
    expect(onsets[1]).toBeCloseTo(0.32, 2);
  });
  it("間隔の変動係数を計算する", () => {
    expect(intervalCv([0, 0.25, 0.5, 0.75])).toBeCloseTo(0);
    expect(intervalCv([0, 0.2, 0.5, 0.75])!).toBeGreaterThan(0.1);
    expect(intervalCv([0, 1])).toBeNull();
  });
});

describe("OnsetDetector（タンギングの切れ目）", () => {
  it("平均音量が下がらなくても、短い窓の音量の谷で再発音を検出する", () => {
    const det = new OnsetDetector({ gateDb: -50, jumpDb: 5, jumpWindowSec: 0.04 });
    const specs = [{ from: 0, to: 0.1, midi: null as number | null }];
    // 16 分音符（250 ms）: 220 ms 鳴って 30 ms 切れる。db（85 ms 窓）は −22 dB のまま
    for (let i = 0; i < 8; i++) {
      const t0 = 0.1 + i * 0.25;
      specs.push({ from: t0, to: t0 + 0.22, midi: 46, db: -22, dbFast: -20 } as never);
      specs.push({ from: t0 + 0.22, to: t0 + 0.25, midi: 46, db: -22, dbFast: -40 } as never);
    }
    const fs = frames(specs);
    const onsets = fs.filter((f) => det.push(f)).map((f) => f.t);
    expect(onsets.length).toBe(8);
    expect(onsets[1]).toBeCloseTo(0.35, 2);
  });
});
