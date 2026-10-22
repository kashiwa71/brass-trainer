/**
 * 画面に出す版。値はビルド時に埋め込む（vite.config.ts の define）。
 * スマホに最新版が入ったかを確かめるのに使う。版番号は package.json を手で上げたときだけ、
 * コミット ID は新しいコミットを配信したときに変わる。ビルド日時は配信のたびに変わる。
 */
export interface BuildInfo {
  /** package.json の version */
  version: string;
  /** 短いコミット ID。git もコミットの環境変数もない場所でビルドしたときは空 */
  commit: string;
  /** ビルド日時（ISO 8601） */
  builtAt: string;
}

export const BUILD: BuildInfo = { version: __APP_VERSION__, commit: __APP_COMMIT__, builtAt: __APP_BUILT_AT__ };

/** ビルド日時を「2026/10/22 23:24」の形にする。timeZone を省くと見ている端末の時刻で出す */
export function formatBuiltAt(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/** 例: 「バージョン 0.1.0 ・ 8d2ff08 ・ 2026/10/22 23:24 ビルド」 */
export function versionLabel(info: BuildInfo, timeZone?: string): string {
  const builtAt = formatBuiltAt(info.builtAt, timeZone);
  return [`バージョン ${info.version}`, info.commit, builtAt && `${builtAt} ビルド`].filter(Boolean).join(" ・ ");
}
