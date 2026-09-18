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
