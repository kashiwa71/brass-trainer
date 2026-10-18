/**
 * 音当てゲームの画面（SVG）。ヘ音記号の五線の上を、的の音符が右から左へ流れてくる。
 * 左のレールにいる鳥は、いま吹いている音の高さに上下する（五線上の位置で狙いが分かる）。
 * 命中すると鳥が的まで飛んで的がはじける。
 */
import { bassClefPosition, noteName, spell } from "../../core/notes";
import { svg, bassClef, wholeNote, flat, yOf, HALF } from "../../ui/staff";
import type { GameModel, Target } from "./evaluate";

const W = 210;
const RAIL_X = 46;
/** 的がこの線に届いたらライフを失う */
const DANGER_X = 62;
const SPAWN_X = W + 14;

interface Effect {
  node: SVGElement;
  t0: number;
  dur: number;
  update(p: number): void;
}

/** 半音の途中も滑らかに動かすための、五線上の連続した位置 */
function continuousPosition(midiF: number): number {
  const lo = Math.floor(midiF);
  const a = bassClefPosition(lo);
  return a + (midiF - lo) * (bassClefPosition(lo + 1) - a);
}

export class GameField {
  readonly root: SVGSVGElement;
  private targetsLayer: SVGGElement;
  private effectsLayer: SVGGElement;
  private bird: SVGGElement;
  private aimLine: SVGLineElement;
  private sprites = new Map<number, SVGGElement>();
  private effects: Effect[] = [];
  private birdY = yOf(0);
  private readonly topPos: number;
  private readonly bottomPos: number;

  constructor(
    pool: number[],
    private readonly showNames: boolean,
  ) {
    const positions = pool.map((m) => bassClefPosition(m));
    // 音名は音符（五線より下なら第 5 線）の上に書くので、その分の余白を取る
    this.topPos = Math.max(4, ...positions) + (showNames ? 6 : 2);
    this.bottomPos = Math.min(-4, ...positions) - 3;
    const vbTop = yOf(this.topPos);
    const height = (this.topPos - this.bottomPos) * HALF;
    this.root = svg("svg", { viewBox: `0 ${vbTop} ${W} ${height}`, class: "game-svg", role: "img", "aria-label": "音当てゲームの画面" });
    this.root.style.aspectRatio = `${W} / ${height}`;

    const lines = svg("g", { class: "staff-lines" });
    for (let p = -4; p <= 4; p += 2) lines.appendChild(svg("line", { x1: 0, y1: yOf(p), x2: W, y2: yOf(p) }));
    this.root.appendChild(lines);
    this.root.appendChild(bassClef(3));
    this.root.appendChild(svg("line", { class: "game-rail", x1: RAIL_X, y1: vbTop, x2: RAIL_X, y2: vbTop + height }));
    this.root.appendChild(svg("line", { class: "game-danger", x1: DANGER_X, y1: vbTop, x2: DANGER_X, y2: vbTop + height }));
    this.aimLine = svg("line", { class: "game-aim", x1: RAIL_X, x2: W, y1: 0, y2: 0 });
    this.root.appendChild(this.aimLine);
    this.targetsLayer = svg("g");
    this.effectsLayer = svg("g");
    this.root.appendChild(this.targetsLayer);
    this.bird = this.makeBird();
    this.root.appendChild(this.bird);
    this.root.appendChild(this.effectsLayer);
    this.setAim(null, false);
  }

  /** いま吹いている音（MIDI の小数）。無音なら null。on は先頭の的に合っているか */
  setAim(midiF: number | null, on: boolean): void {
    this.bird.classList.toggle("idle", midiF === null);
    this.bird.classList.toggle("on", midiF !== null && on);
    this.aimLine.classList.toggle("on", midiF !== null && on);
    this.aimLine.style.visibility = midiF === null ? "hidden" : "visible";
    if (midiF === null) return;
    const pos = Math.max(this.bottomPos + 1, Math.min(this.topPos - 1, continuousPosition(midiF)));
    this.birdY = yOf(pos);
    this.bird.setAttribute("transform", `translate(${RAIL_X} ${this.birdY})`);
    this.aimLine.setAttribute("y1", String(this.birdY));
    this.aimLine.setAttribute("y2", String(this.birdY));
  }

  render(model: GameModel, t: number): void {
    const alive = new Set<number>();
    model.targets.forEach((target, i) => {
      alive.add(target.id);
      let sprite = this.sprites.get(target.id);
      if (!sprite) {
        sprite = this.makeTarget(target);
        this.sprites.set(target.id, sprite);
        this.targetsLayer.appendChild(sprite);
      }
      sprite.classList.toggle("front", i === 0);
      sprite.setAttribute("transform", `translate(${this.xOf(model.progress(target, t))} 0)`);
    });
    for (const [id, sprite] of this.sprites) {
      if (alive.has(id)) continue;
      sprite.remove();
      this.sprites.delete(id);
    }
    this.effects = this.effects.filter((e) => {
      const p = (t - e.t0) / e.dur;
      if (p >= 1) {
        e.node.remove();
        return false;
      }
      // 始まる前（鳥が飛んでいる間のはじける演出など）は隠したままにする
      if (p >= 0) e.update(p);
      return true;
    });
  }

