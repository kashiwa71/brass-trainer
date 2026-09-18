/**
 * リップスラー・トレーナー: 同じ運指で倍音を移動する練習。
 * メトロノームに合わせて 1 拍 1 音で吹き、途中の倍音への引っかかりや届かなかった音を判定する。
 * 連続で成功するとテンポを自動で上げる。
 */
import type { TrainerModule, TrainerContext, TrainerInstance } from "../../core/trainer";
import type { HistoryEntry } from "../../core/history";
import { noteName } from "../../core/notes";
import { harmonicSeries, fingeringLabel } from "../../core/tuba";
import { el, replaceChildren, fmtMs, fmtPct } from "../../ui/dom";
import { table } from "../../ui/components";
import { adviceCard, coachingBlock } from "../../ui/advice";
import { dailyAdvice, type Trigger } from "../../content/advice";
import { Runner } from "../shared";
import { evaluateSlur, SLUR_PATTERNS } from "./evaluate";

interface Settings {
  pattern: string;
  valves: string;
  bpm: number;
  autoRamp: boolean;
  rampStep: number;
  rampAfter: number;
}

export interface LipSlurRecord {
  pattern: string;
  valves: string;
  bpm: number;
  expected: number[];
  played: number[];
  correct: boolean;
  extra: number[];
  missing: number[];
  maxGapSec: number;
}

const COUNT_IN = 4;

function parseValves(s: string): number[] {
  return s === "0" ? [] : s.split("-").map(Number);
}

class LipSlurTrainer implements TrainerInstance {
  private runner: Runner | null = null;
  private stage!: HTMLElement;
  private result!: HTMLElement;
  private stats!: HTMLElement;
  private bpm = 60;
  private streak = 0;

  constructor(private readonly ctx: TrainerContext) {}

  private get s(): Settings {
    return this.ctx.settings as unknown as Settings;
  }

  private expected(): number[] {
    const pat = SLUR_PATTERNS.find((p) => p.id === this.s.pattern) ?? SLUR_PATTERNS[0];
    return harmonicSeries(this.ctx.tuba, parseValves(this.s.valves), pat.partials);
  }

  mount(): void {
    this.stage = el("div", { class: "stage" });
    this.result = el("div", { class: "result" });
    this.stats = el("div", { class: "stats" });
    replaceChildren(this.ctx.root, adviceCard(dailyAdvice("lip-slur"), { compact: true, label: "今日のポイント" }), this.stage, this.result, el("h3", {}, "この練習の成績"), this.stats);
    this.showSequence();
    this.renderStats();
  }

  private showSequence(): void {
    const seq = this.expected();
    replaceChildren(
      this.stage,
      el("div", { class: "seq" }, ...seq.map((m) => el("span", { class: "seq-note" }, noteName(m)))),
      el("div", { class: "note-sub" }, `運指 ${fingeringLabel({ valves: parseValves(this.s.valves), partial: 0, preferred: true })} ・ 1 拍 1 音 ・ ♩= ${this.bpm}`),
    );
  }

