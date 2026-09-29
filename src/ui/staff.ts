/**
 * ヘ音記号の五線譜に全音符を描く（SVG）。
 * 音名だけでなく、五線上の位置で音の高さをつかめるようにする。
 * 色は CSS（.staff 以下のクラス）で決める。線と音符は currentColor。
 */
import { bassClefPosition, spell } from "../core/notes";

export interface StaffNote {
  midi: number;
  /** 音符に付けるクラス（"active" "faded" "ok" "ng" など） */
  cls?: string;
  /** 音符の下に出す短い文字（「目標」など） */
  label?: string;
}

const NS = "http://www.w3.org/2000/svg";
/** 線の間隔 */
const SP = 10;
/** 位置 1 つ分（線と間の差）の高さ */
const HALF = SP / 2;
const CLEF_W = 40;
const NOTE_GAP = 38;
const FIRST_NOTE_X = CLEF_W + 22;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const yOf = (pos: number) => -pos * HALF;

/** ヘ音記号。第 4 線（F3）を 2 つの点ではさむ。 */
function bassClef(x: number): SVGGElement {
  const g = svg("g", { class: "staff-clef", transform: `translate(${x} 0)` });
  const fLine = yOf(2);
  g.appendChild(
    svg("path", {
      d:
        `M 1.2,${fLine - 1.5} C 2,-21.5 21,-24 23,-12 C 24.5,-1 15,11 0.5,19 ` +
        `L 0,17.8 C 11,9.5 17.5,0 17,-12 C 16.4,-19.5 6.5,-20.5 4.6,${fLine - 3}`,
    }),
  );
  g.appendChild(svg("circle", { cx: 4.6, cy: fLine + 0.4, r: 4.1 }));
  g.appendChild(svg("circle", { cx: 29, cy: yOf(3), r: 1.9 }));
  g.appendChild(svg("circle", { cx: 29, cy: yOf(1), r: 1.9 }));
  return g;
}

/** 全音符の符頭。斜めの穴を evenodd で抜く。 */
function wholeNote(cx: number, cy: number): SVGPathElement {
  const rx = 8.2;
  const ry = 5.2;
  const hrx = 4.3;
  const hry = 2.6;
  const deg = -58;
  const t = (deg * Math.PI) / 180;
  const dx = hrx * Math.cos(t);
  const dy = hrx * Math.sin(t);
  const d =
    `M ${cx - rx},${cy} A ${rx} ${ry} 0 1 0 ${cx + rx},${cy} A ${rx} ${ry} 0 1 0 ${cx - rx},${cy} Z ` +
    `M ${cx + dx},${cy + dy} A ${hrx} ${hry} ${deg} 1 0 ${cx - dx},${cy - dy} A ${hrx} ${hry} ${deg} 1 0 ${cx + dx},${cy + dy} Z`;
  return svg("path", { d, "fill-rule": "evenodd", class: "staff-head" });
}

function flat(x: number, y: number): SVGGElement {
  const g = svg("g", { class: "staff-acc" });
  g.appendChild(svg("path", { d: `M ${x},${y - 16} L ${x},${y + 5}`, "stroke-width": 1.8, fill: "none" }));
  g.appendChild(svg("path", { d: `M ${x},${y + 5} C ${x + 10},${y} ${x + 8},${y - 7.5} ${x},${y - 2} L ${x},${y} C ${x + 5},${y - 4.5} ${x + 6},${y + 0.5} ${x},${y + 5} Z` }));
  return g;
}

function natural(x: number, y: number): SVGGElement {
  const g = svg("g", { class: "staff-acc" });
  g.appendChild(svg("path", { d: `M ${x},${y - 13} L ${x},${y + 5.5} M ${x + 6},${y - 5.5} L ${x + 6},${y + 13}`, "stroke-width": 1.4, fill: "none" }));
  g.appendChild(svg("path", { d: `M ${x},${y - 3} L ${x + 6},${y - 5.5} M ${x},${y + 5.5} L ${x + 6},${y + 3}`, "stroke-width": 3, fill: "none" }));
  return g;
}

/**
 * 五線譜を描く。notes は左から順に並べる。
 * 同じ段の中で、前に ♭ が付いた線・間に ♭ のない音が来たら ♮ を付ける。
 */
export function staff(notes: StaffNote[], opts: { className?: string; ariaLabel?: string } = {}): SVGSVGElement {
  const positions = notes.map((n) => bassClefPosition(n.midi));
  const hasLabel = notes.some((n) => n.label);
  const top = Math.max(4, ...positions.map((p, i) => p + (spell(notes[i].midi).accidental ? 4 : 2))) + 1.5;
  const bottom = Math.min(-4, ...positions) - 2.5 - (hasLabel ? 4 : 0);
  const width = FIRST_NOTE_X + Math.max(notes.length - 1, 0) * NOTE_GAP + 18;
  const vbTop = yOf(top);
  const height = (top - bottom) * HALF;

  const root = svg("svg", {
    viewBox: `0 ${vbTop} ${width} ${height}`,
    class: `staff${opts.className ? ` ${opts.className}` : ""}`,
    role: "img",
  });
  root.style.width = `calc(${width} * var(--staff-u))`;
  root.style.aspectRatio = `${width} / ${height}`;
  if (opts.ariaLabel) root.setAttribute("aria-label", opts.ariaLabel);

  const lines = svg("g", { class: "staff-lines" });
  for (let p = -4; p <= 4; p += 2) lines.appendChild(svg("line", { x1: 0, y1: yOf(p), x2: width, y2: yOf(p) }));
  root.appendChild(lines);
  root.appendChild(bassClef(3));

  const altered = new Map<number, number>();
  notes.forEach((n, i) => {
    const pos = positions[i];
    const { accidental } = spell(n.midi);
    const cx = FIRST_NOTE_X + i * NOTE_GAP;
    const cy = yOf(pos);
    const g = svg("g", { class: `staff-note${n.cls ? ` ${n.cls}` : ""}`, "data-i": i });
    // 加線
    for (let p = -6; p >= pos; p -= 2) g.appendChild(svg("line", { class: "staff-ledger", x1: cx - 12, y1: yOf(p), x2: cx + 12, y2: yOf(p) }));
    for (let p = 6; p <= pos; p += 2) g.appendChild(svg("line", { class: "staff-ledger", x1: cx - 12, y1: yOf(p), x2: cx + 12, y2: yOf(p) }));
    if (accidental === -1) g.appendChild(flat(cx - 18, cy));
    else if (altered.get(pos)) g.appendChild(natural(cx - 19, cy));
    altered.set(pos, accidental);
    g.appendChild(wholeNote(cx, cy));
    if (n.label) {
      const ly = yOf(Math.min(-4, ...positions) - 3.5);
      const text = svg("text", { x: cx, y: ly, class: "staff-label", "text-anchor": "middle" });
      text.textContent = n.label;
      g.appendChild(text);
    }
    root.appendChild(g);
  });
  return root;
}
