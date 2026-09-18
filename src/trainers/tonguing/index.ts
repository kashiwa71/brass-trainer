/**
 * タンギング・トレーナー（テンポの階段）:
 * 1 拍に決まった数の音をタンギングし、音数と均等さで合否を判定してテンポを上下させる。
 */
import type { TrainerModule, TrainerContext, TrainerInstance } from "../../core/trainer";
import type { HistoryEntry } from "../../core/history";
import { noteName } from "../../core/notes";
import { OnsetDetector } from "../../core/analysis/onset";
import { el, replaceChildren, fmtMs } from "../../ui/dom";
import { noteCard, table } from "../../ui/components";
import { Runner } from "../shared";
import { evaluateTonguing, nextTempo } from "./evaluate";

interface Settings {
  target: number;
  perBeat: string;
  beats: number;
  startBpm: number;
  step: number;
  maxBpm: number;
}

export interface TonguingRecord {
  targetMidi: number;
  perBeat: number;
  beats: number;
  bpm: number;
  count: number;
  expectedCount: number;
  cv: number | null;
  meanAbsErrSec: number | null;
  pass: boolean;
}

const COUNT_IN = 4;

class TonguingTrainer implements TrainerInstance {
  private runner: Runner | null = null;
  private stage!: HTMLElement;
  private result!: HTMLElement;
  private stats!: HTMLElement;
  private bpm = 60;
  private best = 0;

  constructor(private readonly ctx: TrainerContext) {}

  private get s(): Settings {
    return this.ctx.settings as unknown as Settings;
  }

  mount(): void {
    this.stage = el("div", { class: "stage" });
    this.result = el("div", { class: "result" });
    this.stats = el("div", { class: "stats" });
    replaceChildren(this.ctx.root, this.stage, this.result, el("h3", {}, "この練習の成績"), this.stats);
    this.bpm = this.s.startBpm;
    this.showStage();
    this.renderStats();
  }

  private showStage(): void {
    const perBeat = Number(this.s.perBeat);
    const label = { 1: "4 分音符", 2: "8 分音符", 3: "3 連符", 4: "16 分音符" }[perBeat] ?? `${perBeat} 連`;
    replaceChildren(
      this.stage,
      noteCard(this.ctx.tuba, this.s.target),
      el("div", { class: "tempo-big" }, `♩= ${this.bpm}`),
      el("div", { class: "note-sub" }, `${label} × ${this.s.beats} 拍（${perBeat * this.s.beats} 音）`),
    );
  }

  async start(): Promise<void> {
    this.runner = new Runner();
    const r = this.runner;
    const { audio, metronome } = this.ctx;
    const perBeat = Number(this.s.perBeat);
    const beats = this.s.beats;

    while (!r.isAborted) {
      this.showStage();
      const beatSec = 60 / this.bpm;
      this.ctx.setStatus(`カウント ${COUNT_IN} 拍のあと、${beats} 拍タンギング（♩= ${this.bpm}）`);
      const first = metronome.start(this.bpm, beats);
      const repStart = first + COUNT_IN * beatSec;
      const repEnd = repStart + beats * beatSec;
      const offBeat = metronome.onBeat((b) => {
        const k = b.index - COUNT_IN;
        const delay = Math.max(0, (b.time - audio.currentTime) * 1000);
        setTimeout(() => {
          if (k < 0) this.ctx.setStatus(`カウント ${COUNT_IN + k + 1}`);
          else if (k < beats) this.ctx.setStatus(`${k + 1} 拍目`);
        }, delay);
      });
      const frames = await r.collectUntil(audio, repEnd + 0.2, repStart - 0.3);
      offBeat();
      metronome.stop();
      if (r.isAborted) break;

      const det = new OnsetDetector({ gateDb: audio.gateDb, jumpDb: 5, jumpWindowSec: Math.min(0.04, beatSec / perBeat / 3), minIntervalSec: Math.min(0.06, beatSec / perBeat / 2) });
      const onsets: number[] = [];
      for (const f of frames) if (det.push(f)) onsets.push(f.t);
      const ev = evaluateTonguing(onsets, repStart, { beatSec, beats, perBeat });
      const rec: TonguingRecord = {
        targetMidi: this.s.target,
        perBeat,
        beats,
        bpm: this.bpm,
        count: ev.count,
        expectedCount: ev.expectedCount,
        cv: ev.cv,
        meanAbsErrSec: ev.meanAbsErrSec,
        pass: ev.pass,
      };
      this.ctx.history.add("tonguing", rec);
      if (ev.pass) this.best = Math.max(this.best, this.bpm);
      this.showResult(rec, ev.reasons);
      this.renderStats();
      this.bpm = nextTempo(this.bpm, ev.pass, this.s.step, 30, this.s.maxBpm);
      if (!(await r.sleep(1500))) break;
    }
    metronome.stop();
    this.ctx.setStatus("停止しました");
  }

