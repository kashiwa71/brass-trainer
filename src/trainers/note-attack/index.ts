/**
 * 音当てトレーナー: 指定した音（H など）を一発で当てる練習。
 * 「歌う → 吹く」の順で進め、外したときは乗った倍音に応じたアドバイスを出す。
 * Dunham の「5 度以内のランダム跳躍を休符つきで」も選べる。
 */
import type { TrainerModule, TrainerContext, TrainerInstance } from "../../core/trainer";
import type { HistoryEntry } from "../../core/history";
import { noteName } from "../../core/notes";
import { fingeringsFor, neighborPartials } from "../../core/tuba";
import { el, replaceChildren, fmtCents, fmtPct } from "../../ui/dom";
import { noteCard, table, PitchNeedle } from "../../ui/components";
import { adviceCard, coachingBlock } from "../../ui/advice";
import { dailyAdvice } from "../../content/advice";
import { Runner, singGate } from "../shared";
import { judgeAttack, summarize, type AttackJudgement } from "./evaluate";

interface Settings {
  targets: number[];
  mode: "random" | "sequential";
  reference: boolean;
  singFirst: boolean;
  pauseSec: number;
  leapMode: "none" | "fixed" | "random5th";
  leapFrom: number;
}

export interface NoteAttackRecord extends AttackJudgement {
  leapFrom: number | null;
  /** 歌のゲートの結果。歌わない設定なら null */
  sang: boolean | null;
}

function pick(s: Settings, index: number): number {
  const ts = s.targets.length ? s.targets : [47];
  return s.mode === "sequential" ? ts[index % ts.length] : ts[Math.floor(Math.random() * ts.length)];
}

/** 完全 5 度以内で目標と異なる出発音をランダムに選ぶ */
export function randomLeapFrom(target: number, low: number, high: number, rnd = Math.random): number {
  const candidates: number[] = [];
  for (let d = -7; d <= 7; d++) {
    if (d === 0) continue;
    const m = target + d;
    if (m >= low && m <= high) candidates.push(m);
  }
  return candidates[Math.floor(rnd() * candidates.length)] ?? target;
}

class NoteAttackTrainer implements TrainerInstance {
  private runner: Runner | null = null;
  private stage!: HTMLElement;
  private result!: HTMLElement;
  private stats!: HTMLElement;
  private needle = new PitchNeedle(100);
  private index = 0;

  constructor(private readonly ctx: TrainerContext) {}

  private get s(): Settings {
    return this.ctx.settings as unknown as Settings;
  }

  mount(): void {
    this.stage = el("div", { class: "stage" }, el("p", { class: "muted" }, "「開始」を押すと出題が始まります。基準音 → 歌う → 間を置く → 吹く、の順です。"));
    this.result = el("div", { class: "result" });
    this.stats = el("div", { class: "stats" });
    replaceChildren(this.ctx.root, adviceCard(dailyAdvice("pitch-accuracy"), { compact: true, label: "今日のポイント" }), this.stage, this.result, el("h3", {}, "この練習の成績"), this.stats);
    this.renderStats();
  }

