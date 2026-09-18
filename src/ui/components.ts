import { el, append, fmtCents, type Child } from "./dom";
import type { SettingField, SettingsValues } from "../core/trainer";
import type { TubaModel } from "../core/tuba";
import { practiceNotes, fingeringsFor, fingeringLabel } from "../core/tuba";
import { noteName, hzToNote } from "../core/notes";
import type { Frame } from "../core/analysis/frames";

/** SettingField の定義から設定フォームを生成する。値の変更は onChange で通知する。 */
export function settingsForm(
  schema: SettingField[],
  values: SettingsValues,
  tuba: TubaModel,
  onChange: (values: SettingsValues) => void,
): HTMLElement {
  const form = el("div", { class: "settings" });
  const notes = practiceNotes(tuba);
  for (const field of schema) {
    const row = el("label", { class: "setting-row" });
    append(row, el("span", { class: "setting-label" }, field.label));
    let control: HTMLElement;
    switch (field.type) {
      case "number": {
        const input = el("input", {
          type: "number",
          min: field.min,
          max: field.max,
          step: field.step ?? 1,
          value: String(values[field.key]),
        });
        input.addEventListener("change", () => {
          const v = Number(input.value);
          if (!Number.isNaN(v)) onChange({ ...values, [field.key]: Math.max(field.min, Math.min(field.max, v)) });
        });
        control = el("span", { class: "setting-control" }, input, field.unit ? el("span", { class: "unit" }, field.unit) : null);
        break;
      }
      case "select": {
        const sel = el("select");
        for (const o of field.options) {
          const opt = el("option", { value: o.value }, o.label);
          if (String(values[field.key]) === o.value) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener("change", () => onChange({ ...values, [field.key]: sel.value }));
        control = sel;
        break;
      }
      case "boolean": {
        const cb = el("input", { type: "checkbox" });
        cb.checked = Boolean(values[field.key]);
        cb.addEventListener("change", () => onChange({ ...values, [field.key]: cb.checked }));
        control = cb;
        break;
      }
      case "note": {
        const sel = el("select");
        for (const n of notes) {
          const opt = el("option", { value: String(n.midi) }, n.name);
          if (Number(values[field.key]) === n.midi) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener("change", () => onChange({ ...values, [field.key]: Number(sel.value) }));
        control = sel;
        break;
      }
      case "notes": {
        const selected = new Set((values[field.key] as number[]) ?? []);
        const grid = el("div", { class: "note-grid" });
        for (const n of notes) {
          const btn = el("button", { type: "button", class: `chip${selected.has(n.midi) ? " on" : ""}` }, n.name);
          btn.addEventListener("click", () => {
            if (selected.has(n.midi)) selected.delete(n.midi);
            else selected.add(n.midi);
            btn.classList.toggle("on", selected.has(n.midi));
            onChange({ ...values, [field.key]: [...selected].sort((a, b) => a - b) });
          });
          grid.appendChild(btn);
        }
        control = grid;
        break;
      }
    }
    append(row, control);
    if (field.help) append(row, el("small", { class: "help" }, field.help));
    form.appendChild(row);
  }
  return form;
}

/** 現在のピッチ・音量を表示する帯 */
export class TunerStrip {
  readonly root: HTMLElement;
  private nameEl: HTMLElement;
  private centsEl: HTMLElement;
  private needle: HTMLElement;
  private level: HTMLElement;

  constructor(private readonly a4Hz: number) {
    this.nameEl = el("div", { class: "tuner-name" }, "–");
    this.centsEl = el("div", { class: "tuner-cents" }, "");
    this.needle = el("div", { class: "tuner-needle" });
    this.level = el("div", { class: "level-bar" });
    this.root = el(
      "div",
      { class: "tuner" },
      this.nameEl,
      el("div", { class: "tuner-scale" }, el("div", { class: "tuner-center" }), this.needle),
      this.centsEl,
      el("div", { class: "level" }, this.level),
    );
  }

  update(f: Frame): void {
    const lvl = Math.max(0, Math.min(1, (f.db + 70) / 70));
    this.level.style.width = `${lvl * 100}%`;
    if (f.hz === null || f.clarity < 0.5) {
      this.nameEl.textContent = "–";
      this.centsEl.textContent = "";
      this.needle.style.left = "50%";
      this.root.classList.remove("in-tune");
      return;
    }
    const { midi, cents } = hzToNote(f.hz, this.a4Hz);
    this.nameEl.textContent = noteName(midi);
    this.centsEl.textContent = `${fmtCents(cents)} ¢`;
    this.needle.style.left = `${50 + cents}%`;
    this.root.classList.toggle("in-tune", Math.abs(cents) <= 10);
  }
}

/** 短時間のピッチ推移を描くグラフ（出だしの解析用） */
export function pitchGraph(
  frames: Frame[],
  opts: { a4Hz: number; targetMidi: number; startT: number; durationSec: number; gateDb: number },
): HTMLCanvasElement {
  const w = 600;
  const h = 200;
  const canvas = el("canvas", { width: w, height: h, class: "pitch-graph" });
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const centsRange = 300; // ±300 セント（上下の倍音まで見える）
  const yOf = (cents: number) => h / 2 - (cents / centsRange) * (h / 2);
  const xOf = (t: number) => ((t - opts.startT) / opts.durationSec) * w;

  ctx.fillStyle = "#101418";
  ctx.fillRect(0, 0, w, h);
  // 目標音のライン
  ctx.strokeStyle = "#4caf50";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, yOf(0));
  ctx.lineTo(w, yOf(0));
  ctx.stroke();
  // ±25 セントの帯
  ctx.fillStyle = "rgba(76,175,80,0.12)";
  ctx.fillRect(0, yOf(25), w, yOf(-25) - yOf(25));
  // 100 ms ごとの目盛
  ctx.strokeStyle = "#2a3238";
  for (let t = 0; t <= opts.durationSec; t += 0.1) {
    ctx.beginPath();
    ctx.moveTo(xOf(opts.startT + t), 0);
    ctx.lineTo(xOf(opts.startT + t), h);
    ctx.stroke();
  }
  // ピッチ
  ctx.fillStyle = "#ffd54f";
  for (const f of frames) {
    if (f.hz === null || f.db < opts.gateDb || f.clarity < 0.5) continue;
    const cents = (hzToNote(f.hz, opts.a4Hz).midi - opts.targetMidi) * 100 + hzToNote(f.hz, opts.a4Hz).cents;
    if (Math.abs(cents) > centsRange) continue;
    ctx.beginPath();
    ctx.arc(xOf(f.t), yOf(cents), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // 音量
  ctx.strokeStyle = "rgba(120,160,255,0.7)";
  ctx.beginPath();
  let started = false;
  for (const f of frames) {
    const y = h - ((f.db + 70) / 70) * (h * 0.4);
    if (!started) {
      ctx.moveTo(xOf(f.t), y);
      started = true;
    } else ctx.lineTo(xOf(f.t), y);
  }
  ctx.stroke();
  return canvas;
}

/** 目標音の情報カード（音名・運指・上下の倍音） */
export function noteCard(tuba: TubaModel, midi: number, extra?: Child[]): HTMLElement {
  const fs = fingeringsFor(tuba, midi).filter((f) => f.preferred).slice(0, 2);
  const fingerText = fs.length ? fs.map((f) => `${fingeringLabel(f)}（第${f.partial}倍音）`).join(" / ") : "運指なし";
  const card = el(
    "div",
    { class: "note-card" },
    el("div", { class: "note-big" }, noteName(midi)),
    el("div", { class: "note-sub" }, fingerText),
  );
  if (extra) append(card, ...extra);
  return card;
}


/** 簡単な表を作る */
export function table(headers: string[], rows: Child[][]): HTMLElement {
  const t = el("table", { class: "table" });
  const thead = el("thead");
  thead.appendChild(el("tr", {}, ...headers.map((h) => el("th", {}, h))));
  const tbody = el("tbody");
  for (const r of rows) tbody.appendChild(el("tr", {}, ...r.map((c) => el("td", {}, c))));
  append(t, thead, tbody);
  return t;
}


/** 目標音に対する高低を大きく示す針（歌・ドローン合わせ用）。cents は目標からのずれ。 */
export class PitchNeedle {
  readonly root: HTMLElement;
  private arrow: HTMLElement;
  private text: HTMLElement;
  private needle: HTMLElement;

  constructor(private readonly range = 100) {
    this.arrow = el("div", { class: "needle-arrow" }, "");
    this.text = el("div", { class: "needle-text" }, "声を聴いています…");
    this.needle = el("div", { class: "needle-mark" });
    this.root = el(
      "div",
      { class: "needle" },
      this.arrow,
      el("div", { class: "needle-scale" }, el("div", { class: "needle-zone" }), el("div", { class: "needle-center" }), this.needle),
      this.text,
    );
  }

  update(cents: number | null, tol: number): void {
    if (cents === null) {
      this.arrow.textContent = "";
      this.text.textContent = "音が聞こえません";
      this.needle.style.left = "50%";
      this.root.classList.remove("ok", "high", "low");
      return;
    }
    const clamped = Math.max(-this.range, Math.min(this.range, cents));
    this.needle.style.left = `${50 + (clamped / this.range) * 50}%`;
    const ok = Math.abs(cents) <= tol;
    this.root.classList.toggle("ok", ok);
    this.root.classList.toggle("high", !ok && cents > 0);
    this.root.classList.toggle("low", !ok && cents < 0);
    if (ok) {
      this.arrow.textContent = "●";
      this.text.textContent = "合っています";
    } else if (cents > 0) {
      this.arrow.textContent = "↓";
      this.text.textContent = `高い（${Math.round(cents)} ¢）下げる`;
    } else {
      this.arrow.textContent = "↑";
      this.text.textContent = `低い（${Math.round(-cents)} ¢）上げる`;
    }
  }
}
