/**
 * 音当てトレーナー: 指定した音（H など）を一発で当てる練習。
 * 基準音を聴いてから間を置き、冷えた状態からの吹き始めがどの倍音に乗ったかを記録する。
 */
import type { TrainerModule, TrainerContext, TrainerInstance } from "../../core/trainer";
import type { HistoryEntry } from "../../core/history";
import { noteName } from "../../core/notes";
import { fingeringsFor, neighborPartials, type TubaModel } from "../../core/tuba";
import { el, replaceChildren, fmtCents, fmtPct } from "../../ui/dom";
import { noteCard, table } from "../../ui/components";
import { Runner } from "../shared";
import { judgeAttack, summarize, type AttackJudgement } from "./evaluate";

interface Settings {
  targets: number[];
  mode: "random" | "sequential";
  reference: boolean;
  pauseSec: number;
  useLeap: boolean;
  leapFrom: number;
}

export interface NoteAttackRecord extends AttackJudgement {
  leapFrom: number | null;
}

function pick(s: Settings, index: number): number {
  const ts = s.targets.length ? s.targets : [47];
  return s.mode === "sequential" ? ts[index % ts.length] : ts[Math.floor(Math.random() * ts.length)];
}

class NoteAttackTrainer implements TrainerInstance {
  private runner: Runner | null = null;
  private stage!: HTMLElement;
  private result!: HTMLElement;
  private stats!: HTMLElement;
  private results: AttackJudgement[] = [];
  private index = 0;

  constructor(private readonly ctx: TrainerContext) {}

  private get s(): Settings {
    return this.ctx.settings as unknown as Settings;
  }

  mount(): void {
    this.stage = el("div", { class: "stage" }, el("p", { class: "muted" }, "「開始」を押すと出題が始まります。"));
    this.result = el("div", { class: "result" });
    this.stats = el("div", { class: "stats" });
    replaceChildren(this.ctx.root, this.stage, this.result, el("h3", {}, "この練習の成績"), this.stats);
    this.results = this.ctx.history.list<NoteAttackRecord>("note-attack").map((e) => e.data);
    this.renderStats();
  }

