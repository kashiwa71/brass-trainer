import { describe, it, expect } from "vitest";
import { judgeAttack, summarize } from "../src/trainers/note-attack/evaluate";
import { evaluateAttack } from "../src/trainers/attack-quality/evaluate";
import { evaluateSlur } from "../src/trainers/lip-slur/evaluate";
import { evaluateTonguing, nextTempo } from "../src/trainers/tonguing/evaluate";
import { frames } from "./helpers";

const A4 = 442;
const GATE = -50;

describe("note-attack judgeAttack", () => {
  it("狙った音に乗れば命中", () => {
    const fs = frames([{ from: 1.0, to: 1.4, midi: 47, cents: 8 }]);
    const r = judgeAttack(fs, 1.0, 47, A4, GATE);
    expect(r.hit).toBe(true);
    expect(r.landedMidi).toBe(47);
    expect(r.cents).toBeCloseTo(8, 0);
  });
  it("隣の倍音に落ちたら外れで、乗った音を返す", () => {
    const fs = frames([{ from: 1.0, to: 1.4, midi: 55 }]);
    const r = judgeAttack(fs, 1.0, 59, A4, GATE);
    expect(r.hit).toBe(false);
    expect(r.landedMidi).toBe(55);
  });
  it("最初の 50 ms の乱れは無視する", () => {
    const fs = frames([
      { from: 1.0, to: 1.04, midi: 62 },
      { from: 1.04, to: 1.4, midi: 59 },
    ]);
    expect(judgeAttack(fs, 1.0, 59, A4, GATE).hit).toBe(true);
  });
  it("統計をまとめる", () => {
    const s = summarize([
      { targetMidi: 47, landedMidi: 47, cents: 5, hit: true },
      { targetMidi: 47, landedMidi: 46, cents: 0, hit: false },
      { targetMidi: 47, landedMidi: 46, cents: 0, hit: false },
    ]);
    const st = s.get(47)!;
    expect(st.attempts).toBe(3);
    expect(st.hits).toBe(1);
    expect(st.misses[46]).toBe(2);
  });
});

describe("attack-quality evaluateAttack", () => {
  it("きれいな出だしは高得点", () => {
    const fs = frames([{ from: 2.0, to: 2.7, midi: 47, cents: 3, db: -18 }]);
    const q = evaluateAttack(fs, 2.0, A4, GATE);
    expect(q.settledMidi).toBe(47);
    expect(q.glitch).toBe(false);
    expect(q.stabilizeSec).toBeLessThanOrEqual(0.02);
    expect(q.score).toBeGreaterThanOrEqual(95);
  });
  it("下からしゃくり上げると減点される", () => {
    const fs = frames([
      { from: 2.0, to: 2.05, midi: 47, cents: -80, db: -18 },
      { from: 2.05, to: 2.1, midi: 47, cents: -40, db: -18 },
      { from: 2.1, to: 2.7, midi: 47, cents: 0, db: -18 },
    ]);
    const q = evaluateAttack(fs, 2.0, A4, GATE);
    expect(q.initialCents).toBeLessThan(-60);
    expect(q.stabilizeSec).toBeGreaterThan(0.08);
    expect(q.penalties.some((p) => p.label.includes("しゃくり"))).toBe(true);
    expect(q.score).toBeLessThan(90);
  });
  it("別の倍音に引っかかると検出される", () => {
    const fs = frames([
      { from: 2.0, to: 2.08, midi: 62, db: -18 },
      { from: 2.08, to: 2.7, midi: 59, db: -18 },
    ]);
    const q = evaluateAttack(fs, 2.0, A4, GATE);
    expect(q.glitch).toBe(true);
    expect(q.glitchMidi).toBe(62);
    expect(q.settledMidi).toBe(59);
  });
  it("音量の立ち上がりが遅いと減点される", () => {
    const specs = [];
    for (let i = 0; i < 30; i++) specs.push({ from: 2.0 + i * 0.01, to: 2.01 + i * 0.01, midi: 47, db: -40 + i * 0.7 });
    specs.push({ from: 2.3, to: 2.7, midi: 47, db: -18 });
    const q = evaluateAttack(frames(specs), 2.0, A4, GATE);
    expect(q.riseSec).toBeGreaterThan(0.2);
    expect(q.penalties.some((p) => p.label.includes("立ち上がり"))).toBe(true);
  });
  it("ピッチが取れなければ 0 点", () => {
    const q = evaluateAttack(frames([{ from: 2.0, to: 2.6, midi: null }]), 2.0, A4, GATE);
    expect(q.score).toBe(0);
    expect(q.settledMidi).toBeNull();
  });
});

