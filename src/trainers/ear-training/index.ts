/**
 * 耳トレ（聴いて歌う）: 音を取るのが苦手な人のための土台。
 * 基準音を聴き、声（またはマウスピース）で同じ音名を出す。どのオクターブでもよい。
 * 「歌う → バズ → 吹く」の最初の段階を、針を見ながら繰り返す。
 */
import type { TrainerModule, TrainerContext, TrainerInstance } from "../../core/trainer";
import type { HistoryEntry } from "../../core/history";
import { noteName } from "../../core/notes";
import { el, replaceChildren, fmtCents, fmtPct } from "../../ui/dom";
import { PitchNeedle, table } from "../../ui/components";
import { adviceCard, coachingBlock } from "../../ui/advice";
import { dailyAdvice } from "../../content/advice";
import { Runner, singGate } from "../shared";

interface Settings {
  targets: number[];
  level: "listen" | "interval" | "recall";
  anchor: number;
  tolCents: number;
  holdSec: number;
  timeoutSec: number;
}

export interface EarRecord {
  targetMidi: number;
  level: string;
  matched: boolean;
  timeToMatchSec: number | null;
  cents: number | null;
}

class EarTrainer implements TrainerInstance {
  private runner: Runner | null = null;
  private stage!: HTMLElement;
  private result!: HTMLElement;
  private stats!: HTMLElement;
  private needle = new PitchNeedle(100);
  private index = 0;
  private heardTarget = new Set<number>();

  constructor(private readonly ctx: TrainerContext) {}

  private get s(): Settings {
    return this.ctx.settings as unknown as Settings;
  }

  mount(): void {
    this.stage = el("div", { class: "stage" }, el("p", { class: "muted" }, "「開始」を押すと基準音が鳴ります。同じ音名を、出しやすい高さで「あー」と歌ってください。"));
    this.result = el("div", { class: "result" });
    this.stats = el("div", { class: "stats" });
    replaceChildren(this.ctx.root, adviceCard(dailyAdvice("ear"), { compact: true, label: "今日のポイント" }), this.stage, this.result, el("h3", {}, "この練習の成績"), this.stats);
    this.renderStats();
  }

  async start(): Promise<void> {
    this.runner = new Runner();
    const r = this.runner;
    const { audio, tone, app } = this.ctx;
    const targets = this.s.targets.length ? this.s.targets : [47];
    while (!r.isAborted) {
      const target = targets[this.index++ % targets.length];
      const level = this.s.level;
      replaceChildren(this.stage, el("div", { class: "note-big" }, noteName(target)), el("div", { class: "note-sub" }, "この音名を歌う（高さは自由）"));
      replaceChildren(this.result);

      if (level === "listen" || (level === "recall" && !this.heardTarget.has(target))) {
        this.ctx.setStatus("基準音を聴いてください");
        await tone.play(target, 1.5, app.a4Hz);
        this.heardTarget.add(target);
      } else if (level === "interval") {
        this.ctx.setStatus(`${noteName(this.s.anchor)} を聴いて、${noteName(target)} を思い浮かべてください`);
        await tone.play(this.s.anchor, 1.2, app.a4Hz);
      } else {
        this.ctx.setStatus("基準音なし。思い出して歌ってください");
      }
      if (!(await r.sleep(300))) break;

      this.ctx.setStatus(`${noteName(target)} を歌ってください（${this.s.holdSec} 秒保つ）`);
      this.stage.classList.add("go");
      replaceChildren(this.stage, el("div", { class: "note-big" }, noteName(target)), this.needle.root);
      const m = await singGate(r, audio, {
        targetMidi: target,
        a4Hz: app.a4Hz,
        timeoutMs: this.s.timeoutSec * 1000,
        tolCents: this.s.tolCents,
        holdSec: this.s.holdSec,
        onCents: (c) => this.needle.update(c, this.s.tolCents),
      });
      this.stage.classList.remove("go");
      if (r.isAborted) break;

      const rec: EarRecord = { targetMidi: target, level, matched: m.matched, timeToMatchSec: m.timeToMatchSec, cents: m.cents };
      this.ctx.history.add("ear-training", rec);
      this.showResult(rec);
      this.renderStats();
      if (!m.matched) {
        // 合わなかったら正解を聴かせて、もう一度歌ってもらう
        this.ctx.setStatus("正解の音を聴いてください");
        await tone.play(target, 1.5, app.a4Hz);
      }
      if (!(await r.sleep(1200))) break;
    }
    this.ctx.setStatus("停止しました");
  }