  async start(): Promise<void> {
    this.runner = new Runner();
    const r = this.runner;
    const { audio, tone, tuba, app } = this.ctx;
    while (!r.isAborted) {
      const target = pick(this.s, this.index++);
      const leapFrom = this.s.useLeap ? this.s.leapFrom : null;
      this.showTarget(target, leapFrom);

      if (this.s.reference) {
        this.ctx.setStatus("基準音を聴いてください");
        await tone.play(leapFrom ?? target, 1.2, app.a4Hz);
        if (leapFrom !== null) await tone.play(target, 1.2, app.a4Hz);
        if (!(await r.sleep(200))) break;
      }
      // 間を置く（記憶だけを頼りに当てる）
      for (let remain = this.s.pauseSec; remain > 0 && !r.isAborted; remain--) {
        this.ctx.setStatus(`${remain} 秒後に吹いてください`);
        if (!(await r.sleep(1000))) break;
      }
      if (r.isAborted) break;

      this.ctx.setStatus(leapFrom !== null ? `${noteName(leapFrom)} → ${noteName(target)} を吹いてください` : `${noteName(target)} を吹いてください`);
      this.stage.classList.add("go");
      let onset = await r.waitForOnset(audio, { timeoutMs: 12000 });
      if (onset !== null && leapFrom !== null) {
        // 跳躍練習では 2 つ目の発音を判定する
        onset = await r.waitForOnset(audio, { timeoutMs: 6000 });
      }
      this.stage.classList.remove("go");
      if (onset === null) {
        if (r.isAborted) break;
        this.ctx.setStatus("発音が検出できませんでした。次の出題に進みます");
        if (!(await r.sleep(1200))) break;
        continue;
      }
      const frames = await r.collectUntil(audio, onset + 0.35, onset - 0.05);
      if (r.isAborted) break;
      const j = judgeAttack(frames, onset, target, app.a4Hz, audio.gateDb);
      const rec: NoteAttackRecord = { ...j, leapFrom };
      this.results.push(rec);
      this.ctx.history.add("note-attack", rec);
      this.showResult(rec, tuba);
      this.renderStats();
      if (!(await r.sleep(1800))) break;
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

  private showTarget(target: number, leapFrom: number | null): void {
    const tuba = this.ctx.tuba;
    const f = fingeringsFor(tuba, target).find((x) => x.preferred);
    const nb = f ? neighborPartials(tuba, f) : { below: null, above: null };
    const hint = el(
      "div",
      { class: "note-hint" },
      nb.below !== null ? el("span", {}, `下の倍音: ${noteName(nb.below)}`) : null,
      nb.above !== null ? el("span", {}, `上の倍音: ${noteName(nb.above)}`) : null,
    );
    replaceChildren(
      this.stage,
      leapFrom !== null ? el("div", { class: "leap-from" }, `${noteName(leapFrom)} から`) : null,
      noteCard(tuba, target, [hint]),
    );
    replaceChildren(this.result);
  }

  private showResult(r: NoteAttackRecord, _tuba: TubaModel): void {
    if (r.hit) {
      replaceChildren(this.result, el("div", { class: "verdict ok" }, "命中", el("small", {}, ` ${fmtCents(r.cents ?? 0)} ¢`)));
    } else if (r.landedMidi === null) {
      replaceChildren(this.result, el("div", { class: "verdict ng" }, "ピッチが取れませんでした"));
    } else {
      const diff = r.landedMidi - r.targetMidi;
      const dir = diff > 0 ? "上" : "下";
      replaceChildren(
        this.result,
        el("div", { class: "verdict ng" }, `外れ: ${noteName(r.landedMidi)} に乗りました`, el("small", {}, `（${Math.abs(diff)} 半音${dir}）`)),
      );
    }
  }

  private renderStats(): void {
    replaceChildren(this.stats, renderSummaryTable(this.results));
  }
}

function renderSummaryTable(results: AttackJudgement[]): HTMLElement {
  if (results.length === 0) return el("p", { class: "muted" }, "まだ記録がありません。");
  const stats = summarize(results);
  const rows = [...stats.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([midi, s]) => {
      const rate = s.attempts ? s.hits / s.attempts : 0;
      const misses = Object.entries(s.misses)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([m, n]) => `${noteName(Number(m))}×${n}`)
        .join(" ");
      const bar = el("div", { class: "bar" }, el("div", { class: `bar-fill ${rate >= 0.8 ? "good" : rate >= 0.5 ? "mid" : "bad"}`, style: `width:${rate * 100}%` }));
      return [noteName(midi), el("span", {}, bar, ` ${fmtPct(rate)}（${s.hits}/${s.attempts}）`), s.meanCents === null ? "–" : `${fmtCents(s.meanCents)} ¢`, misses || "–"];
    });
  return table(["音", "命中率", "命中時の偏差", "よく落ちる音"], rows);
}

export const noteAttackTrainer: TrainerModule = {
  id: "note-attack",
  title: "音当て",
  summary: "H など苦手な音を、冷えた状態から一発で当てる練習",
  description:
    "出題された音を、基準音を聴いてから数秒の間を置いて吹きます。吹き始めの 50〜300 ms のピッチで、狙った倍音に乗ったか、上下どちらの倍音に落ちたかを記録します。音ごとの命中率と「よく落ちる音」が表に出るので、外しやすい音を重点的に練習できます。跳躍を有効にすると、指定した音から目標音へタンギングで跳ぶ練習になります。",
  order: 10,
  settingsSchema: [
    { key: "targets", label: "出題する音", type: "notes", help: "苦手な音を選びます。複数選べます。" },
    {
      key: "mode",
      label: "出題順",
      type: "select",
      options: [
        { value: "random", label: "ランダム" },
        { value: "sequential", label: "順番どおり" },
      ],
    },
    { key: "reference", label: "基準音を鳴らす", type: "boolean", help: "オフにすると音を聴かずに当てる練習になります。" },
    { key: "pauseSec", label: "吹くまでの間", type: "number", min: 0, max: 10, unit: "秒" },
    { key: "useLeap", label: "跳躍で当てる", type: "boolean", help: "下の音から目標音へ跳びます。2 つ目の発音を判定します。" },
    { key: "leapFrom", label: "跳躍の出発音", type: "note" },
  ],
  defaultSettings: { targets: [47, 59], mode: "random", reference: true, pauseSec: 3, useLeap: false, leapFrom: 53 },
  create: (ctx) => new NoteAttackTrainer(ctx),
  renderSummary: (entries: HistoryEntry[]) => renderSummaryTable(entries.map((e) => e.data as AttackJudgement)),
};
