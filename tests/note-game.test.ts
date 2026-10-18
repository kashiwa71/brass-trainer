import { describe, it, expect } from "vitest";
import { GameModel, HoldMatcher, centsFromTarget, nextTarget, pointsFor, summarizeGames, travelSecFor, HITS_PER_LEVEL } from "../src/trainers/note-game/evaluate";

/** 決まった順に値を返す乱数の代わり */
function seq(...xs: number[]): () => number {
  let i = 0;
  return () => xs[i++ % xs.length];
}

describe("note-game 判定", () => {
  it("楽器はオクターブ違いを外れ、声は同じ音とみなす", () => {
    expect(centsFromTarget(59.1, 47, "exact")).toBeCloseTo(1210, 0);
    expect(centsFromTarget(59.1, 47, "pitch-class")).toBeCloseTo(10, 0);
  });
  it("幅に収まり続けたら命中。途切れたら数え直す", () => {
    const m = new HoldMatcher(40, 0.12);
    expect(m.push(1.0, 10)).toBe(false);
    expect(m.push(1.08, 10)).toBe(false);
    expect(m.push(1.1, null)).toBe(false);
    expect(m.push(1.15, -20)).toBe(false);
    expect(m.push(1.25, 60)).toBe(false);
    expect(m.push(1.3, 5)).toBe(false);
    expect(m.push(1.42, 5)).toBe(true);
  });
});

describe("note-game 出題", () => {
  it("同じ音を続けず、跳躍の幅を守る", () => {
    const pool = [41, 47, 53, 60];
    for (let i = 0; i < 50; i++) {
      const m = nextTarget(pool, 47, 7);
      expect(m).not.toBe(47);
      expect(Math.abs(m - 47)).toBeLessThanOrEqual(7);
    }
  });
  it("候補がなければ条件をゆるめる", () => {
    expect(nextTarget([47], 47, 7)).toBe(47);
    expect(nextTarget([30, 60], 30, 7)).toBe(60);
  });
  it("レベルが上がると速くなり、下限で止まる", () => {
    expect(travelSecFor(1, 8)).toBe(8);
    expect(travelSecFor(2, 8)).toBeCloseTo(7.04);
    expect(travelSecFor(50, 8)).toBe(2.5);
  });
  it("早く当てるほど、続けて当てるほど点が高い", () => {
    expect(pointsFor(0, 1)).toBe(100);
    expect(pointsFor(1, 1)).toBe(50);
    expect(pointsFor(0, 11)).toBe(200);
    expect(pointsFor(0.5, 3)).toBeGreaterThan(pointsFor(0.5, 1));
  });
});

describe("note-game 進行", () => {
  const make = () => new GameModel({ pool: [41, 47], maxLeap: 0, lives: 2, startTravelSec: 8, rnd: seq(0.9, 0.1) });

  it("的が順に出て、先頭に命中すると得点が入る", () => {
    const g = make();
    g.begin(0);
    const ev = g.step(0);
    expect(ev.map((e) => e.type)).toEqual(["spawn"]);
    expect(g.front?.midi).toBe(47);
    g.step(4);
    expect(g.targets.map((t) => t.midi)).toEqual([47, 41]);
    const hit = g.hitFront(4);
    expect(hit?.points).toBe(80);
    expect(g.front?.midi).toBe(41);
    expect(g.front?.frontT).toBe(4);
    expect(g.combo).toBe(1);
  });

  it("左端に届いたらライフを失い、乗っていた音を残す。ライフがなくなれば終わり", () => {
    const g = make();
    g.begin(0);
    g.step(0);
    g.hear(46);
    g.hear(46);
    g.hear(47);
    const ev = g.step(8);
    const escape = ev.find((e) => e.type === "escape");
    expect(escape && escape.type === "escape" && escape.result.landedMidi).toBe(46);
    expect(g.lives).toBe(1);
    g.step(100);
    expect(g.over).toBe(true);
    const rec = g.record();
    expect(rec.hits).toBe(0);
    expect(rec.misses).toBe(2);
  });

  it("撃ち落とすと速くなり、画面が空なら次をすぐ出す", () => {
    const g = new GameModel({ pool: [41, 47], maxLeap: 0, lives: 3, startTravelSec: 8, rnd: seq(0.5) });
    g.begin(0);
    let t = 0;
    for (let i = 0; i < HITS_PER_LEVEL; i++) {
      g.step(t);
      g.hitFront(t + 0.5);
      t += 1.3;
    }
    expect(g.level).toBe(2);
    g.step(t);
    expect(g.targets[g.targets.length - 1].travelSec).toBeCloseTo(7.04);
  });

  it("成績を音ごとにまとめる", () => {
    const s = summarizeGames([
      {
        score: 0,
        hits: 1,
        misses: 1,
        maxCombo: 1,
        level: 1,
        results: [
          { midi: 47, hit: true, reactionSec: 2, landedMidi: null },
          { midi: 47, hit: false, reactionSec: null, landedMidi: 46 },
        ],
      },
    ]);
    expect(s.get(47)).toEqual({ attempts: 2, hits: 1, meanReactionSec: 2 });
  });
});
