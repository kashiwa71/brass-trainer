/**
 * ドローン合わせ: 鳴りっぱなしの基準音に合わせて音を伸ばし、うなりが消える位置を体で覚える。
 * 音程が取れない人ほど効く。針が高低を大きく示す。
 */
import type { TrainerModule, TrainerContext, TrainerInstance } from "../../core/trainer";
import type { HistoryEntry } from "../../core/history";
import { noteName } from "../../core/notes";
import { el, replaceChildren, fmtCents, fmtPct } from "../../ui/dom";
import { PitchNeedle, noteCard, table } from "../../ui/components";
import { adviceCard, coachingBlock } from "../../ui/advice";
import { dailyAdvice } from "../../content/advice";
import { Runner, midiFloat } from "../shared";
import { pitchClassCents } from "../ear-training/evaluate";
import { evaluateDrone } from "./evaluate";

interface Settings {
  target: number;
  droneOctave: "0" | "1";
  holdSec: number;
  tightCents: number;
}

export interface DroneRecord {
  targetMidi: number;
  score: number;
  meanCents: number | null;
  tightRatio: number;
  wobbleCents: number | null;
}

class DroneTrainer implements TrainerInstance {
  private runner: Runner | null = null;
  private stage!: HTMLElement;
  private result!: HTMLElement;
  private stats!: HTMLElement;
  private needle = new PitchNeedle(60);
  private offFrame: (() => void) | null = null;

  constructor(private readonly ctx: TrainerContext) {}

  private get s(): Settings {
    return this.ctx.settings as unknown as Settings;
  }

  mount(): void {
    this.stage = el("div", { class: "stage" }, el("p", { class: "muted" }, "「開始」を押すとドローンが鳴り続けます。同じ音を伸ばして、うなりが消える所を探してください。"));
    this.result = el("div", { class: "result" });
    this.stats = el("div", { class: "stats" });
    replaceChildren(this.ctx.root, adviceCard(dailyAdvice("ear"), { compact: true, label: "今日のポイント" }), this.stage, this.result, el("h3", {}, "この練習の成績"), this.stats);
    this.renderStats();
  }

  async start(): Promise<void> {
    this.runner = new Runner();
    const r = this.runner;
    const { audio, tone, app, tuba } = this.ctx;
    const target = this.s.target;
    const droneMidi = target + (this.s.droneOctave === "1" ? 12 : 0);
    tone.startDrone(droneMidi, app.a4Hz);
    replaceChildren(this.stage, noteCard(tuba, target), this.needle.root);
    this.offFrame = audio.onFrame((f) => {
      const valid = f.hz !== null && f.db > audio.gateDb && f.clarity >= 0.5;
      this.needle.update(valid ? pitchClassCents(midiFloat(f.hz as number, app.a4Hz), target) : null, this.s.tightCents);
    });
    while (!r.isAborted) {
      this.ctx.setStatus(`ドローンに合わせて ${noteName(target)} を ${this.s.holdSec} 秒伸ばしてください`);
      const onset = await r.waitForOnset(audio, { timeoutMs: 30000 });
      if (onset === null) {
        if (r.isAborted) break;
        continue;
      }
      this.ctx.setStatus("伸ばして…うなりを消す");
      const frames = await r.collectUntil(audio, onset + this.s.holdSec, onset + 0.3);
      if (r.isAborted) break;
      const ev = evaluateDrone(frames, onset + 0.3, onset + this.s.holdSec, target, app.a4Hz, audio.gateDb, { tightCents: this.s.tightCents });
      const rec: DroneRecord = { targetMidi: target, score: ev.score, meanCents: ev.meanCents, tightRatio: ev.tightRatio, wobbleCents: ev.wobbleCents };
      this.ctx.history.add("drone", rec);
      this.showResult(rec);
      this.renderStats();
      while (!r.isAborted && audio.latest && audio.latest.dbFast > audio.gateDb) await r.sleep(100);
      if (!(await r.sleep(800))) break;
    }
    this.cleanup();
    this.ctx.setStatus("停止しました");
  }

  private cleanup(): void {
    this.ctx.tone.stopDrone();
    this.offFrame?.();
    this.offFrame = null;
  }

  stop(): void {
    this.runner?.abort();
    this.runner = null;
    this.cleanup();
  }