describe("lip-slur evaluateSlur", () => {
  it("予定どおりの並びなら正解", () => {
    const fs = frames([
      { from: 0, to: 0.5, midi: 46 },
      { from: 0.5, to: 1.0, midi: 58 },
      { from: 1.0, to: 1.5, midi: 46 },
    ]);
    const r = evaluateSlur(fs, [46, 58, 46], A4, GATE);
    expect(r.correct).toBe(true);
    expect(r.extra).toEqual([]);
    expect(r.missing).toEqual([]);
  });
  it("途中の倍音に引っかかると extra に出る", () => {
    const fs = frames([
      { from: 0, to: 0.5, midi: 46 },
      { from: 0.5, to: 0.6, midi: 53 },
      { from: 0.6, to: 1.0, midi: 58 },
      { from: 1.0, to: 1.5, midi: 46 },
    ]);
    const r = evaluateSlur(fs, [46, 58, 46], A4, GATE);
    expect(r.correct).toBe(false);
    expect(r.extra).toEqual([53]);
  });
  it("届かなかった音は missing に出る", () => {
    const fs = frames([
      { from: 0, to: 0.5, midi: 46 },
      { from: 0.5, to: 1.0, midi: 53 },
      { from: 1.0, to: 1.5, midi: 46 },
    ]);
    const r = evaluateSlur(fs, [46, 58, 46], A4, GATE);
    expect(r.missing).toEqual([58]);
    expect(r.extra).toEqual([53]);
  });
  it("移行中にピッチが取れない時間を測る", () => {
    const fs = frames([
      { from: 0, to: 0.5, midi: 46 },
      { from: 0.5, to: 0.62, midi: null },
      { from: 0.62, to: 1.0, midi: 58 },
    ]);
    const r = evaluateSlur(fs, [46, 58], A4, GATE);
    expect(r.maxGapSec).toBeGreaterThan(0.1);
  });
});

describe("tonguing evaluateTonguing", () => {
  const beatSec = 0.5;
  it("均等に規定数吹けば合格", () => {
    const onsets = [];
    for (let i = 0; i < 16; i++) onsets.push(10 + i * beatSec / 4 + (i % 2 ? 0.005 : -0.005));
    const r = evaluateTonguing(onsets, 10, { beatSec, beats: 4, perBeat: 4 });
    expect(r.count).toBe(16);
    expect(r.pass).toBe(true);
  });
  it("音数が足りなければ不合格", () => {
    const onsets = [];
    for (let i = 0; i < 12; i++) onsets.push(10 + i * beatSec / 4);
    const r = evaluateTonguing(onsets, 10, { beatSec, beats: 4, perBeat: 4 });
    expect(r.pass).toBe(false);
    expect(r.reasons[0]).toContain("足りない");
  });
  it("不均等なら不合格", () => {
    const onsets = [10, 10.1, 10.3, 10.35, 10.5, 10.7, 10.72, 10.9];
    const r = evaluateTonguing(onsets, 10, { beatSec, beats: 2, perBeat: 4 });
    expect(r.pass).toBe(false);
  });
  it("テンポの階段", () => {
    expect(nextTempo(100, true, 4, 40, 200)).toBe(104);
    expect(nextTempo(100, false, 4, 40, 200)).toBe(98);
    expect(nextTempo(199, true, 4, 40, 200)).toBe(200);
  });
});

import { randomLeapFrom } from "../src/trainers/note-attack/index";

describe("note-attack randomLeapFrom", () => {
  it("目標と異なり、完全 5 度以内、音域内の音を返す", () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 50; i++) {
      const m = randomLeapFrom(47, 40, 50, rnd);
      expect(m).not.toBe(47);
      expect(Math.abs(m - 47)).toBeLessThanOrEqual(7);
      expect(m).toBeGreaterThanOrEqual(40);
      expect(m).toBeLessThanOrEqual(50);
    }
  });
});