  async start(): Promise<void> {
    this.runner = new Runner();
    const r = this.runner;
    const { audio, tone, tuba, app } = this.ctx;
    while (!r.isAborted) {
      const target = pick(this.s, this.index++);
      const leapFrom = this.s.leapMode === "fixed" ? this.s.leapFrom : this.s.leapMode === "random5th" ? randomLeapFrom(target, tuba.range.low, tuba.range.high) : null;
      this.showTarget(target, leapFrom);

      if (this.s.reference) {
        this.ctx.setStatus("基準音を聴いて、頭の中で鳴らす");
        await tone.play(leapFrom ?? target, 1.2, app.a4Hz);
        if (leapFrom !== null) await tone.play(target, 1.2, app.a4Hz);
        if (!(await r.sleep(200))) break;
      }

      let sang: boolean | null = null;
      if (this.s.singFirst) {
        this.ctx.setStatus(`${noteName(target)} を声で歌ってください（高さは自由）`);
        const stageNote = this.stage.querySelector(".note-card");
        replaceChildren(this.stage, stageNote ?? el("div", { class: "note-big" }, noteName(target)), this.needle.root);
        this.stage.classList.add("go");
        const m = await singGate(r, audio, { targetMidi: target, a4Hz: app.a4Hz, timeoutMs: 8000, onCents: (c) => this.needle.update(c, 40) });
        this.stage.classList.remove("go");
        if (r.isAborted) break;
        sang = m.matched;
        if (!m.matched) {
          this.ctx.setStatus("声が合いませんでした。もう一度基準音を聴いてから吹きます");
          await tone.play(target, 1.2, app.a4Hz);
        } else {
          this.ctx.setStatus("声で合いました。その音を頭に残したまま");
        }
        this.showTarget(target, leapFrom);
        if (!(await r.sleep(600))) break;
      }

      for (let remain = this.s.pauseSec; remain > 0 && !r.isAborted; remain--) {
        this.ctx.setStatus(`${remain} 秒後に吹く。次の音は上か、下か、同じか`);
        if (!(await r.sleep(1000))) break;
      }
      if (r.isAborted) break;

      this.ctx.setStatus(leapFrom !== null ? `${noteName(leapFrom)} → ${noteName(target)} を吹く` : `${noteName(target)} を吹く`);
      this.stage.classList.add("go");
      let onset = await r.waitForOnset(audio, { timeoutMs: 12000 });
      if (onset !== null && leapFrom !== null) onset = await r.waitForOnset(audio, { timeoutMs: 6000 });
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
      const rec: NoteAttackRecord = { ...j, leapFrom, sang };
      this.ctx.history.add("note-attack", rec);
      this.showResult(rec);
      this.renderStats();
      if (!(await r.sleep(rec.hit ? 1500 : 4000))) break;
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
      nb.below !== null ? el("span", {}, `下の倍音 ${noteName(nb.below)}`) : null,
      nb.above !== null ? el("span", {}, `上の倍音 ${noteName(nb.above)}`) : null,
    );
    replaceChildren(this.stage, leapFrom !== null ? el("div", { class: "leap-from" }, `${noteName(leapFrom)} から`) : null, noteCard(tuba, target, [hint]));
    replaceChildren(this.result);
  }

  private showResult(r: NoteAttackRecord): void {
    if (r.hit) {
      replaceChildren(this.result, el("div", { class: "verdict ok" }, "命中", el("small", {}, `${fmtCents(r.cents ?? 0)} ¢`)));
      return;
    }
    if (r.landedMidi === null) {
      replaceChildren(this.result, el("div", { class: "verdict ng" }, "ピッチが取れませんでした"));
      return;
    }
    const diff = r.landedMidi - r.targetMidi;
    const below = diff < 0;
    replaceChildren(
      this.result,
      el("div", { class: "verdict ng" }, `外れ: ${noteName(r.landedMidi)}`, el("small", {}, `${Math.abs(diff)} 半音${below ? "下" : "上"}に乗った`)),
      coachingBlock(below ? ["missed-below"] : ["missed-above"], "pitch-accuracy"),
    );
  }

  private renderStats(): void {
    replaceChildren(this.stats, renderSummaryTable(this.ctx.history.list<NoteAttackRecord>("note-attack").map((e) => e.data)));
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
  title: "音当て（歌ってから吹く）",
  summary: "H など苦手な音を、声で当ててから冷えた状態で一発で吹く",
  description:
    "金管指導の基本「歌う → 吹く」の順で進めます。基準音を聴いたら声で同じ音名を歌い（針が高低を示します）、数秒の間を置いてから吹きます。吹き始め 50〜300 ms のピッチで狙った倍音に乗ったかを判定し、外したときは上下どちらの倍音に落ちたかに応じてプロのアドバイスを表示します。「ランダム跳躍」は David Dunham が勧める、5 度以内のランダムな音程を休符つきで当てる練習です。",
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
    { key: "singFirst", label: "吹く前に声で歌う", type: "boolean", help: "声で合うまで吹きません（8 秒で打ち切り）。音を取るのが苦手な人は必ずオンに。" },
    { key: "pauseSec", label: "吹くまでの間", type: "number", min: 0, max: 10, unit: "秒" },
    {
      key: "leapMode",
      label: "跳躍",
      type: "select",
      options: [
        { value: "none", label: "なし（単音）" },
        { value: "fixed", label: "決めた音から跳ぶ" },
        { value: "random5th", label: "ランダム（5 度以内）から跳ぶ" },
      ],
      help: "跳躍では 2 つ目の発音を判定します。どちらもタンギングして吹きます。",
    },
    { key: "leapFrom", label: "跳躍の出発音（決めた音）", type: "note" },
  ],
  defaultSettings: { targets: [47, 59], mode: "random", reference: true, singFirst: true, pauseSec: 3, leapMode: "none", leapFrom: 53 },
  create: (ctx) => new NoteAttackTrainer(ctx),
  renderSummary: (entries: HistoryEntry[]) => renderSummaryTable(entries.map((e) => e.data as AttackJudgement)),
};
