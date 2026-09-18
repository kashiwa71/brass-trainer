import type { Frame } from "../../core/analysis/frames";
import { validFrames, dominantNote, midiFloat } from "../shared";

export interface AttackQuality {
  /** 落ち着いた先の音（MIDI）。取れなければ null */
  settledMidi: number | null;
  settledCents: number | null;
  /** 発音からピッチが安定するまでの時間（秒） */
  stabilizeSec: number | null;
  /** 最初に検出されたピッチの、落ち着いた先からのずれ（セント）。負ならしゃくり上げ */
  initialCents: number | null;
  /** 最初の 150 ms での最大のずれ（セント） */
  maxEarlyDevCents: number | null;
  /** 発音直後に別の倍音に触れたか */
  glitch: boolean;
  glitchMidi: number | null;
  /** 発音から音量がピーク近く（−3 dB）に達するまでの時間（秒） */
  riseSec: number | null;
  /** 0〜100 */
  score: number;
  /** 減点の内訳（表示用） */
  penalties: { label: string; points: number }[];
}

export interface AttackQualityOptions {
  /** 解析する長さ（秒） */
  spanSec?: number;
  /** 安定とみなすセント幅 */
  stableCents?: number;
}

/**
 * 出だしの質を評価する。
 * - 安定までの時間: これ以降ずっと ±stableCents に収まる最初の時刻
 * - 引っかかり: 発音後 250 ms 以内に 150 セント以上離れた音があるか
 * - 立ち上がり: 音量がピーク −3 dB に達するまでの時間
 */
export function evaluateAttack(
  frames: Frame[],
  onsetT: number,
  a4Hz: number,
  gateDb: number,
  opts: AttackQualityOptions = {},
): AttackQuality {
  const spanSec = opts.spanSec ?? 0.6;
  const stableCents = opts.stableCents ?? 20;
  const span = frames.filter((f) => f.t >= onsetT && f.t <= onsetT + spanSec);
  const valid = validFrames(span, gateDb);
  const empty: AttackQuality = {
    settledMidi: null,
    settledCents: null,
    stabilizeSec: null,
    initialCents: null,
    maxEarlyDevCents: null,
    glitch: false,
    glitchMidi: null,
    riseSec: null,
    score: 0,
    penalties: [{ label: "ピッチが検出できませんでした", points: 100 }],
  };
  if (valid.length < 3) return empty;

  // 落ち着いた先: 後半の最頻音
  const tail = valid.filter((f) => f.t >= onsetT + spanSec * 0.5);
  const settled = dominantNote(tail.length >= 3 ? tail : valid, a4Hz);
  if (!settled) return empty;
  const settledFloat = settled.midi + settled.cents / 100;

  const dev = (f: Frame) => (midiFloat(f.hz as number, a4Hz) - settledFloat) * 100;

  // 安定までの時間
  let stabilizeSec: number | null = null;
  for (let i = 0; i < valid.length; i++) {
    let ok = true;
    for (let j = i; j < valid.length; j++) {
      if (Math.abs(dev(valid[j])) > stableCents) {
        ok = false;
        break;
      }
    }
    if (ok) {
      stabilizeSec = Math.max(0, valid[i].t - onsetT);
      break;
    }
  }

  const initialCents = dev(valid[0]);
  const early = valid.filter((f) => f.t <= onsetT + 0.15);
  const maxEarlyDevCents = early.length ? Math.max(...early.map((f) => Math.abs(dev(f)))) : null;

  let glitch = false;
  let glitchMidi: number | null = null;
  for (const f of valid) {
    if (f.t > onsetT + 0.25) break;
    if (Math.abs(dev(f)) >= 150) {
      glitch = true;
      glitchMidi = Math.round(midiFloat(f.hz as number, a4Hz));
      break;
    }
  }

  // 立ち上がり
  const peakDb = Math.max(...span.map((f) => f.db));
  let riseSec: number | null = null;
  for (const f of span) {
    if (f.db >= peakDb - 3) {
      riseSec = Math.max(0, f.t - onsetT);
      break;
    }
  }

  const penalties: { label: string; points: number }[] = [];
  if (stabilizeSec === null) penalties.push({ label: "最後まで安定しなかった", points: 40 });
  else if (stabilizeSec > 0.06) penalties.push({ label: `安定まで ${Math.round(stabilizeSec * 1000)} ms`, points: Math.min(40, Math.round((stabilizeSec - 0.06) * 1000 / 3)) });
  if (glitch) penalties.push({ label: "別の倍音に引っかかった", points: 30 });
  if (Math.abs(initialCents) > 30 && !glitch) {
    penalties.push({ label: initialCents < 0 ? "下からしゃくり上げた" : "上から入った", points: Math.min(20, Math.round((Math.abs(initialCents) - 30) / 2)) });
  }
  if (riseSec !== null && riseSec > 0.12) penalties.push({ label: `音量の立ち上がりが遅い（${Math.round(riseSec * 1000)} ms）`, points: Math.min(10, Math.round((riseSec - 0.12) * 100)) });

  const score = Math.max(0, Math.min(100, 100 - penalties.reduce((a, p) => a + p.points, 0)));
  return {
    settledMidi: settled.midi,
    settledCents: settled.cents,
    stabilizeSec,
    initialCents,
    maxEarlyDevCents,
    glitch,
    glitchMidi,
    riseSec,
    score,
    penalties,
  };
}
