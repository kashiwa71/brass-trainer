import "./styles.css";
import { App } from "./ui/app";
import { registry } from "./trainers";

const root = document.getElementById("app");
if (!root) throw new Error("#app が見つかりません");
new App(root, registry);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* オフライン対応は任意 */
    });
  });
}