  stop(): void {
    this.runner?.abort();
    this.runner = null;
    this.ctx.metronome.stop();
  }

  dispose(): void {
    this.stop();
  }

  private showResult(rec: TonguingRecord, reasons: string[]): void {
    replaceChildren(
      this.result,
      el("div", { class: `verdict ${rec.pass ? "ok" : "ng"}` }, rec.pass ? `合格 → 次は ♩= ${nextTempo(rec.bpm, true, this.s.step, 30, this.s.maxBpm)}` : "不合格"),
      el(
        "ul",
        { class: "detail-list" },
        el("li", {}, `音数: ${rec.count} / ${rec.expectedCount}`),
        el("li", {}, `間隔のばらつき（変動係数）: ${rec.cv === null ? "–" : rec.cv.toFixed(2)}`),
        el("li", {}, `拍からの平均ずれ: ${rec.meanAbsErrSec === null ? "–" : fmtMs(rec.meanAbsErrSec)}`),
        ...reasons.map((x) => el("li", { class: "ng-text" }, x)),
      ),
    );
  }

  private renderStats(): void {
    replaceChildren(this.stats, renderSummaryTable(this.ctx.history.list<TonguingRecord>("tonguing").map((e) => e.data)));
  }
}

function renderSummaryTable(recs: TonguingRecord[]): HTMLElement {
  if (recs.length === 0) return el("p", { class: "muted" }, "まだ記録がありません。");
  const byKey = new Map<string, TonguingRecord[]>();
  for (const r of recs) {
    const k = `${r.perBeat}|${r.targetMidi}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(r);
  }
  const rows = [...byKey.entries()].map(([k, rs]) => {
    const [perBeat, midi] = k.split("|").map(Number);
    const label = { 1: "4 分", 2: "8 分", 3: "3 連", 4: "16 分" }[perBeat] ?? `${perBeat} 連`;
    const passed = rs.filter((r) => r.pass);
    const best = passed.length ? Math.max(...passed.map((r) => r.bpm)) : null;
    const recent = rs.slice(-10).filter((r) => r.pass);
    const recentBest = recent.length ? Math.max(...recent.map((r) => r.bpm)) : null;
    return [label, noteName(midi), `${rs.length} 回`, best === null ? "–" : `♩= ${best}`, recentBest === null ? "–" : `♩= ${recentBest}`];
  });
  return table(["音符", "音", "回数", "合格した最高テンポ", "直近 10 回の最高"], rows);
}

export const tonguingTrainer: TrainerModule = {
  id: "tonguing",
  title: "タンギング（テンポの階段）",
  summary: "決まった数の音を均等にタンギングできたらテンポが上がる",
  description:
    "カウント 4 拍のあと、指定した拍数だけ同じ音をタンギングします。発音の数と間隔の均等さ、拍からのずれで合否を決め、合格ならテンポを上げ、不合格なら少し下げます。合格した最高テンポが記録されるので、速いパッセージに向けた到達点が見えます。",
  order: 40,
  settingsSchema: [
    { key: "target", label: "音", type: "note" },
    {
      key: "perBeat",
      label: "1 拍の音数",
      type: "select",
      options: [
        { value: "1", label: "4 分音符（1）" },
        { value: "2", label: "8 分音符（2）" },
        { value: "3", label: "3 連符（3）" },
        { value: "4", label: "16 分音符（4）" },
      ],
    },
    { key: "beats", label: "拍数", type: "number", min: 1, max: 8, unit: "拍" },
    { key: "startBpm", label: "開始テンポ", type: "number", min: 30, max: 200, unit: "♩=" },
    { key: "step", label: "合格時の上げ幅", type: "number", min: 1, max: 20, unit: "bpm" },
    { key: "maxBpm", label: "上限テンポ", type: "number", min: 60, max: 240, unit: "♩=" },
  ],
  defaultSettings: { target: 46, perBeat: "4", beats: 4, startBpm: 60, step: 4, maxBpm: 200 },
  create: (ctx) => new TonguingTrainer(ctx),
  renderSummary: (entries: HistoryEntry[]) => renderSummaryTable(entries.map((e) => e.data as TonguingRecord)),
};
