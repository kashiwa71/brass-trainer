export interface Beat {
  /** 拍の予定時刻（AudioContext 時刻） */
  time: number;
  /** 0 始まりの拍番号（開始からの通し番号） */
  index: number;
  /** 小節内の拍位置（0 が 1 拍目） */
  beatInBar: number;
}

export type BeatListener = (beat: Beat) => void;

/**
 * 先読みスケジューリング方式のメトロノーム。
 * クリック音は AudioContext の時計で正確に鳴らし、拍の予定時刻を購読者に通知する。
 */
export class Metronome {
  private timer: number | null = null;
  private nextBeatTime = 0;
  private beatIndex = 0;
  private listeners = new Set<BeatListener>();
  private _bpm = 60;
  private _beatsPerBar = 4;
  private gainValue = 0.5;

  constructor(private readonly ctx: AudioContext) {}

  get bpm(): number {
    return this._bpm;
  }
  set bpm(v: number) {
    this._bpm = Math.max(20, Math.min(300, v));
  }
  get beatsPerBar(): number {
    return this._beatsPerBar;
  }
  get isRunning(): boolean {
    return this.timer !== null;
  }

  onBeat(l: BeatListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** startAt を省略すると少し先の時刻から開始する。 */
  start(bpm: number, beatsPerBar = 4, startAt?: number): number {
    this.stop();
    this._bpm = bpm;
    this._beatsPerBar = beatsPerBar;
    this.beatIndex = 0;
    this.nextBeatTime = startAt ?? this.ctx.currentTime + 0.2;
    const first = this.nextBeatTime;
    const tick = () => {
      const horizon = this.ctx.currentTime + 0.15;
      while (this.nextBeatTime < horizon) {
        const beat: Beat = { time: this.nextBeatTime, index: this.beatIndex, beatInBar: this.beatIndex % this._beatsPerBar };
        this.click(beat);
        for (const l of this.listeners) l(beat);
        this.nextBeatTime += 60 / this._bpm;
        this.beatIndex++;
      }
    };
    tick();
    this.timer = window.setInterval(tick, 25);
    return first;
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private click(beat: Beat): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = beat.beatInBar === 0 ? 1600 : 1000;
    g.gain.setValueAtTime(this.gainValue, beat.time);
    g.gain.exponentialRampToValueAtTime(0.001, beat.time + 0.04);
    osc.connect(g).connect(ctx.destination);
    osc.start(beat.time);
    osc.stop(beat.time + 0.05);
  }
}
