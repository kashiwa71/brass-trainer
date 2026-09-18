import type { Frame } from "../analysis/frames";

export type FrameListener = (frame: Frame) => void;

/**
 * マイク入力から解析フレームを配る音声エンジン。
 * AudioContext を 1 つ持ち、基準音やメトロノームも同じ時計で動かす。
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private worklet: AudioWorkletNode | null = null;
  private worker: Worker | null = null;
  private listeners = new Set<FrameListener>();
  private _noiseFloorDb = -60;
  private lastFrame: Frame | null = null;

  get context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: "interactive" });
    return this.ctx;
  }

  get isRunning(): boolean {
    return this.worklet !== null;
  }

  get noiseFloorDb(): number {
    return this._noiseFloorDb;
  }

  get latest(): Frame | null {
    return this.lastFrame;
  }

  get currentTime(): number {
    return this.context.currentTime;
  }

  /** マイクを開き解析を始める。ユーザー操作（ボタン押下）から呼ぶこと。 */
  async start(): Promise<void> {
    if (this.worklet) return;
    const ctx = this.context;
    if (ctx.state !== "running") await ctx.resume();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}capture-worklet.js`);
    const src = ctx.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(ctx, "capture-processor", { numberOfOutputs: 0 });
    src.connect(this.worklet);

    this.worker = new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
    this.worker.postMessage({ type: "init", sampleRate: ctx.sampleRate, minHz: 36, maxHz: 600 });
    this.worker.onmessage = (ev: MessageEvent<Frame>) => {
      this.lastFrame = ev.data;
      for (const l of this.listeners) l(ev.data);
    };
    this.worklet.port.onmessage = (ev: MessageEvent<{ t: number; samples: Float32Array }>) => {
      this.worker?.postMessage({ type: "chunk", t: ev.data.t, samples: ev.data.samples }, [ev.data.samples.buffer]);
    };
  }

  stop(): void {
    this.worklet?.disconnect();
    this.worklet = null;
    this.worker?.terminate();
    this.worker = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  onFrame(listener: FrameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 指定秒数の音量を測り、暗騒音レベルとして記録する。 */
  calibrate(seconds = 1): Promise<number> {
    return new Promise((resolve) => {
      const dbs: number[] = [];
      const off = this.onFrame((f) => dbs.push(f.db));
      setTimeout(() => {
        off();
        if (dbs.length) {
          const sorted = [...dbs].sort((a, b) => a - b);
          // 上位を除いた中央値で安定させる
          this._noiseFloorDb = sorted[Math.floor(sorted.length / 2)];
        }
        resolve(this._noiseFloorDb);
      }, seconds * 1000);
    });
  }

  /** 発音判定に使う音量閾値。暗騒音より十分に大きい値にする。 */
  get gateDb(): number {
    return Math.max(this._noiseFloorDb + 12, -55);
  }

  /** 開始時刻以降のフレームをまとめて集める（stop() で終了）。 */
  record(): { frames: Frame[]; stop: () => Frame[] } {
    const frames: Frame[] = [];
    const off = this.onFrame((f) => frames.push(f));
    return {
      frames,
      stop: () => {
        off();
        return frames;
      },
    };
  }
}
