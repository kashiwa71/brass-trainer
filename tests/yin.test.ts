import { describe, it, expect } from "vitest";
import { yin, rmsDb } from "../src/core/analysis/yin";
import { synth } from "./helpers";
import { centsBetween } from "../src/core/notes";

const SR = 12000;
const opts = { sampleRate: SR, minHz: 36, maxHz: 600 };

describe("yin", () => {
  for (const hz of [41.2, 58.3, 87.3, 123.5, 233.1, 349.2]) {
    it(`${hz} Hz を 5 セント以内で検出する`, () => {
      const buf = synth(hz, 1024 / SR, SR);
      const r = yin(buf, opts);
      expect(r.hz).not.toBeNull();
      expect(Math.abs(centsBetween(hz, r.hz as number))).toBeLessThan(5);
      expect(r.clarity).toBeGreaterThan(0.8);
    });
  }
  it("第 2 倍音が強い低音でもオクターブ上に誤検出しない", () => {
    const hz = 58.3;
    const buf = synth(hz, 1024 / SR, SR, [0.4, 1, 0.6, 0.3]);
    const r = yin(buf, opts);
    expect(Math.abs(centsBetween(hz, r.hz as number))).toBeLessThan(10);
  });
  it("強奏で、周期の 2 倍に弱い成分が混じっても 1 オクターブ下にしない", () => {
    // 実際のチューバの ff で起きた: 本当の周期の谷も十分深いが、2 倍の周期の谷がわずかに深く出る
    for (const hz of [73.4, 116.5, 146.8]) {
      const buf = synth(hz, 1024 / SR, SR);
      for (let i = 0; i < buf.length; i++) {
        const t = i / SR;
        buf[i] += 0.03 * (Math.sin(Math.PI * hz * t + 0.3) + Math.sin(3 * Math.PI * hz * t + 0.3));
      }
      const r = yin(buf, opts);
      expect(Math.abs(centsBetween(hz, r.hz as number))).toBeLessThan(10);
    }
  });
  it("雑音で谷が浅くても、周期の 2 倍・3 倍の谷を選ばない", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const hz of [87.3, 123.5]) {
      let wrong = 0;
      for (let k = 0; k < 30; k++) {
        const buf = synth(hz, 1024 / SR, SR);
        for (let i = 0; i < buf.length; i++) buf[i] += (rnd() - 0.5) * 0.45;
        const r = yin(buf, opts);
        if (r.hz === null || Math.abs(centsBetween(hz, r.hz)) > 50) wrong++;
      }
      expect(wrong).toBeLessThanOrEqual(1);
    }
  });
  it("雑音では検出しない", () => {
    const buf = new Float32Array(1024);
    let seed = 1;
    for (let i = 0; i < buf.length; i++) {
      seed = (seed * 16807) % 2147483647;
      buf[i] = (seed / 2147483647 - 0.5) * 0.2;
    }
    const r = yin(buf, opts);
    expect(r.hz === null || r.clarity < 0.6).toBe(true);
  });
  it("無音は下限の dB", () => {
    expect(rmsDb(new Float32Array(256))).toBe(-100);
  });
});
