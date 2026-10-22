import { describe, it, expect } from "vitest";
import { PitchSmoother, NoteNameHold } from "../src/core/analysis/smoothing";

const HOP = 0.0107;

/** t = 0 から HOP ごとに値を流し、ならした値の列を返す */
function run(sm: PitchSmoother, values: (number | null)[]): (number | null)[] {
  return values.map((v, i) => sm.push(i * HOP, v));
}

describe("PitchSmoother", () => {
  it("細かな揺れを小さくする", () => {
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const input = Array.from({ length: 300 }, () => 46 + (rnd() - 0.5) * 0.2);
    const out = run(new PitchSmoother(), input).slice(50) as number[];
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    expect(spread(out)).toBeLessThan(spread(input.slice(50)) / 2);
    expect(out[out.length - 1]).toBeCloseTo(46, 1);
  });

  it("一瞬のオクターブ違いでは動かない", () => {
    const input = [...Array(30).fill(46), ...Array(4).fill(34), ...Array(30).fill(46)];
    for (const v of run(new PitchSmoother(), input)) expect(v).toBeCloseTo(46, 5);
  });

  it("別の音に移ってそのまま続けば、約 60 ms で切り替わる", () => {
    const input = [...Array(30).fill(46), ...Array(30).fill(58)];
    const out = run(new PitchSmoother(), input);
    const switched = out.findIndex((v, i) => i >= 30 && v !== null && Math.abs(v - 58) < 0.1);
    expect((switched - 30) * HOP).toBeGreaterThan(0.04);
    expect((switched - 30) * HOP).toBeLessThan(0.08);
  });

  it("短い途切れでは値を保ち、長く途切れたら消す", () => {
    const sm = new PitchSmoother({ gapSec: 0.3 });
    const out = run(sm, [...Array(20).fill(46), ...Array(10).fill(null), ...Array(40).fill(null)]);
    expect(out[29]).toBeCloseTo(46, 5);
    expect(out[out.length - 1]).toBeNull();
  });
});

describe("NoteNameHold", () => {
  it("音名の境目付近で揺れても音名を変えない", () => {
    const hold = new NoteNameHold();
    const names = [46.45, 46.55, 46.48, 46.6, 46.52, 46.44].map((m) => hold.push(m)?.midi);
    expect(new Set(names)).toEqual(new Set([46]));
  });

  it("はっきり離れたら切り替える", () => {
    const hold = new NoteNameHold();
    hold.push(46.4);
    expect(hold.push(46.7)?.midi).toBe(47);
    expect(hold.push(46.0)?.midi).toBe(46);
  });
});