  async start(): Promise<void> {
    this.runner = new Runner();
    const r = this.runner;
    const { audio, metronome, app } = this.ctx;
    this.bpm = this.s.bpm;
    this.streak = 0;
    const expected = this.expected();
    const len = expected.length;

    while (!r.isAborted) {
      this.showSequence();
      const beatSec = 60 / this.bpm;
      this.ctx.setStatus(`カウント ${COUNT_IN} 拍のあと、1 拍 1 音でスラー（♩= ${this.bpm}）。舌は突かず「オ」のまま息の速さで`);
      const first = metronome.start(this.bpm, len);
      const repStart = first + COUNT_IN * beatSec;
      const repEnd = repStart + len * beatSec;
      // 表示: 拍に合わせて音を光らせる
      const offBeat = metronome.onBeat((b) => {
        const k = b.index - COUNT_IN;
        const notes = this.stage.querySelectorAll<HTMLElement>(".seq-note");
        const delay = Math.max(0, (b.time - audio.currentTime) * 1000);
        setTimeout(() => {
          notes.forEach((n, i) => n.classList.toggle("active", i === k));
          if (k < 0) this.ctx.setStatus(`カウント ${COUNT_IN + k + 1}`);
        }, delay);
      });
      const frames = await r.collectUntil(audio, repEnd + 0.25, repStart - 0.15);
      offBeat();
      metronome.stop();
      if (r.isAborted) break;

      const ev = evaluateSlur(frames, expected, app.a4Hz, audio.gateDb);
      const rec: LipSlurRecord = {
        pattern: this.s.pattern,
        valves: this.s.valves,
        bpm: this.bpm,
        expected,
        played: ev.played,
        correct: ev.correct,
        extra: ev.extra,
        missing: ev.missing,
        maxGapSec: ev.maxGapSec,
      };
      this.ctx.history.add("lip-slur", rec);
      this.showResult(rec);
      this.renderStats();

      if (ev.correct) this.streak++;
      else this.streak = 0;
      if (this.s.autoRamp && this.streak >= this.s.rampAfter) {
        this.bpm = Math.min(200, this.bpm + this.s.rampStep);
        this.streak = 0;
        this.ctx.setStatus(`テンポを上げます: ♩= ${this.bpm}`);
      }
      if (!(await r.sleep(ev.correct ? 1500 : 4000))) break;
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

  private showResult(rec: LipSlurRecord): void {
    const played = el("div", { class: "seq small" }, ...rec.played.map((m) => el("span", { class: `seq-note ${rec.extra.includes(m) ? "extra" : ""}` }, noteName(m))));
    const notes: string[] = [];
    if (rec.extra.length) notes.push(`途中で ${rec.extra.map((m) => noteName(m)).join(", ")} に引っかかりました`);
    if (rec.missing.length) notes.push(`${rec.missing.map((m) => noteName(m)).join(", ")} に届きませんでした`);
    if (rec.maxGapSec > 0.12) notes.push(`移り変わりでピッチが不明瞭な時間: 最大 ${fmtMs(rec.maxGapSec)}`);
    const triggers: Trigger[] = [];
    if (rec.extra.length) triggers.push("slur-extra");
    if (rec.missing.length) triggers.push("slur-missing");
    if (rec.maxGapSec > 0.12) triggers.push("slur-gap");
    replaceChildren(
      this.result,
      el("div", { class: `verdict ${rec.correct ? "ok" : "ng"}` }, rec.correct ? "成功" : "やり直し"),
      el("div", { class: "muted" }, "実際の並び:"),
      played,
      notes.length ? el("ul", { class: "detail-list" }, ...notes.map((n) => el("li", {}, n))) : null,
      rec.correct ? null : coachingBlock(triggers.length ? triggers : ["slur-gap"], "lip-slur"),
    );
  }

  private renderStats(): void {
    replaceChildren(this.stats, renderSummaryTable(this.ctx.history.list<LipSlurRecord>("lip-slur").map((e) => e.data)));
  }
}

function renderSummaryTable(recs: LipSlurRecord[]): HTMLElement {
  if (recs.length === 0) return el("p", { class: "muted" }, "まだ記録がありません。");
  const byKey = new Map<string, LipSlurRecord[]>();
  for (const r of recs) {
    const k = `${r.pattern}|${r.valves}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(r);
  }
  const rows = [...byKey.entries()].map(([k, rs]) => {
    const [pattern, valves] = k.split("|");
    const label = SLUR_PATTERNS.find((p) => p.id === pattern)?.label ?? pattern;
    const rate = rs.filter((r) => r.correct).length / rs.length;
    const maxBpm = Math.max(...rs.filter((r) => r.correct).map((r) => r.bpm), 0);
    const extraCount = new Map<number, number>();
    for (const r of rs) for (const m of r.extra) extraCount.set(m, (extraCount.get(m) ?? 0) + 1);
    const top = [...extraCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([m, n]) => `${noteName(m)}×${n}`).join(" ");
    return [label, valves, `${fmtPct(rate)}（${rs.length} 回）`, maxBpm ? `♩= ${maxBpm}` : "–", top || "–"];
  });
  return table(["パターン", "運指", "成功率", "成功した最高テンポ", "引っかかる音"], rows);
}

export const lipSlurTrainer: TrainerModule = {
  id: "lip-slur",
  title: "リップスラー",
  summary: "同じ運指で倍音を移動。オクターブ跳躍の引っかかりを判定",
  description:
    "メトロノームのカウント 4 拍のあと、表示された音を 1 拍 1 音でスラーします。ピッチの移り変わりを追跡し、途中の倍音に引っかかったか、届かなかったか、移行中にピッチが不明瞭だった時間を判定します。失敗の種類に応じて、プロのアドバイス（「オ」の形を保つ、上行はクレシェンド、大きな跳躍は半音階で埋める、など）を表示します。連続で成功すると自動でテンポが上がります。オクターブが苦手なら、まず「隣の倍音 往復」で息の速さの感覚を作ってから「オクターブ 往復」へ進んでください。",
  order: 30,
  settingsSchema: [
    { key: "pattern", label: "パターン", type: "select", options: SLUR_PATTERNS.map((p) => ({ value: p.id, label: p.label })) },
    {
      key: "valves",
      label: "運指",
      type: "select",
      options: ["0", "2", "1", "1-2", "2-3", "1-3", "4", "2-4"].map((v) => ({ value: v, label: v })),
      help: "運指を変えると倍音列全体が半音ずつ下がります。",
    },
    { key: "bpm", label: "開始テンポ", type: "number", min: 30, max: 200, unit: "♩=" },
    { key: "autoRamp", label: "成功したらテンポを上げる", type: "boolean" },
    { key: "rampAfter", label: "何回連続で成功したら上げるか", type: "number", min: 1, max: 10, unit: "回" },
    { key: "rampStep", label: "上げ幅", type: "number", min: 1, max: 20, unit: "bpm" },
  ],
  defaultSettings: { pattern: "oct24", valves: "0", bpm: 60, autoRamp: true, rampAfter: 3, rampStep: 4 },
  create: (ctx) => new LipSlurTrainer(ctx),
  renderSummary: (entries: HistoryEntry[]) => renderSummaryTable(entries.map((e) => e.data as LipSlurRecord)),
};
