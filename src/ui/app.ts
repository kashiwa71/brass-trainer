/**
 * 画面の骨組み。ハッシュでページを切り替える。
 *  #/            ホーム（トレーナー一覧、今日のポイント、成績の要約）
 *  #/t/<id>      練習画面
 *  #/advice      アドバイス集
 *  #/settings    全体設定（チューバの調、基準ピッチ、文字の大きさ、履歴）
 *
 * 譜面台に置いたスマホを離れて見る前提: 案内文・音名・判定を大きく、開始/停止は画面下に固定、
 * 練習中は説明や設定を隠し、画面は消灯させない。
 */
import { AudioEngine } from "../core/audio/engine";
import { ToneGenerator } from "../core/audio/tone";
import { Metronome } from "../core/audio/metronome";
import { HistoryStore } from "../core/history";
import { TUBA_MODELS } from "../core/tuba";
import { WakeLock } from "../core/wakelock";
import type { TrainerRegistry, TrainerInstance, TrainerModule, SettingsValues, AppSettings } from "../core/trainer";
import { loadAppSettings, saveAppSettings, loadTrainerSettings, saveTrainerSettings } from "../core/settings";
import { dailyAdvice, type Topic } from "../content/advice";
import { el, replaceChildren } from "./dom";
import { settingsForm, TunerStrip } from "./components";
import { adviceCard, advicePage } from "./advice";

export class App {
  private readonly audio = new AudioEngine();
  private readonly history = new HistoryStore();
  private readonly wakeLock = new WakeLock();
  private appSettings: AppSettings = loadAppSettings();
  private main: HTMLElement;
  private current: { module: TrainerModule; instance: TrainerInstance; cleanup: () => void } | null = null;

  constructor(root: HTMLElement, private readonly registry: TrainerRegistry) {
    this.main = el("main", { class: "main" });
    const header = el(
      "header",
      { class: "header" },
      el("a", { href: "#/", class: "brand" }, "Brass Trainer"),
      el("div", { class: "header-links" }, el("a", { href: "#/advice" }, "アドバイス集"), el("a", { href: "#/settings", "aria-label": "設定" }, "設定 ⚙")),
    );
    replaceChildren(root, header, this.main);
    this.applyScale();
    window.addEventListener("hashchange", () => this.route());
    this.route();
  }

  private get tuba() {
    return TUBA_MODELS[this.appSettings.tubaKey];
  }

  private applyScale(): void {
    document.documentElement.dataset.scale = this.appSettings.fontScale;
  }

  private route(): void {
    this.leaveTrainer();
    window.scrollTo(0, 0);
    const hash = location.hash || "#/";
    const m = /^#\/t\/([\w-]+)$/.exec(hash);
    if (m) {
      const mod = this.registry.get(m[1]);
      if (mod) return this.renderTrainer(mod);
    }
    if (hash === "#/settings") return this.renderSettings();
    if (hash.startsWith("#/advice")) {
      const topic = /topic=([\w-]+)/.exec(hash)?.[1] as Topic | undefined;
      replaceChildren(this.main, el("h2", {}, "アドバイス集"), advicePage(topic ?? "all"));
      return;
    }
    this.renderHome();
  }

  private leaveTrainer(): void {
    if (!this.current) return;
    this.current.instance.stop();
    this.current.instance.dispose();
    this.current.cleanup();
    this.current = null;
    void this.wakeLock.release();
  }

  private renderHome(): void {
    const list = el("div", { class: "trainer-list" });
    for (const mod of this.registry.all()) {
      const entries = this.history.list(mod.id);
      const summary = mod.renderSummary?.(entries, this.tuba) ?? null;
      list.appendChild(
        el(
          "section",
          { class: "card" },
          el("a", { href: `#/t/${mod.id}`, class: "card-title" }, mod.title),
          el("p", { class: "muted" }, mod.summary),
          entries.length ? el("details", {}, el("summary", {}, `成績（${entries.length} 回）`), summary) : null,
          el("a", { href: `#/t/${mod.id}`, class: "btn primary" }, "練習する"),
        ),
      );
    }
    replaceChildren(
      this.main,
      adviceCard(dailyAdvice("general"), { compact: true, label: "今日のポイント" }),
      el("p", { class: "muted small" }, `使用楽器: ${this.tuba.label} ・ A = ${this.appSettings.a4Hz} Hz ・ 音名はドイツ音名（B = シ♭、H = シ）。音を取るのが苦手なら、上から順に「耳トレ」→「ドローン合わせ」→「音当て」の順で進めてください。`),
      list,
    );
  }

