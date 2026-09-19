import "./styles.css";
import { App } from "./ui/app";
import { registry } from "./trainers";

const root = document.getElementById("app");
if (!root) throw new Error("#app が見つかりません");
new App(root, registry);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
      // 画面を開くたびに新しい版がないか確かめる（ホーム画面から起動したときも確実に更新する）
      void reg.update();
      // 初回登録では読み込み直さない。既に動いている版が置き換わったときだけ読み込み直す。
      const hadController = navigator.serviceWorker.controller !== null;
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!hadController || reloading) return;
        reloading = true;
        location.reload();
      });
    } catch {
      /* オフライン対応は任意 */
    }
  });
}
