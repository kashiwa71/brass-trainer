import { describe, it, expect } from "vitest";
import { pitchClassCents, evaluateSing } from "../src/trainers/ear-training/evaluate";
import { evaluateDrone } from "../src/trainers/drone/evaluate";
import { adviceFor, dailyAdvice, ADVICE } from "../src/content/advice";
import { frames } from "./helpers";

const A4 = 442;
const GATE = -50;

describe("pitchClassCents", () => {
  it("オクターブ違いは同じ音として 0", () => {
    expect(pitchClassCents(59, 47)).toBe(0);
    expect(pitchClassCents(71.1, 47)).toBeCloseTo(10);
  });
  it("最寄りの方向に丸める", () => {
    expect(pitchClassCents(46.5, 47)).toBeCloseTo(-50);
    expect(pitchClassCents(53, 47)).toBeCloseTo(600);
    expect(pitchClassCents(54, 47)).toBeCloseTo(-500);
  });
});

describe("evaluateSing", () => {
  it("声で 1 オクターブ上を 0.6 秒保てば合格", () => {
    const fs = frames([
      { from: 1.0, to: 1.3, midi: 60, cents: 0 }, // 探っている
      { from: 1.3, to: 2.5, midi: 59, cents: 12 }, // H3 = 目標 H2 のオクターブ上
    ]);
    const r = evaluateSing(fs, 1.0, 47, A4, GATE);
    expect(r.matched).toBe(true);
    expect(r.timeToMatchSec).toBeCloseTo(0.3, 1);
    expect(r.cents).toBeCloseTo(12, 0);
  });
  it("ずれたままなら不合格で、最後のずれを返す", () => {
    const fs = frames([{ from: 1.0, to: 2.0, midi: 58, cents: 0 }]);
    const r = evaluateSing(fs, 1.0, 47, A4, GATE);
    expect(r.matched).toBe(false);
    expect(r.cents).toBeCloseTo(-100, 0);
  });
  it("短く合っただけでは合格にしない", () => {
    const fs = frames([
      { from: 1.0, to: 1.2, midi: 59 },
      { from: 1.2, to: 2.0, midi: 57 },
    ]);
    expect(evaluateSing(fs, 1.0, 47, A4, GATE).matched).toBe(false);
  });
});

describe("evaluateDrone", () => {
  it("ずっと合っていれば高得点", () => {
    const fs = frames([{ from: 0, to: 5, midi: 46, cents: 3 }]);
    const r = evaluateDrone(fs, 0, 5, 46, A4, GATE);
    expect(r.tightRatio).toBeCloseTo(1);
    expect(r.score).toBeGreaterThanOrEqual(95);
  });
  it("高めにずれていれば平均が正で減点", () => {
    const fs = frames([{ from: 0, to: 5, midi: 46, cents: 18 }]);
    const r = evaluateDrone(fs, 0, 5, 46, A4, GATE);
    expect(r.meanCents).toBeCloseTo(18, 0);
    expect(r.tightRatio).toBe(0);
    expect(r.looseRatio).toBeCloseTo(1);
    expect(r.score).toBeLessThan(50);
  });
  it("鳴っていない時間が多いと減点", () => {
    const fs = frames([
      { from: 0, to: 2, midi: 46 },
      { from: 2, to: 5, midi: null },
    ]);
    const r = evaluateDrone(fs, 0, 5, 46, A4, GATE);
    expect(r.soundingRatio).toBeCloseTo(0.4, 1);
    expect(r.score).toBeLessThan(60);
  });
});

describe("advice", () => {
  it("すべてに出典 URL がある", () => {
    for (const a of ADVICE) expect(a.source.url).toMatch(/^https?:\/\//);
  });
  it("出来事に合うアドバイスが返り、分野を優先する", () => {
    const xs = adviceFor("missed-below", "pitch-accuracy");
    expect(xs.length).toBeGreaterThan(0);
    expect(xs[0].topics).toContain("pitch-accuracy");
  });
  it("今日のポイントは分野に属する", () => {
    expect(dailyAdvice("lip-slur", 3).topics).toContain("lip-slur");
  });
});
