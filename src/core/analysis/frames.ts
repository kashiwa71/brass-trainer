/** 解析フレーム。音声解析ワーカーから一定間隔（約 10 ms）で送られる。 */
export interface Frame {
  /** AudioContext 時刻（秒）。メトロノームと同じ時計。 */
  t: number;
  /** 基本周波数（Hz）。無音や不明瞭なときは null。 */
  hz: number | null;
  /** 音量（dBFS）。解析窓（約 85 ms）全体の実効値 */
  db: number;
  /** 直近約 10 ms の音量（dBFS）。タンギングの切れ目など短い変化を見るのに使う */
  dbFast: number;
  /** 周期性の明瞭さ 0〜1 */
  clarity: number;
}