  stop(): void {
    this.runner?.abort();
    this.runner = null;
  }

  dispose(): void {
    this.stop();
  }

  private showResult(rec: EarRecord): void {
    if (rec.matched) {
      replaceChildren(this.result, el("div", { class: "verdict ok" }, "合った", el("small", {}, ` ${Math.round((rec.timeToMatchSec ?? 0) * 10) / 10} 秒 / ${fmtCents(rec.cents ?? 0)} ¢`)));
      return;
    }
    const dir = rec.cents === null ? "声が検出できませんでした" : rec.cents > 0 ? `高かった（${fmtCents(rec.cents)} ¢）` : `低かった（${fmtCents(rec.cents)} ¢）`;
    replaceChildren(this.result, el("div", { class: "verdict ng" }, dir), coachingBlock(["sing-off"], "ear"));
  }

  private renderStats(): void {
    replaceChildren(this.stats, renderSummaryTable(this.ctx.history.list<EarRecord>("ear-training").map((e) => e.data)));
  }
}

function renderSummaryTable(recs: EarRecord[]): HTMLElement {
  if (recs.length === 0) return el("p", { class: "muted" }, "まだ記録がありません。");
  const by = new Map<number, EarRecord[]>();
  for (const r of recs) {
    if (!by.has(r.targetMidi)) by.set(r.targetMidi, []);
    by.get(r.targetMidi)!.push(r);
  }
  const rows = [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([midi, rs]) => {
      const ok = rs.filter((r) => r.matched);
      const t = ok.length ? ok.reduce((a, r) => a + (r.timeToMatchSec ?? 0), 0) / ok.length : null;
      const recent = rs.slice(-10);
      const recentRate = recent.filter((r) => r.matched).length / recent.length;
      return [noteName(midi), `${fmtPct(ok.length / rs.length)}（${rs.length} 回）`, fmtPct(recentRate), t === null ? "–" : `${t.toFixed(1)} 秒`];
    });
  return table(["音", "合った割合", "直近 10 回", "合うまでの平均"], rows);
}

export const earTrainer: TrainerModule = {
  id: "ear-training",
  title: "耳トレ（聴いて歌う）",
  summary: "基準音を聴いて声で同じ音を出す。音を取る力の土台",
  description:
    "「歌えない音は吹けない」が金管指導の基本です。基準音を聴いたら、出しやすい高さで同じ音名を「あー」と歌います。針が高い・低いを大きく示すので、音痴だと感じていても声をどちらに動かせばよいかが分かります。まず「聴いてすぐ歌う」で合う割合を上げ、次に「別の音を聴いてから歌う」「思い出して歌う」に進みます。声の代わりにマウスピースのバズでも判定できます。",
  order: 5,
  settingsSchema: [
    { key: "targets", label: "練習する音", type: "notes", help: "苦手な音（H など）を選びます。" },
    {
      key: "level",
      label: "段階",
      type: "select",
      options: [
        { value: "listen", label: "1. 聴いてすぐ歌う" },
        { value: "interval", label: "2. 別の音を聴いてから歌う" },
        { value: "recall", label: "3. 思い出して歌う（最初だけ聴く）" },
      ],
    },
    { key: "anchor", label: "段階 2 で聴く音", type: "note", help: "楽器の開放音など、いつも同じ音にします。" },
    { key: "tolCents", label: "合格とみなす幅", type: "number", min: 15, max: 80, unit: "¢" },
    { key: "holdSec", label: "保つ長さ", type: "number", min: 0.3, max: 2, step: 0.1, unit: "秒" },
    { key: "timeoutSec", label: "制限時間", type: "number", min: 3, max: 20, unit: "秒" },
  ],
  defaultSettings: { targets: [47, 46, 53, 58], level: "listen", anchor: 46, tolCents: 40, holdSec: 0.6, timeoutSec: 8 },
  create: (ctx) => new EarTrainer(ctx),
  renderSummary: (entries: HistoryEntry[]) => renderSummaryTable(entries.map((e) => e.data as EarRecord)),
};
