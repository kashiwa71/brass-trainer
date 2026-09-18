import { describe, it, expect } from "vitest";
import { segmentNotes, segmentMidis } from "../src/core/analysis/segments";
import { frames } from "./helpers";

describe("segmentNotes", () => {
  it("スラーで移り変わった音を区間に分ける", () => {
    const fs = frames([
      { from: 0, to: 0.5, midi: 46 },
      { from: 0.5, to: 1.0, midi: 53 },
      { from: 1.0, to: 1.5, midi: 46 },
    ]);
    const segs = segmentNotes(fs, { a4Hz: 442 });
    expect(segmentMidis(segs)).toEqual([46, 53, 46]);
    expect(segs[1].startT).toBeCloseTo(0.5, 2);
  });
  it("1 フレームだけの揺れは無視し、同じ音は結合する", () => {
    const fs = frames([
      { from: 0, to: 0.3, midi: 46 },
      { from: 0.3, to: 0.31, midi: 47 },
      { from: 0.31, to: 0.6, midi: 46 },
    ]);
    expect(segmentMidis(segmentNotes(fs, { a4Hz: 442 }))).toEqual([46]);
  });
  it("途中で引っかかった短い倍音は残す", () => {
    const fs = frames([
      { from: 0, to: 0.4, midi: 46 },
      { from: 0.4, to: 0.48, midi: 53 },
      { from: 0.48, to: 0.9, midi: 58 },
    ]);
    expect(segmentMidis(segmentNotes(fs, { a4Hz: 442 }))).toEqual([46, 53, 58]);
  });
});
