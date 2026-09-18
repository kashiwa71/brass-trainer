/**
 * チューバの倍音列と運指のモデル。
 * 「どの倍音に乗るべきか」「外すと隣のどの音に落ちるか」を練習画面で示すために使う。
 */
import { noteName } from "./notes";

export type TubaKey = "Bb" | "C" | "Eb" | "F";

export interface TubaModel {
  key: TubaKey;
  label: string;
  /** 開放のペダル音（第 1 倍音）の MIDI 番号 */
  fundamentalMidi: number;
  valves: 3 | 4;
  /** 実用音域（MIDI） */
  range: { low: number; high: number };
}

export const TUBA_MODELS: Record<TubaKey, TubaModel> = {
  Bb: { key: "Bb", label: "B♭ チューバ", fundamentalMidi: 34, valves: 4, range: { low: 26, high: 67 } },
  C: { key: "C", label: "C チューバ", fundamentalMidi: 36, valves: 4, range: { low: 28, high: 69 } },
  Eb: { key: "Eb", label: "E♭ チューバ", fundamentalMidi: 39, valves: 4, range: { low: 31, high: 72 } },
  F: { key: "F", label: "F チューバ", fundamentalMidi: 41, valves: 4, range: { low: 33, high: 74 } },
};

/** 各倍音の平均律からの偏差（セント）。第 5 倍音は低く、第 7 倍音はかなり低い。 */
export const PARTIAL_CENTS: Record<number, number> = {
  1: 0,
  2: 0,
  3: 2,
  4: 0,
  5: -14,
  6: 2,
  7: -31,
  8: 0,
  9: 4,
  10: -14,
};

/** 倍音番号 → 開放管での MIDI 番号（平均律に丸めた値） */
export function partialMidi(model: TubaModel, partial: number): number {
  return Math.round(model.fundamentalMidi + 12 * Math.log2(partial));
}

/** 運指（バルブ番号の配列）による半音の下げ幅 */
export function valveSemitones(valves: number[]): number {
  const table: Record<number, number> = { 1: 2, 2: 1, 3: 3, 4: 5 };
  return valves.reduce((s, v) => s + (table[v] ?? 0), 0);
}

export interface Fingering {
  valves: number[];
  partial: number;
  /** 代表的な運指かどうか（第 7 倍音や 1-2-3 のような避けたい組合せは false） */
  preferred: boolean;
}

const VALVE_COMBOS_4 = [[], [2], [1], [1, 2], [2, 3], [1, 3], [1, 2, 3], [4], [2, 4], [1, 4], [1, 2, 4], [2, 3, 4], [1, 3, 4], [1, 2, 3, 4]];
const VALVE_COMBOS_3 = [[], [2], [1], [1, 2], [2, 3], [1, 3], [1, 2, 3]];

/** ある音を出せる運指と倍音の組合せを列挙する。 */
export function fingeringsFor(model: TubaModel, midi: number): Fingering[] {
  const combos = model.valves === 4 ? VALVE_COMBOS_4 : VALVE_COMBOS_3;
  const out: Fingering[] = [];
  for (let partial = 1; partial <= 10; partial++) {
    const open = partialMidi(model, partial);
    for (const valves of combos) {
      if (open - valveSemitones(valves) === midi) {
        const avoidPartial = partial === 7 || partial === 9 || partial === 10;
        const avoidCombo = valves.length >= 3 && !(valves.length === 3 && valves.includes(4));
        const preferred = !avoidPartial && !avoidCombo && !(partial === 1 && valves.length >= 3);
        out.push({ valves, partial, preferred });
      }
    }
  }
  // 代表的な運指を先に、バルブ数が少ない順に並べる
  return out.sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.valves.length - b.valves.length);
}

export function fingeringLabel(f: Fingering): string {
  return f.valves.length === 0 ? "0" : f.valves.join("-");
}

/**
 * 同じ運指で隣り合う倍音の音（外したときに落ちやすい音）。
 * below/above は目標音の 1 つ下・上の倍音。
 */
export function neighborPartials(model: TubaModel, f: Fingering): { below: number | null; above: number | null } {
  const shift = valveSemitones(f.valves);
  const below = f.partial > 1 ? partialMidi(model, f.partial - 1) - shift : null;
  const above = f.partial < 10 ? partialMidi(model, f.partial + 1) - shift : null;
  return { below, above };
}

/** 同じ運指で出せる倍音列（リップスラー用）。 */
export function harmonicSeries(model: TubaModel, valves: number[], partials: number[]): number[] {
  const shift = valveSemitones(valves);
  return partials.map((p) => partialMidi(model, p) - shift);
}

/** 練習に使う音の一覧（実用音域の全半音）。 */
export function practiceNotes(model: TubaModel): { midi: number; name: string }[] {
  const out: { midi: number; name: string }[] = [];
  for (let m = model.range.low; m <= model.range.high; m++) out.push({ midi: m, name: noteName(m) });
  return out;
}
