/**
 * 楽器なしで各トレーナーの動作を確かめる。合成音（e2e/*.wav）を Chromium の疑似マイクとして流す。
 *
 *   python3 e2e/make-wavs.py
 *   npm run build && npx vite preview --port 4173 &
 *   npx playwright-core ... は不要。playwright-core と Chromium があればよい:
 *   CHROME=/path/to/chrome node e2e/run.mjs note-attack   （note-attack | attack-quality | lip-slur | tonguing）
 *   DURATION_MS=30000 で観察時間を変えられる。結果は標準出力と e2e/<scenario>.png に出る。
 */
import { chromium } from "playwright-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const base = process.env.BASE_URL ?? "http://localhost:4173/";
const scenario = process.argv[2] ?? "note-attack";
const wav = path.join(here, `${scenario}.wav`);

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-audio-capture=${wav}`,
    "--autoplay-policy=no-user-gesture-required",
    "--no-sandbox",
  ],
});
const context = await browser.newContext({ permissions: ["microphone"], viewport: { width: 420, height: 900 } });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("[console error]", m.text()); });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto(base);
await page.evaluate((s) => {
  const presets = {
    "note-attack": { targets: [47], mode: "sequential", reference: false, pauseSec: 0, useLeap: false, leapFrom: 53 },
    "attack-quality": { anyNote: false, target: 47, reference: false, stableCents: 20 },
    "lip-slur": { pattern: "oct24", valves: "0", bpm: 60, autoRamp: true, rampAfter: 2, rampStep: 4 },
    "tonguing": { target: 46, perBeat: "4", beats: 4, startBpm: 60, step: 4, maxBpm: 200 },
  };
  localStorage.setItem(`brass-trainer.trainer.${s}.v1`, JSON.stringify(presets[s]));
  localStorage.removeItem("brass-trainer.history.v1");
}, scenario);
await page.goto(`${base}#/t/${scenario}`);
await page.getByRole("button", { name: "開始" }).click();

const verdicts = [];
const total = Number(process.env.DURATION_MS ?? 16000);
const deadline = Date.now() + total;
let lastSeen = "";
while (Date.now() < deadline) {
  const status = await page.locator(".status").textContent();
  const v = await page.locator(".verdict").first().textContent().catch(() => null);
  const key = `${status}|${v}`;
  if (key !== lastSeen) {
    console.log(`[${((total - (deadline - Date.now())) / 1000).toFixed(1)}s] status="${status}" verdict="${v ?? ""}"`);
    lastSeen = key;
    if (v) verdicts.push(v);
  }
  await page.waitForTimeout(200);
}
await page.screenshot({ path: path.join(here, `${scenario}.png`), fullPage: true });
const history = await page.evaluate(() => JSON.parse(localStorage.getItem("brass-trainer.history.v1") ?? "[]"));
console.log("history:", JSON.stringify(history.map((h) => h.data)));
await browser.close();
