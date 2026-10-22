/**
 * 表示用にピッチをならす（判定には使わない）。フレームは約 10 ms ごとに来るので、そのまま針や音名に出すと
 * 細かな揺れや一瞬の誤検出で表示が震える。
 * - 小さな揺れは指数移動平均でならす（時定数 tauSec）
 * - jumpSemitones を超える跳びは、confirmSec 続いたときだけ受け入れる。一瞬の引っかかりでは動かさない
 * - 音が途切れても gapSec の間は最後の値を保つ（タンギングの切れ目で表示が消えないように）
 */
export interface SmoothingOptions {
  tauSec?: number;
  jumpSemitones?: number;
  confirmSec?: number;
  gapSec?: number;
}

export class PitchSmoother {
  private value: number | null = null;
  private lastT = 0;
  private lastHeardT = -Infinity;
  /** 跳んだ先の候補（受け入れ待ち） */
  private jump: { since: number; values: number[] } | null = null;
  private readonly opts: Required<SmoothingOptions>;

  constructor(opts: SmoothingOptions = {}) {
    this.opts = { tauSec: opts.tauSec ?? 0.12, jumpSemitones: opts.jumpSemitones ?? 0.75, confirmSec: opts.confirmSec ?? 0.06, gapSec: opts.gapSec ?? 0.3 };
  }

  get current(): number | null {
    return this.value;
  }

  reset(): void {
    this.value = null;
    this.jump = null;
    this.lastHeardT = -Infinity;
  }

  /** t は秒、midiF は MIDI の小数（無音や不明瞭なら null）。ならした値を返す。 */
  push(t: number, midiF: number | null): number | null {
    const { tauSec, jumpSemitones, confirmSec, gapSec } = this.opts;
    if (midiF === null) {
      if (t - this.lastHeardT > gapSec) this.reset();
      return this.value;
    }
    this.lastHeardT = t;
    if (this.value === null) {
      this.value = midiF;
      this.lastT = t;
      return this.value;
    }
    if (Math.abs(midiF - this.value) > jumpSemitones) {
      if (!this.jump || Math.abs(midiF - median(this.jump.values)) > jumpSemitones) this.jump = { since: t, values: [] };
      this.jump.values.push(midiF);
      if (t - this.jump.since >= confirmSec - 1e-6) {
        this.value = median(this.jump.values);
        this.jump = null;
      }
      this.lastT = t;
      return this.value;
    }
    this.jump = null;
    const alpha = 1 - Math.exp(-Math.max(0, t - this.lastT) / tauSec);
    this.value += alpha * (midiF - this.value);
    this.lastT = t;
    return this.value;
  }
}

/**
 * 表示する音名を決める。境目（±50 ¢）付近で音名が行き来しないよう、
 * いまの音名から marginCents 余分に離れるまで切り替えない。
 */
export class NoteNameHold {
  private shown: number | null = null;

  constructor(private readonly marginCents = 15) {}

  /** 表示する MIDI 番号と、それからのずれ（セント）を返す */
  push(midiF: number | null): { midi: number; cents: number } | null {
    if (midiF === null) {
      this.shown = null;
      return null;
    }
    if (this.shown === null || Math.abs(midiF - this.shown) > 0.5 + this.marginCents / 100) this.shown = Math.round(midiF);
    return { midi: this.shown, cents: (midiF - this.shown) * 100 };
  }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