  /** 鳥を的まで飛ばし、的をはじけさせる */
  shoot(target: Target, progress: number, points: number, t: number): void {
    const x1 = this.xOf(progress);
    const y1 = yOf(bassClefPosition(target.midi));
    const x0 = RAIL_X;
    const y0 = this.birdY;
    const flyer = this.makeBird();
    flyer.classList.add("on");
    const flyDur = 0.25;
    this.addEffect(flyer, t, flyDur, (p) => {
      const x = x0 + (x1 - x0) * p;
      // 放物線（少し上に膨らませる）
      const y = y0 + (y1 - y0) * p - 22 * p * (1 - p);
      flyer.setAttribute("transform", `translate(${x} ${y})`);
    });
    const burst = svg("circle", { class: "game-burst", cx: x1, cy: y1, r: 4 });
    this.addEffect(burst, t + flyDur, 0.45, (p) => {
      burst.setAttribute("r", String(6 + 22 * p));
      burst.style.opacity = String(1 - p);
    });
    burst.style.opacity = "0";
    const text = svg("text", { class: "game-points", x: x1, y: y1, "text-anchor": "middle" });
    text.textContent = `+${points}`;
    text.style.opacity = "0";
    this.addEffect(text, t + flyDur, 0.9, (p) => {
      text.setAttribute("y", String(y1 - 10 - 18 * p));
      text.style.opacity = String(1 - p * p);
    });
  }

  /** 的が左端に届いた */
  escape(target: Target, t: number): void {
    const y = yOf(bassClefPosition(target.midi));
    const g = this.makeTarget(target);
    g.classList.add("escaped");
    g.setAttribute("transform", `translate(${DANGER_X} 0)`);
    this.addEffect(g, t, 0.7, (p) => {
      g.style.opacity = String(1 - p);
    });
    const text = svg("text", { class: "game-points ng", x: DANGER_X + 14, y: y - 10, "text-anchor": "middle" });
    text.textContent = "×";
    this.addEffect(text, t, 0.7, (p) => {
      text.style.opacity = String(1 - p);
    });
    this.root.classList.remove("shake");
    // アニメーションをやり直すため、再計算させてから付け直す
    void this.root.getBoundingClientRect();
    this.root.classList.add("shake");
  }

  private addEffect(node: SVGElement, t0: number, dur: number, update: (p: number) => void): void {
    this.effectsLayer.appendChild(node);
    this.effects.push({ node, t0, dur, update });
  }

  private xOf(progress: number): number {
    return SPAWN_X - (SPAWN_X - DANGER_X) * Math.max(0, Math.min(1, progress));
  }

  private makeTarget(target: Target): SVGGElement {
    const pos = bassClefPosition(target.midi);
    const y = yOf(pos);
    const g = svg("g", { class: "game-target staff-note" });
    for (let p = -6; p >= pos; p -= 2) g.appendChild(svg("line", { class: "staff-ledger", x1: -12, y1: yOf(p), x2: 12, y2: yOf(p) }));
    for (let p = 6; p <= pos; p += 2) g.appendChild(svg("line", { class: "staff-ledger", x1: -12, y1: yOf(p), x2: 12, y2: yOf(p) }));
    g.appendChild(svg("circle", { class: "game-ring", cx: 0, cy: y, r: 12 }));
    if (spell(target.midi).accidental === -1) g.appendChild(flat(-18, y));
    g.appendChild(wholeNote(0, y));
    if (this.showNames) {
      const label = svg("text", { class: "game-label", x: 0, y: yOf(Math.max(pos, 4) + 3), "text-anchor": "middle" });
      label.textContent = noteName(target.midi);
      g.appendChild(label);
    }
    return g;
  }

  private makeBird(): SVGGElement {
    const g = svg("g", { class: "game-bird", transform: `translate(${RAIL_X} ${this.birdY})` });
    g.appendChild(svg("path", { class: "game-bird-beak", d: "M 4.5,-1.6 L 9.5,0.4 L 4.5,2.4 Z" }));
    g.appendChild(svg("circle", { class: "game-bird-body", cx: 0, cy: 0, r: 5.5 }));
    g.appendChild(svg("circle", { class: "game-bird-eye", cx: 2.2, cy: -1.6, r: 1.3 }));
    return g;
  }
}
