/**
 * 出だしトレーナー: 音の出だしがまっすぐ・きれいに始まるかを採点する。
 * 発音から 600 ms のピッチと音量の推移を見て、安定までの時間・しゃくり・別の倍音への引っかかり・立ち上がりを評価する。
 */
import type { TrainerModule, TrainerContext, TrainerInstance } from "../../core/trainer";
import type { HistoryEntry } from "../../core/history";
import { noteName } from "../../core/notes";
import { el, replaceChildren, fmtCents, fmtMs } from "../../ui/dom";
import { noteCard, pitchGraph, table } from "../../ui/components";
import { adviceCard, coachingBlock } from "../../ui/advice";
import { dailyAdvice, type Trigger } from "../../content/advice";
import { Runner } from "../shared";
import { evaluateAttack, type AttackQuality } from "./evaluate";

interface Settings {
  anyNote: boolean;
  target: number;
  reference: boolean;
  stableCents: number;
}

export interface AttackQualityRecord {
  targetMidi: number | null;
  settledMidi: number | null;
  score: number;
  stabilizeSec: number | null;
  initialCents: number | null;
  glitch: boolean;
  riseSec: number | null;
  wrongNote: boolean;
}

class AttackQualityTrainer implements TrainerInstance {
  private runner: Runner | null = null;
  private stage!: HTMLElement;
  private result!: HTMLElement;
  private stats!: HTMLElement;

  constructor(private readonly ctx: TrainerContext) {}

  private get s(): Settings {
    return this.ctx.settings as unknown as Settings;
  }

  mount(): void {
    this.stage = el("div", { class: "stage" }, el("p", { class: "muted" }, "「開始」を押したら、好きなタイミングで音を出してください。1 音ごとに採点します。"));
    this.result = el("div", { class: "result" });
    this.stats = el("div", { class: "stats" });
    replaceChildren(this.ctx.root, adviceCard(dailyAdvice("attack"), { compact: true, label: "今日のポイント" }), this.stage, this.result, el("h3", {}, "この練習の成績"), this.stats);
    this.renderStats();
  }

