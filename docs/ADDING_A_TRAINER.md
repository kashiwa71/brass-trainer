# トレーナーの追加方法

練習モード（トレーナー）は `src/trainers/<id>/` に 1 つずつ置き、`src/trainers/index.ts` に登録します。
アプリ本体（マイク入力、ピッチ検出、メトロノーム、履歴、設定画面）は共通部品なので、トレーナー側は「何を出題し、どう判定し、何を表示するか」だけを書きます。

## 手順

1. `src/trainers/<id>/evaluate.ts` に判定ロジックを**純粋関数**で書く（フレーム列 → 結果）。
   ここは DOM や音声に依存させず、`tests/` で単体テストします。
2. `src/trainers/<id>/index.ts` に `TrainerModule` を実装する。
3. `src/trainers/index.ts` の `registry` に `.register(...)` を 1 行足す。

## TrainerModule の要点（`src/core/trainer.ts`）

| 項目 | 役割 |
| --- | --- |
| `id` | URL（`#/t/<id>`）と保存キーに使う。変えると履歴が別扱いになる |
| `settingsSchema` / `defaultSettings` | 設定画面が自動生成される。型は number / select / boolean / note / notes |
| `create(ctx)` | `TrainerInstance`（`mount` / `start` / `stop` / `dispose`）を返す |
| `renderSummary` | ホーム画面に出す成績の要約（省略可） |

`TrainerContext` から使えるもの:

- `ctx.audio` — マイク入力。`onFrame` でフレーム（時刻・周波数・音量・明瞭さ）を受け取る。`gateDb` が発音判定の音量閾値
- `ctx.tone` — 基準音の再生
- `ctx.metronome` — メトロノーム。`onBeat` で拍の予定時刻（AudioContext 時刻）を受け取る
- `ctx.tuba` — 楽器モデル（倍音列・運指）
- `ctx.history` — 結果の保存 `add(id, data)` と取得 `list(id)`
- `ctx.root` — トレーナーが自由に描画してよい領域
- `ctx.setStatus(text)` — 画面上部の案内文

## よく使う部品

- `Runner`（`src/trainers/shared.ts`）: 停止ボタンで中断できる `sleep` / `waitForOnset` / `collectUntil`
- `OnsetDetector`（`src/core/analysis/onset.ts`）: 発音の検出
- `segmentNotes`（`src/core/analysis/segments.ts`）: フレーム列を「音」の区間に分ける（スラー向け）
- `judgeAttack` / `evaluateAttack` / `evaluateSlur` / `evaluateTonguing`: 既存の判定関数。組み合わせて新しい練習を作れる
- `noteCard` / `pitchGraph` / `table`（`src/ui/components.ts`）: 表示部品

## 最小の例

```ts
// src/trainers/long-tone/index.ts
import type { TrainerModule } from "../../core/trainer";
import { el, replaceChildren } from "../../ui/dom";
import { Runner } from "../shared";

export const longToneTrainer: TrainerModule = {
  id: "long-tone",
  title: "ロングトーン",
  summary: "一定のピッチと音量を保つ",
  description: "…",
  order: 50,
  settingsSchema: [{ key: "seconds", label: "長さ", type: "number", min: 2, max: 30, unit: "秒" }],
  defaultSettings: { seconds: 8 },
  create(ctx) {
    let runner: Runner | null = null;
    return {
      mount() { replaceChildren(ctx.root, el("p", {}, "開始を押して音を伸ばしてください")); },
      async start() {
        runner = new Runner();
        const onset = await runner.waitForOnset(ctx.audio, { timeoutMs: 20000 });
        if (onset === null) return;
        const frames = await runner.collectUntil(ctx.audio, onset + Number(ctx.settings.seconds), onset);
        // frames を評価して ctx.history.add("long-tone", result) し、ctx.root に表示する
      },
      stop() { runner?.abort(); },
      dispose() { runner?.abort(); },
    };
  },
};
```
