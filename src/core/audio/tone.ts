import { midiToHz } from "../notes";

/** 基準音（チューバ風の倍音を含む合成音）を鳴らす。ドローン（鳴らしっぱなし）にも対応。 */
export class ToneGenerator {
  private drone: { stop: () => void } | null = null;

  constructor(private readonly ctx: AudioContext) {}

  /** ドローンを鳴らし始める。既に鳴っていれば止めてから鳴らす。 */
  startDrone(midi: number, a4Hz: number, gain = 0.18): void {
    this.stopDrone();
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const hz = midiToHz(midi, a4Hz);
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(gain, now + 0.3);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.min(4000, hz * 10);
    master.connect(lp).connect(ctx.destination);
    const oscs: OscillatorNode[] = [];
    [1, 0.5, 0.35, 0.2, 0.1].forEach((amp, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz * (i + 1);
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g).connect(master);
      osc.start(now);
      oscs.push(osc);
    });
    this.drone = {
      stop: () => {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(0, t + 0.15);
        oscs.forEach((o) => o.stop(t + 0.2));
      },
    };
  }

  stopDrone(): void {
    this.drone?.stop();
    this.drone = null;
  }

  get isDroning(): boolean {
    return this.drone !== null;
  }

  play(midi: number, durationSec: number, a4Hz: number, gain = 0.25): Promise<void> {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const hz = midiToHz(midi, a4Hz);
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(gain, now + 0.03);
    master.gain.setValueAtTime(gain, now + durationSec - 0.08);
    master.gain.linearRampToValueAtTime(0, now + durationSec);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.min(4000, hz * 12);
    master.connect(lp).connect(ctx.destination);
    const harmonics = [1, 0.6, 0.45, 0.3, 0.2, 0.12];
    const oscs: OscillatorNode[] = [];
    harmonics.forEach((amp, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz * (i + 1);
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g).connect(master);
      osc.start(now);
      osc.stop(now + durationSec + 0.05);
      oscs.push(osc);
    });
    return new Promise((resolve) => {
      oscs[0].onended = () => resolve();
    });
  }
}