  async start(): Promise<void> {
    this.runner = new Runner();
    const r = this.runner;
    const { audio, tone, tuba, app } = this.ctx;
    while (!r.isAborted) {
      const target = this.s.anyNote ? null : this.s.target;
      replaceChildren(this.stage, target === null ? el("div", { class: "note-big" }, "どの音でも") : noteCard(tuba, target));
      if (target !== null && this.s.reference) {
        this.ctx.setStatus("基準音を聴いてください");
        await tone.play(target, 1.0, app.a4Hz);
        if (!(await r.sleep(400))) break;
      }
      this.ctx.setStatus("唇を震わせる瞬間を決めて、音を出す");
      this.stage.classList.add("go");
      const onset = await r.waitForOnset(audio, { timeoutMs: 20000 });
      this.stage.classList.remove("go");
      if (onset === null) {
        if (r.isAborted) break;
        continue;
      }
      const frames = await r.collectUntil(audio, onset + 0.65, onset - 0.1);
      if (r.isAborted) break;
      const q = evaluateAttack(frames, onset, app.a4Hz, audio.gateDb, { stableCents: this.s.stableCents });
      const wrongNote = target !== null && q.settledMidi !== null && q.settledMidi !== target;
      const rec: AttackQualityRecord = {
        targetMidi: target,
        settledMidi: q.settledMidi,
        score: q.score,
        stabilizeSec: q.stabilizeSec,
        initialCents: q.initialCents,
        glitch: q.glitch,
        riseSec: q.riseSec,
        wrongNote,
      };
      this.ctx.history.add("attack-quality", rec);
      this.showResult(q, rec, frames, onset);
      this.renderStats();
      // 音が止まるまで待ってから次へ（減点があるときはアドバイスを読む時間を置く）
      while (!r.isAborted && audio.latest && audio.latest.dbFast > audio.gateDb) await r.sleep(100);
      if (!(await r.sleep(q.score >= 80 ? 600 : 2500))) break;
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

  private showResult(q: AttackQuality, rec: AttackQualityRecord, frames: Parameters<typeof pitchGraph>[0], onset: number): void {
    const { app, audio } = this.ctx;
    const graphTarget = rec.targetMidi ?? q.settledMidi ?? 47;
    const cls = q.score >= 80 ? "ok" : q.score >= 50 ? "mid" : "ng";
    const details = el(
      "ul",
      { class: "detail-list" },
      el("li", {}, `落ち着いた音: ${q.settledMidi === null ? "–" : `${noteName(q.settledMidi)}（${fmtCents(q.settledCents ?? 0)} ¢）`}${rec.wrongNote ? " ← 目標と違う音" : ""}`),
      el("li", {}, `安定までの時間: ${q.stabilizeSec === null ? "安定せず" : fmtMs(q.stabilizeSec)}`),
      el("li", {}, `最初のピッチ: ${q.initialCents === null ? "–" : `${fmtCents(q.initialCents)} ¢`}`),
      el("li", {}, `別の倍音への引っかかり: ${q.glitch ? `あり（${q.glitchMidi === null ? "" : noteName(q.glitchMidi)}）` : "なし"}`),
      el("li", {}, `音量の立ち上がり: ${q.riseSec === null ? "–" : fmtMs(q.riseSec)}`),
    );
    const penalties = q.penalties.length
      ? el("ul", { class: "penalties" }, ...q.penalties.map((p) => el("li", {}, `−${p.points}: ${p.label}`)))
      : el("p", { class: "ok-text" }, "減点なし。きれいな出だしです。");
    const triggers: Trigger[] = [];
    if (q.glitch) triggers.push("glitch");
    if (q.initialCents !== null && q.initialCents < -30 && !q.glitch) triggers.push("scoop");
    if (q.initialCents !== null && q.initialCents > 30 && !q.glitch) triggers.push("from-above");
    if (q.stabilizeSec === null || q.stabilizeSec > 0.12) triggers.push("unstable");
    if (q.riseSec !== null && q.riseSec > 0.12) triggers.push("slow-rise");
    const coach = q.score < 80 ? coachingBlock(triggers.length ? triggers : ["unstable"], "attack") : null;
    replaceChildren(
      this.result,
      el("div", { class: `verdict ${cls}` }, `${q.score} 点`),
      pitchGraph(frames, { a4Hz: app.a4Hz, targetMidi: graphTarget, startT: onset - 0.05, durationSec: 0.65, gateDb: audio.gateDb }),
      el("small", { class: "muted" }, "黄: ピッチ（中央の線が目標音、帯は ±25 セント、縦線は 100 ms ごと）、青: 音量"),
      details,
      penalties,
      coach,
    );
  }

  private renderStats(): void {
    replaceChildren(this.stats, renderSummaryTable(this.ctx.history.list<AttackQualityRecord>("attack-quality").map((e) => e.data)));
  }
}

function renderSummaryTable(recs: AttackQualityRecord[]): HTMLElement {
  if (recs.length === 0) return el("p", { class: "muted" }, "まだ記録がありません。");
  const byNote = new Map<number, AttackQualityRecord[]>();
  for (const r of recs) {
    const k = r.targetMidi ?? r.settledMidi;
    if (k === null) continue;
    if (!byNote.has(k)) byNote.set(k, []);
    byNote.get(k)!.push(r);
  }
  const rows = [...byNote.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([midi, rs]) => {
      const avg = rs.reduce((a, r) => a + r.score, 0) / rs.length;
      const recent = rs.slice(-10);
      const recentAvg = recent.reduce((a, r) => a + r.score, 0) / recent.length;
      const glitchRate = rs.filter((r) => r.glitch).length / rs.length;
      const stab = rs.filter((r) => r.stabilizeSec !== null).map((r) => r.stabilizeSec as number);
      const stabAvg = stab.length ? stab.reduce((a, b) => a + b, 0) / stab.length : null;
      return [noteName(midi), `${rs.length} 回`, `${Math.round(avg)} 点`, `${Math.round(recentAvg)} 点`, stabAvg === null ? "–" : fmtMs(stabAvg), `${Math.round(glitchRate * 100)}%`];
    });
  return table(["音", "回数", "平均", "直近 10 回", "安定までの平均", "引っかかり率"], rows);
}

export const attackQualityTrainer: TrainerModule = {
  id: "attack-quality",
  title: "出だし",
  summary: "音の出だしがまっすぐ始まるかを 100 点満点で採点",
  description:
    "1 音ずつ吹くと、発音から 600 ms のピッチと音量の推移を解析して採点します。減点の対象は「ピッチが安定するまでの時間」「下からのしゃくり上げ・上からの入り」「別の倍音への引っかかり」「音量の立ち上がりの遅さ」です。減点の種類に応じて、プロの指導者のアドバイス（「唇を震わせる瞬間を決める」「息だけで吹くエアー・アタック」など）を表示します。楽器を持つ前に、息だけで同じフレーズを吹いておくと効果が上がります。",
  order: 20,
  settingsSchema: [
    { key: "anyNote", label: "どの音でも判定する", type: "boolean", help: "オンにすると目標音を決めずに採点します。" },
    { key: "target", label: "目標の音", type: "note" },
    { key: "reference", label: "基準音を鳴らす", type: "boolean" },
    { key: "stableCents", label: "安定とみなす幅", type: "number", min: 5, max: 50, unit: "¢", help: "小さいほど厳しく採点します。" },
  ],
  defaultSettings: { anyNote: false, target: 47, reference: true, stableCents: 20 },
  create: (ctx) => new AttackQualityTrainer(ctx),
  renderSummary: (entries: HistoryEntry[]) => renderSummaryTable(entries.map((e) => e.data as AttackQualityRecord)),
};
