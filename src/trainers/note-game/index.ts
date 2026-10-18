/**
 * 音当てゲーム: 五線の上を右から次々に来る音符を、その音を吹いて撃ち落とす。
 * 左端の線まで来られたらライフを 1 失い、なくなったら終わり。5 個撃ち落とすごとに速くなる。
 * 音当て（一発で当てる）を、間を置かずに続ける練習。読譜（五線の位置 → 音）も兼ねる。
 */
import type { TrainerModule, TrainerContext, TrainerInstance } from "../../core/trainer";
import type { HistoryEntry } from "../../core/history";
import { noteName } from "../../core/notes";
import { el, replaceChildren, fmtPct } from "../../ui/dom";
import { table } from "../../ui/components";
import { staff } from "../../ui/staff";
import { adviceCard, coachingBlock } from "../../ui/advice";
import { dailyAdvice } from "../../content/advice";
import { Runner, midiFloat } from "../shared";
import { GameModel, HoldMatcher, centsFromTarget, summarizeGames, type GameRecord, type MatchMode } from "./evaluate";
import { GameField } from "./field";

interface Settings {
  targets: number[];
  /** select の値なので文字列（"0" は制限なし） */
  maxLeap: string;
  startTravelSec: number;
  lives: number;
  showNames: boolean;
  reference: boolean;
  match: MatchMode;
  tolCents: number;
}

/** 命中とみなすために目標の音を保つ長さ（秒） */
const HOLD_SEC = 0.12;

class NoteGameTrainer implements TrainerInstance {
  private runner: Runner | null = null;
  private hud!: HTMLElement;
  private fieldBox!: HTMLElement;
  private result!: HTMLElement;
  private stats!: HTMLElement;

  constructor(private readonly ctx: TrainerContext) {}

  private get s(): Settings {
    return this.ctx.settings as unknown as Settings;
  }

  private get pool(): number[] {
    return this.s.targets.length ? this.s.targets : [47];
  }

  mount(): void {
    this.hud = el("div", { class: "game-hud" });
    this.fieldBox = el("div", { class: "game-field" }, new GameField(this.pool, this.s.showNames).root);
    this.result = el("div", { class: "result" });
    this.stats = el("div", { class: "stats" });
    replaceChildren(
      this.ctx.root,
      adviceCard(dailyAdvice("pitch-accuracy"), { compact: true, label: "今日のポイント" }),
      el("div", { class: "game-box" }, this.hud, this.fieldBox, el("p", { class: "muted small game-help" }, "右から来る音符を、いちばん左のものから順に吹いて撃ち落とします。左の鳥は今吹いている音の高さに動きます。")),
      this.result,
      el("h3", {}, "この練習の成績"),
      this.stats,
    );
    this.renderHud(null);
    this.renderStats();
  }

