/**
 * 音名・周波数の基本ユーティリティ。
 * MIDI ノート番号（A4 = 69 = 440 Hz）を内部表現にする。
 * 表示はドイツ音名（吹奏楽で一般的。B = シ♭、H = シ）を既定にする。
 */

export const A4_MIDI = 69;

/** 基準ピッチ（Hz）。吹奏楽では 442 Hz が多いため既定値にする。 */
export const DEFAULT_A4_HZ = 442;

const GERMAN_SHARP = ["C", "Cis", "D", "Dis", "E", "F", "Fis", "G", "Gis", "A", "B", "H"];
const GERMAN_FLAT = ["C", "Des", "D", "Es", "E", "F", "Ges", "G", "As", "A", "B", "H"];
const ENGLISH_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const ENGLISH_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export type NamingStyle = "german" | "english";

export function midiToHz(midi: number, a4Hz = DEFAULT_A4_HZ): number {
  return a4Hz * Math.pow(2, (midi - A4_MIDI) / 12);
}

export function hzToMidiFloat(hz: number, a4Hz = DEFAULT_A4_HZ): number {
  return A4_MIDI + 12 * Math.log2(hz / a4Hz);
}

/** 周波数を最寄りの MIDI 番号とセント偏差に分解する。 */
export function hzToNote(hz: number, a4Hz = DEFAULT_A4_HZ): { midi: number; cents: number } {
  const f = hzToMidiFloat(hz, a4Hz);
  const midi = Math.round(f);
  return { midi, cents: (f - midi) * 100 };
}

/** 2 つの周波数の差をセントで返す。 */
export function centsBetween(hzFrom: number, hzTo: number): number {
  return 1200 * Math.log2(hzTo / hzFrom);
}

/** 科学的ピッチ表記のオクターブ番号（C4 = 中央ハ = MIDI 60）。 */
export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

export function pitchClassOf(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/**
 * 音名文字列。既定はドイツ音名 + 科学的オクターブ番号（例: H2, B3, F3）。
 * preferFlat=true で異名同音をフラット系で表記する（Es, As など）。
 */
export function noteName(
  midi: number,
  opts: { style?: NamingStyle; preferFlat?: boolean; octave?: boolean } = {},
): string {
  const { style = "german", preferFlat = true, octave = true } = opts;
  const table =
    style === "german" ? (preferFlat ? GERMAN_FLAT : GERMAN_SHARP) : preferFlat ? ENGLISH_FLAT : ENGLISH_SHARP;
  const name = table[pitchClassOf(midi)];
  return octave ? `${name}${octaveOf(midi)}` : name;
}

/** "H2" や "Bb3" のような文字列を MIDI 番号に変換する。失敗時は null。 */
export function parseNoteName(text: string): number | null {
  const m = /^([A-Ha-h])(is|es|s|#|b|♭|♯)?(-?\d)$/.exec(text.trim());
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = m[2] ?? "";
  const oct = parseInt(m[3], 10);
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, H: 11, B: 10 };
  let pc = base[letter];
  if (pc === undefined) return null;
  if (acc === "is" || acc === "#" || acc === "♯") pc += 1;
  else if (acc === "es" || acc === "s" || acc === "b" || acc === "♭") {
    // ドイツ音名の B は既に ♭ を含む。英語式 "Bb" は B(10) のまま。
    if (letter !== "B") pc -= 1;
  }
  return (oct + 1) * 12 + pc;
}

export function clampCents(c: number, limit = 50): number {
  return Math.max(-limit, Math.min(limit, c));
}