  private renderSettings(): void {
    const tubaSel = el("select");
    for (const m of Object.values(TUBA_MODELS)) {
      const o = el("option", { value: m.key }, m.label);
      if (m.key === this.appSettings.tubaKey) o.selected = true;
      tubaSel.appendChild(o);
    }
    tubaSel.addEventListener("change", () => this.updateApp({ tubaKey: tubaSel.value as AppSettings["tubaKey"] }));
    const a4 = el("input", { type: "number", min: 415, max: 466, value: String(this.appSettings.a4Hz) });
    a4.addEventListener("change", () => {
      const v = Number(a4.value);
      if (v >= 415 && v <= 466) this.updateApp({ a4Hz: v });
    });
    const scaleSel = el("select");
    for (const [v, label] of [["normal", "標準"], ["large", "大（既定）"], ["xlarge", "特大"]]) {
      const o = el("option", { value: v }, label);
      if (v === this.appSettings.fontScale) o.selected = true;
      scaleSel.appendChild(o);
    }
    scaleSel.addEventListener("change", () => {
      this.updateApp({ fontScale: scaleSel.value as AppSettings["fontScale"] });
      this.applyScale();
    });
    const exportBtn = el("button", { class: "btn", type: "button" }, "履歴を JSON で書き出す");
    exportBtn.addEventListener("click", () => {
      const blob = new Blob([this.history.exportJson()], { type: "application/json" });
      const a = el("a", { href: URL.createObjectURL(blob), download: `brass-trainer-history-${new Date().toISOString().slice(0, 10)}.json` });
      a.click();
    });
    const clearBtn = el("button", { class: "btn danger", type: "button" }, "履歴をすべて消す");
    clearBtn.addEventListener("click", () => {
      if (confirm("練習履歴をすべて削除します。よろしいですか？")) this.history.clear();
    });
    replaceChildren(
      this.main,
      el("h2", {}, "設定"),
      el(
        "div",
        { class: "settings" },
        el("label", { class: "setting-row" }, el("span", { class: "setting-label" }, "チューバの調"), tubaSel),
        el("label", { class: "setting-row" }, el("span", { class: "setting-label" }, "基準ピッチ A"), el("span", { class: "setting-control" }, a4, el("span", { class: "unit" }, "Hz"))),
        el("label", { class: "setting-row" }, el("span", { class: "setting-label" }, "文字の大きさ"), scaleSel),
      ),
      el("h3", {}, "履歴"),
      el("div", { class: "row" }, exportBtn, clearBtn),
      el("p", { class: "muted small" }, "履歴はこの端末のブラウザーにだけ保存されます。"),
    );
  }

  private updateApp(patch: Partial<AppSettings>): void {
    this.appSettings = { ...this.appSettings, ...patch };
    saveAppSettings(this.appSettings);
  }

  private renderTrainer(mod: TrainerModule): void {
    let settings: SettingsValues = loadTrainerSettings(mod.id, mod.defaultSettings);
    const status = el("div", { class: "status" }, "「開始」を押してください（マイクを使います）");
    const tunerStrip = new TunerStrip(this.appSettings.a4Hz);
    const trainerRoot = el("div", { class: "trainer-root" });
    const startBtn = el("button", { class: "btn primary big", type: "button" }, "開始");
    const stopBtn = el("button", { class: "btn big", type: "button", disabled: true }, "停止");
    const page = el("div", { class: "trainer-page" });

    const buildInstance = (): TrainerInstance => {
      const instance = mod.create({
        audio: this.audio,
        tone: new ToneGenerator(this.audio.context),
        metronome: new Metronome(this.audio.context),
        tuba: this.tuba,
        app: this.appSettings,
        settings,
        history: this.history,
        root: trainerRoot,
        setStatus: (t) => (status.textContent = t),
      });
      instance.mount();
      return instance;
    };

    let running = false;
    const settingsBox = el("details", { class: "settings-box" }, el("summary", {}, "設定"));
    const rebuildSettings = () => {
      const form = settingsForm(mod.settingsSchema, settings, this.tuba, (v) => {
        settings = v;
        saveTrainerSettings(mod.id, v);
        if (this.current && !running) {
          this.current.instance.dispose();
          this.current.instance = buildInstance();
        }
      });
      replaceChildren(settingsBox, el("summary", {}, "設定"), form);
    };
    rebuildSettings();

    const offFrame = this.audio.onFrame((f) => tunerStrip.update(f));
    const instance = buildInstance();
    this.current = { module: mod, instance, cleanup: () => offFrame() };

    startBtn.addEventListener("click", async () => {
      if (running || !this.current) return;
      startBtn.disabled = true;
      try {
        if (!this.audio.isRunning) {
          status.textContent = "マイクを準備しています…";
          await this.audio.start();
          status.textContent = "周囲の音量を測っています。1 秒間静かにしてください";
          await this.audio.calibrate(1);
        }
      } catch (e) {
        status.textContent = `マイクを使えませんでした: ${(e as Error).message}`;
        startBtn.disabled = false;
        return;
      }
      running = true;
      page.classList.add("running");
      stopBtn.disabled = false;
      void this.wakeLock.acquire();
      try {
        await this.current.instance.start();
      } finally {
        running = false;
        page.classList.remove("running");
        startBtn.disabled = false;
        stopBtn.disabled = true;
        void this.wakeLock.release();
      }
    });
    stopBtn.addEventListener("click", () => this.current?.instance.stop());

    replaceChildren(
      page,
      el("div", { class: "trainer-head" }, el("a", { href: "#/", class: "back" }, "← 一覧"), el("h2", {}, mod.title)),
      el("details", { class: "desc" }, el("summary", {}, "この練習について"), el("p", {}, mod.description)),
      settingsBox,
      tunerStrip.root,
      status,
      trainerRoot,
      el("div", { class: "controls" }, startBtn, stopBtn),
    );
    replaceChildren(this.main, page);
  }
}