  async start(): Promise<void> {
    this.runner = new Runner();
    const r = this.runner;
    const { audio, tone, app } = this.ctx;
    const s = this.s;
    const model = new GameModel({ pool: this.pool, maxLeap: Number(s.maxLeap), lives: s.lives, startTravelSec: s.startTravelSec });
    const field = new GameField(this.pool, s.showNames);
    replaceChildren(this.fieldBox, field.root);
    replaceChildren(this.result);
    this.renderHud(model);

    for (let n = 3; n > 0; n--) {
      this.ctx.setStatus(`${n} … 息を吸って構える`);
      if (!(await r.sleep(1000))) break;
    }
    if (r.isAborted) {
      this.ctx.setStatus("停止しました");
      return;
    }

    const matcher = new HoldMatcher(s.tolCents, HOLD_SEC);
    let frontId: number | null = null;
    /** 基準音を鳴らしている間はマイクの音で判定しない */
    let muteUntil = 0;

    const offFrame = audio.onFrame((f) => {
      if (model.over) return;
      const front = model.front;
      if (front && front.id !== frontId) {
        matcher.reset();
        frontId = front.id;
      }
      const valid = f.hz !== null && f.db > audio.gateDb && f.clarity >= 0.5 && f.t >= muteUntil;
      const mf = valid ? midiFloat(f.hz as number, app.a4Hz) : null;
      const cents = mf !== null && front ? centsFromTarget(mf, front.midi, s.match) : null;
      field.setAim(mf, cents !== null && Math.abs(cents) <= s.tolCents);
      if (!front) return;
      if (mf !== null) model.hear(Math.round(mf));
      if (!matcher.push(f.t, cents)) return;
      const hit = model.hitFront(f.t);
      if (!hit) return;
      field.shoot(hit.target, hit.progress, hit.points, audio.currentTime);
      this.renderHud(model);
    });

    let shownFront: number | null = null;
    let raf = 0;
    await new Promise<void>((resolve) => {
      const loop = () => {
        if (r.isAborted) return resolve();
        const t = audio.currentTime;
        for (const ev of model.step(t)) {
          if (ev.type === "spawn" && s.reference) {
            muteUntil = t + 0.75;
            void tone.play(ev.target.midi, 0.6, app.a4Hz);
          } else if (ev.type === "escape") {
            field.escape(ev.target, t);
            this.renderHud(model);
          }
        }
        field.render(model, t);
        if (model.over) return resolve();
        const front = model.front;
        if ((front?.id ?? null) !== shownFront) {
          shownFront = front?.id ?? null;
          this.ctx.setStatus(front === null ? "次の音符を待っています" : s.showNames ? `${noteName(front.midi)} を吹く` : "いちばん左の音符を吹く");
        }
        raf = requestAnimationFrame(loop);
      };
      model.begin(audio.currentTime + 0.3);
      r.onAbort(resolve);
      raf = requestAnimationFrame(loop);
    });
    cancelAnimationFrame(raf);
    offFrame();
    field.setAim(null, false);
    // 途中の演出（はじける円や × など）を片付ける
    field.render(model, audio.currentTime + 5);

    const rec = model.record();
    if (rec.results.length > 0) {
      this.ctx.history.add("note-game", rec);
      this.showResult(rec, model.over);
      this.renderStats();
    }
    this.ctx.setStatus(model.over ? `ゲームオーバー。${rec.score} 点` : "停止しました");
  }

  stop(): void {
    this.runner?.abort();
    this.runner = null;
  }

  dispose(): void {
    this.stop();
  }

  private renderHud(model: GameModel | null): void {
    const lives = model?.lives ?? this.s.lives;
    const hearts = "♥".repeat(Math.max(0, lives)) + "♡".repeat(Math.max(0, this.s.lives - lives));
    replaceChildren(
      this.hud,
      el("span", { class: "game-lives", "aria-label": `ライフ ${lives}` }, hearts),
      el("span", { class: "game-score" }, `${model?.score ?? 0}`, el("small", {}, " 点")),
      el("span", { class: "game-combo" }, model && model.combo >= 2 ? `${model.combo} 連続` : ""),
      el("span", { class: "game-level" }, `Lv ${model?.level ?? 1}`),
    );
  }

