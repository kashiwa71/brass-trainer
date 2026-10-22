/**
 * YIN 法によるピッチ検出（de Cheveigné & Kawahara, 2002）。
 * チューバの低音（約 40 Hz）まで検出できるよう、呼び出し側で十分な窓長を確保すること。
 */

export interface YinOptions {
  sampleRate: number;
  minHz: number;
  maxHz: number;
  /** 累積平均正規化差分関数の閾値。小さいほど厳しい。 */
  threshold?: number;
}

export interface YinResult {
  /** 検出した基本周波数。検出できなければ null。 */
  hz: number | null;
  /** 0〜1。1 に近いほど周期性がはっきりしている。 */
  clarity: number;
}

export function yin(buffer: Float32Array, opts: YinOptions): YinResult {
  const { sampleRate, minHz, maxHz, threshold = 0.15 } = opts;
  const n = buffer.length;
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(Math.floor(sampleRate / minHz), Math.floor(n / 2));
  if (tauMax <= tauMin) return { hz: null, clarity: 0 };

  const w = n - tauMax; // 差分をとる区間の長さ
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < w; i++) {
      const diff = buffer[i] - buffer[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // 累積平均正規化差分関数
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    cmnd[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
  }

  // 周期的な音では、本当の周期の 2 倍・3 倍（1 オクターブ下、12 度下）にもほぼ同じ深さの谷が並ぶ。
  // 雑音や強奏で谷が浅くなると深さの順位がフレームごとに入れ替わるので、いちばん深い谷を採ると
  // 倍数の間を飛び回る。いちばん深い谷に近い深さの谷のうち、周期が最も短いものを採る。
  // 雑音で谷の底が細かく割れることがあるので、基準を下回り続ける区間の中で最も深い点を底とする。
  let deepest = Infinity;
  for (let t = tauMin; t <= tauMax; t++) deepest = Math.min(deepest, cmnd[t]);
  const level = Math.max(threshold, deepest * 1.2 + 0.03);
  let tau = tauMin;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] > level) continue;
    tau = t;
    while (t + 1 <= tauMax && cmnd[t + 1] <= level) if (cmnd[++t] < cmnd[tau]) tau = t;
    break;
  }
  if (1 - cmnd[tau] < 0.5) return { hz: null, clarity: Math.max(0, 1 - cmnd[tau]) };

  // オクターブ誤検出の補正: 低音のチューバは第 2 倍音が強く、半分の周期で谷ができやすい。
  // 2τ の谷が τ の谷より明らかに深ければ、2τ（1 オクターブ下）を採用する。
  // 強奏の実音では τ の谷が十分深くても 2τ の谷がさらに深く出る（差は 0.03 未満）ことがあるので、
  // 比ではなく深さの差で見る。雑音で谷全体が浅いときは、差の基準も大きくする。
  if (tau * 2 + 2 <= tauMax) {
    let t2 = tau * 2;
    for (let t = tau * 2 - 2; t <= tau * 2 + 2; t++) if (cmnd[t] < cmnd[t2]) t2 = t;
    if (cmnd[tau] - cmnd[t2] > Math.max(0.05, cmnd[tau] * 0.25)) tau = t2;
  }

  // 放物線補間で τ を細かくする
  let refined = tau;
  if (tau > 1 && tau < tauMax) {
    const s0 = cmnd[tau - 1];
    const s1 = cmnd[tau];
    const s2 = cmnd[tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) refined = tau + (s2 - s0) / denom;
  }
  return { hz: sampleRate / refined, clarity: Math.max(0, 1 - cmnd[tau]) };
}

/** 実効値を dBFS で返す。無音は -Infinity ではなく下限値で返す。 */
export function rmsDb(buffer: Float32Array, floorDb = -100): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  const rms = Math.sqrt(sum / buffer.length);
  if (rms <= 0) return floorDb;
  return Math.max(floorDb, 20 * Math.log10(rms));
}
