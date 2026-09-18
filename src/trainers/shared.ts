/** トレーナー実装で共通に使う小さな道具 */
import type { AudioEngine } from "../core/audio/engine";
import type { Frame } from "../core/analysis/frames";
import { OnsetDetector } from "../core/analysis/onset";
import { hzToNote } from "../core/notes";
import { evaluateSing, pitchClassCents, type SingMatch } from "./ear-training/evaluate";

/** 停止ボタンで途中終了できる非同期ループの補助 */
export class Runner {
  private aborted = false;
  private abortResolvers: (() => void)[] = [];

  get isAborted(): boolean {
    return this.aborted;
  }

  abort(): void {
    this.aborted = true;
    for (const r of this.abortResolvers) r();
    this.abortResolvers = [];
  }

  /** 中断されたときに呼ぶ処理を登録する（既に中断済みなら即座に呼ぶ） */
  onAbort(fn: () => void): void {
    if (this.aborted) fn();
    else this.abortResolvers.push(fn);
  }

  private abortPromise(): Promise<"aborted"> {
    return new Promise((resolve) => {
      if (this.aborted) resolve("aborted");
      else this.abortResolvers.push(() => resolve("aborted"));
    });
  }

  /** ms 待つ。中断されたら false を返す。 */
  async sleep(ms: number): Promise<boolean> {
    const r = await Promise.race([new Promise<"done">((res) => setTimeout(() => res("done"), ms)), this.abortPromise()]);
    return r === "done";
  }

  /** 次の発音を待ち、その時刻を返す。中断・時間切れは null。 */
  async waitForOnset(audio: AudioEngine, opts: { timeoutMs: number; jumpDb?: number }): Promise<number | null> {
    const det = new OnsetDetector({ gateDb: audio.gateDb, jumpDb: opts.jumpDb ?? 8 });
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: number | null) => {
        if (done) return;
        done = true;
        off();
        clearTimeout(timer);
        resolve(v);
      };
      const off = audio.onFrame((f) => {
        if (det.push(f)) finish(f.t);
      });
      const timer = setTimeout(() => finish(null), opts.timeoutMs);
      this.abortPromise().then(() => finish(null));
    });
  }

  /** 指定した AudioContext 時刻までのフレームを集める（開始時刻より前に届いたものも含める）。 */
  async collectUntil(audio: AudioEngine, untilT: number, fromT: number): Promise<Frame[]> {
    const frames: Frame[] = [];
    if (audio.latest && audio.latest.t >= fromT) frames.push(audio.latest);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        off();
        resolve(frames.filter((f) => f.t >= fromT));
      };
      const off = audio.onFrame((f) => {
        frames.push(f);
        if (f.t >= untilT) finish();
      });
      this.abortPromise().then(finish);
      // フレームが来なくても止まらないように保険をかける
      setTimeout(finish, Math.max(0, (untilT - audio.currentTime) * 1000) + 500);
    });
  }
}

/** 有効なフレーム（音が鳴っていてピッチが取れている）だけを返す。 */
export function validFrames(frames: Frame[], gateDb: number, minClarity = 0.5): Frame[] {
  return frames.filter((f) => f.hz !== null && f.db > gateDb && f.clarity >= minClarity);
}

/** 最頻の MIDI 番号と、その音のセント偏差の中央値 */
export function dominantNote(frames: Frame[], a4Hz: number): { midi: number; cents: number } | null {
  if (frames.length === 0) return null;
  const counts = new Map<number, number[]>();
  for (const f of frames) {
    const { midi, cents } = hzToNote(f.hz as number, a4Hz);
    if (!counts.has(midi)) counts.set(midi, []);
    counts.get(midi)!.push(cents);
  }
  let best: number | null = null;
  for (const [midi, cs] of counts) if (best === null || cs.length > counts.get(best)!.length) best = midi;
  if (best === null) return null;
  const cs = [...counts.get(best)!].sort((a, b) => a - b);
  return { midi: best, cents: cs[Math.floor(cs.length / 2)] };
}

export function midiFloat(hz: number, a4Hz: number): number {
  const { midi, cents } = hzToNote(hz, a4Hz);
  return midi + cents / 100;
}

export interface SingGateOptions {
  targetMidi: number;
  a4Hz: number;
  timeoutMs: number;
  tolCents?: number;
  holdSec?: number;
  /** 表示更新用（目標からのずれ、無音なら null） */
  onCents?: (cents: number | null) => void;
}

/**
 * 声（またはマウスピース）で目標の音名を保てるまで待つ。
 * 合えば matched=true、時間切れや中断なら matched=false で最後のずれを返す。
 */
export function singGate(runner: Runner, audio: AudioEngine, opts: SingGateOptions): Promise<SingMatch> {
  const tol = opts.tolCents ?? 40;
  const hold = opts.holdSec ?? 0.6;
  const frames: Frame[] = [];
  const startT = audio.currentTime;
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: SingMatch) => {
      if (done) return;
      done = true;
      off();
      clearTimeout(timer);
      resolve(r);
    };
    const off = audio.onFrame((f) => {
      frames.push(f);
      const valid = f.hz !== null && f.db > audio.gateDb && f.clarity >= 0.5;
      opts.onCents?.(valid ? pitchClassCents(midiFloat(f.hz as number, opts.a4Hz), opts.targetMidi) : null);
      // 直近 2 秒だけ評価する（古い迷いは無視）
      while (frames.length > 0 && frames[0].t < f.t - 2) frames.shift();
      const r = evaluateSing(frames, startT, opts.targetMidi, opts.a4Hz, audio.gateDb, { tolCents: tol, holdSec: hold });
      if (r.matched) finish({ ...r, timeToMatchSec: f.t - startT });
    });
    const timer = setTimeout(() => {
      const r = evaluateSing(frames, startT, opts.targetMidi, opts.a4Hz, audio.gateDb, { tolCents: tol, holdSec: hold });
      finish({ ...r, matched: false });
    }, opts.timeoutMs);
    runner.onAbort(() => finish({ matched: false, timeToMatchSec: null, cents: null, lastMidi: null }));
  });
}
