/** 解析フレーム。音声解析ワーカーから一定間隔（約 10 ms）で送られる。 */
export interface Frame {
  /** AudioContext 時刻（秒）。メトロノームと同じ時計。 */
  t: number;
  /** 基本周波数（Hz）。無音や不明瞭なときは null。 */
  hz: number | null;
  /** 音量（dBFS） */
  db: number;
  /** 周期性の明瞭さ 0〜1 */
  clarity: number;
}