  dispose(): void {
    this.stop();
  }

  private showResult(rec: DroneRecord): void {
    const cls = rec.score >= 80 ? "ok" : rec.score >= 50 ? "mid" : "ng";
    const mean = rec.meanCents ?? 0;
    const dir = rec.meanCents === null ? "" : Math.abs(mean) <= 5 ? "ぴったり" : mean > 0 ? `平均 ${fmtCents(mean)} ¢ 高い` : `平均 ${fmtCents(mean)} ¢ 低い`;
    const triggers = [] as ("drone-sharp" | "drone-flat" | "drone-wobbly")[];
    if ((rec.wobbleCents ?? 0) > 20) triggers.push("drone-wobbly");
    if (mean > 10) triggers.push("drone-sharp");
    if (mean < -10) triggers.push("drone-flat");
    replaceChildren(
      this.result,
      el("div", { class: `verdict ${cls}` }, `${rec.score} 点`, el("small", {}, ` ${dir}`)),
      el("ul", { class: "detail-list" }, el("li", {}, `±${this.s.tightCents} ¢ に入っていた時間: ${fmtPct(rec.tightRatio)}`), el("li", {}, `揺れ: ${rec.wobbleCents === null ? "–" : `${Math.round(rec.wobbleCents)} ¢`}`)),
      rec.score < 80 ? coachingBlock(triggers.length ? triggers : ["drone-wobbly"], "ear") : null,
    );
  }

  private renderStats(): void {
    replaceChildren(this.stats, renderSummaryTable(this.ctx.history.list<DroneRecord>("drone").map((e) => e.data)));
  }
}

function renderSummaryTable(recs: DroneRecord[]): HTMLElement {
  if (recs.length === 0) return el("p", { class: "muted" }, "まだ記録がありません。");
  const by = new Map<number, DroneRecord[]>();
  for (const r of recs) {
    if (!by.has(r.targetMidi)) by.set(r.targetMidi, []);
    by.get(r.targetMidi)!.push(r);
  }
  const rows = [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([midi, rs]) => {
      const avg = rs.reduce((a, r) => a + r.score, 0) / rs.length;
      const recent = rs.slice(-10);
      const ravg = recent.reduce((a, r) => a + r.score, 0) / recent.length;
      const means = rs.filter((r) => r.meanCents !== null).map((r) => r.meanCents as number);
      const bias = means.length ? means.reduce((a, b) => a + b, 0) / means.length : null;
      return [noteName(midi), `${rs.length} 回`, `${Math.round(avg)} 点`, `${Math.round(ravg)} 点`, bias === null ? "–" : `${fmtCents(bias)} ¢`];
    });
  return table(["音", "回数", "平均", "直近 10 回", "ずれの癖"], rows);
}

export const droneTrainer: TrainerModule = {
  id: "drone",
  title: "ドローン合わせ",
  summary: "鳴り続ける基準音に合わせて伸ばし、うなりが消える所を覚える",
  description:
    "基準音（ドローン）が鳴り続ける中で同じ音を伸ばします。合っていないと「わんわん」とうなりが聞こえ、合うと消えます。針が高い・低いを大きく示すので、耳で分からなくても目で寄せられ、繰り返すうちに耳がうなりを捉えるようになります。苦手な H で毎日 1〜2 分やると、音当ての命中率が上がります。低い音は「1 オクターブ上のドローン」にすると聴き取りやすくなります。",
  order: 7,
  settingsSchema: [
    { key: "target", label: "音", type: "note" },
    {
      key: "droneOctave",
      label: "ドローンの高さ",
      type: "select",
      options: [
        { value: "0", label: "同じ高さ" },
        { value: "1", label: "1 オクターブ上（低い音で聴きやすい）" },
      ],
    },
    { key: "holdSec", label: "伸ばす長さ", type: "number", min: 3, max: 15, unit: "秒" },
    { key: "tightCents", label: "合格とみなす幅", type: "number", min: 5, max: 25, unit: "¢" },
  ],
  defaultSettings: { target: 47, droneOctave: "1", holdSec: 6, tightCents: 10 },
  create: (ctx) => new DroneTrainer(ctx),
  renderSummary: (entries: HistoryEntry[]) => renderSummaryTable(entries.map((e) => e.data as DroneRecord)),
};