  private showResult(rec: GameRecord, over: boolean): void {
    const missed = new Map<number, number>();
    let below = 0;
    let above = 0;
    for (const x of rec.results) {
      if (x.hit) continue;
      missed.set(x.midi, (missed.get(x.midi) ?? 0) + 1);
      if (x.landedMidi !== null) {
        if (x.landedMidi < x.midi) below++;
        else above++;
      }
    }
    const worst = [...missed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const bestBefore = Math.max(0, ...this.ctx.history.list<GameRecord>("note-game").slice(0, -1).map((e) => e.data.score));
    replaceChildren(
      this.result,
      el("div", { class: `verdict ${rec.score > bestBefore ? "ok" : "mid"}` }, `${rec.score} 点`, el("small", {}, rec.score > bestBefore ? "自己ベスト" : `自己ベスト ${bestBefore} 点`)),
      el(
        "ul",
        { class: "detail-list" },
        el("li", {}, `撃ち落とした音: ${rec.hits} / ${rec.results.length}`),
        el("li", {}, `最大連続: ${rec.maxCombo}`),
        el("li", {}, `到達した速さ: Lv ${rec.level}`),
        over ? null : el("li", {}, "途中で停止しました"),
      ),
      worst.length
        ? el(
            "div",
            {},
            el("p", { class: "muted" }, "逃した音（多い順）"),
            staff(
              worst.map(([midi, n]) => ({ midi, cls: "ng", label: `×${n}` })),
              { className: "medium" },
            ),
          )
        : null,
      below + above > 0 ? coachingBlock(below >= above ? ["missed-below"] : ["missed-above"], "pitch-accuracy") : null,
    );
  }

  private renderStats(): void {
    replaceChildren(this.stats, renderSummaryTable(this.ctx.history.list<GameRecord>("note-game").map((e) => e.data)));
  }
}

function renderSummaryTable(games: GameRecord[]): HTMLElement {
  if (games.length === 0) return el("p", { class: "muted" }, "まだ記録がありません。");
  const best = Math.max(...games.map((g) => g.score));
  const recent = games.slice(-5).map((g) => g.score).join(" / ");
  const rows = [...summarizeGames(games).entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([midi, st]) => {
      const rate = st.attempts ? st.hits / st.attempts : 0;
      const bar = el("div", { class: "bar" }, el("div", { class: `bar-fill ${rate >= 0.8 ? "good" : rate >= 0.5 ? "mid" : "bad"}`, style: `width:${rate * 100}%` }));
      return [noteName(midi), el("span", {}, bar, ` ${fmtPct(rate)}（${st.hits}/${st.attempts}）`), st.meanReactionSec === null ? "–" : `${st.meanReactionSec.toFixed(1)} 秒`];
    });
  return el(
    "div",
    {},
    el("p", {}, `自己ベスト ${best} 点 ・ 直近: ${recent}`),
    table(["音", "撃ち落とした割合", "当てるまでの平均"], rows),
  );
}

export const noteGameTrainer: TrainerModule = {
  id: "note-game",
  title: "音当てゲーム（来る音を撃ち落とす）",
  summary: "五線の上を次々に来る音符を、その音を吹いて撃ち落とす",
  description:
    "右から流れてくる音符を、いちばん左のものから順に吹いて撃ち落とすゲームです。狙った音を 0.1 秒ほど保てたら命中で、左の鳥が飛んで音符がはじけます。左端の赤い線まで来られるとライフが減り、なくなると終わりです。5 個撃ち落とすごとに音符が速くなります。早く当てるほど点が高く、続けて当てると倍率が上がります。左の鳥は今吹いている音の高さに上下するので、音符より上か下かが一目で分かります。「音名を表示」を切ると五線の位置だけで読む練習になります。声で歌って遊ぶときは「判定」を「声（オクターブ違いも可）」にします。",
  order: 12,
  settingsSchema: [
    { key: "targets", label: "出題する音", type: "notes", help: "苦手な音を混ぜておくと、何度も出てきます。" },
    {
      key: "maxLeap",
      label: "続く音の跳躍",
      type: "select",
      options: [
        { value: "0", label: "制限なし" },
        { value: "7", label: "5 度以内" },
        { value: "12", label: "オクターブ以内" },
      ],
    },
    { key: "startTravelSec", label: "最初の速さ（左端に届くまで）", type: "number", min: 4, max: 15, unit: "秒", help: "小さいほど速い。5 個撃ち落とすごとに 1 割ほど速くなります。" },
    { key: "lives", label: "ライフ", type: "number", min: 1, max: 5 },
    { key: "showNames", label: "音名を表示", type: "boolean", help: "切ると五線の位置だけで読みます。" },
    { key: "reference", label: "音符が出るときに基準音を鳴らす", type: "boolean", help: "鳴っている間（約 0.7 秒）は判定しません。" },
    {
      key: "match",
      label: "判定",
      type: "select",
      options: [
        { value: "exact", label: "楽器（オクターブまで一致）" },
        { value: "pitch-class", label: "声（オクターブ違いも可）" },
      ],
    },
    { key: "tolCents", label: "合格とみなす幅", type: "number", min: 15, max: 50, unit: "¢" },
  ],
  defaultSettings: { targets: [41, 43, 46, 47, 48, 50, 53], maxLeap: "7", startTravelSec: 8, lives: 3, showNames: true, reference: false, match: "exact", tolCents: 40 },
  create: (ctx) => new NoteGameTrainer(ctx),
  renderSummary: (entries: HistoryEntry[]) => renderSummaryTable(entries.map((e) => e.data as GameRecord)),
};
