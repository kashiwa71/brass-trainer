import { describe, it, expect } from "vitest";
import { midiToHz, hzToNote, noteName, parseNoteName, centsBetween } from "../src/core/notes";
import { TUBA_MODELS, fingeringsFor, fingeringLabel, neighborPartials, harmonicSeries, partialMidi } from "../src/core/tuba";

describe("notes", () => {
  it("A4 は基準ピッチに一致する", () => {
    expect(midiToHz(69, 442)).toBeCloseTo(442);
    expect(midiToHz(69, 440)).toBeCloseTo(440);
  });
  it("周波数から音名とセントに分解できる", () => {
    const { midi, cents } = hzToNote(midiToHz(47, 442) * Math.pow(2, 10 / 1200), 442);
    expect(midi).toBe(47);
    expect(cents).toBeCloseTo(10, 5);
  });
  it("ドイツ音名で表示する（B = シ♭、H = シ）", () => {
    expect(noteName(46)).toBe("B2");
    expect(noteName(47)).toBe("H2");
    expect(noteName(53)).toBe("F3");
    expect(noteName(51)).toBe("Es3");
    expect(noteName(60, { style: "english" })).toBe("C4");
  });
  it("音名文字列を解釈できる", () => {
    expect(parseNoteName("H2")).toBe(47);
    expect(parseNoteName("B2")).toBe(46);
    expect(parseNoteName("Bb2")).toBe(46);
    expect(parseNoteName("Es3")).toBe(51);
    expect(parseNoteName("F3")).toBe(53);
    expect(parseNoteName("xyz")).toBeNull();
  });
  it("セント差を計算できる", () => {
    expect(centsBetween(100, 200)).toBeCloseTo(1200);
  });
});

describe("tuba model (B♭)", () => {
  const bb = TUBA_MODELS.Bb;
  it("倍音列が正しい", () => {
    expect(partialMidi(bb, 1)).toBe(34); // B♭1
    expect(partialMidi(bb, 2)).toBe(46); // B♭2
    expect(partialMidi(bb, 3)).toBe(53); // F3
    expect(partialMidi(bb, 4)).toBe(58); // B♭3
    expect(partialMidi(bb, 5)).toBe(62); // D4
    expect(partialMidi(bb, 6)).toBe(65); // F4
  });
  it("H2 の運指は 2-4 か 1-2-3", () => {
    const fs = fingeringsFor(bb, 47);
    const labels = fs.map(fingeringLabel);
    expect(labels).toContain("2-4");
    expect(labels).toContain("1-2-3");
    expect(fs[0].preferred).toBe(true);
    expect(fs[0].partial).toBe(3);
  });
  it("H3 は第 5 倍音の 1-2（または 3）", () => {
    const fs = fingeringsFor(bb, 59).filter((f) => f.preferred);
    expect(fs.map(fingeringLabel)).toContain("1-2");
    expect(fs[0].partial).toBe(5);
    const nb = neighborPartials(bb, fs[0]);
    expect(nb.below).toBe(55); // G3
    expect(nb.above).toBe(62); // D4
  });
  it("同じ運指の倍音列を出せる", () => {
    expect(harmonicSeries(bb, [], [2, 3, 4])).toEqual([46, 53, 58]);
    expect(harmonicSeries(bb, [1, 2], [2, 4, 2])).toEqual([43, 55, 43]);
  });
});
