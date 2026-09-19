/**
 * サービスワーカーの更新とオフライン動作を確かめる。
 *
 *   npm run build && cp -r dist /tmp/swtest
 *   python3 -m http.server 4188 --directory /tmp/swtest &
 *   DIR=/tmp/swtest CHROME=/path/to/chrome node e2e/sw-check.mjs
 *
 * 期待する出力: SW controls the page: true / title after one reload: Brass Trainer NEW /
 * offline app rendered: true
 */
import { chromium } from "playwright-core";
import fs from "node:fs";

const dir = process.env.DIR ?? "/tmp/swtest";
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto("http://localhost:4188/");
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
console.log("SW controls the page:", await page.evaluate(() => navigator.serviceWorker.controller !== null));

// 更新をまねる: 配信中の index.html を書き換える
const idx = `${dir}/index.html`;
const html = fs.readFileSync(idx, "utf8");
fs.writeFileSync(idx, html.replace("<title>Brass Trainer</title>", "<title>Brass Trainer NEW</title>"));

await page.reload();
await page.waitForTimeout(800);
console.log("title after one reload:", await page.title());

// オフラインでも開けるか
await ctx.setOffline(true);
await page.reload();
await page.waitForTimeout(500);
console.log("offline title:", await page.title());
console.log("offline app rendered:", (await page.locator(".trainer-list .card").count()) > 0);
await browser.close();
