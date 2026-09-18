import { el, append } from "./dom";
import { ADVICE, TOPIC_LABELS, adviceFor, type Advice, type Topic, type Trigger } from "../content/advice";

/** アドバイスを 1 枚のカードにする。compact=true なら一言と出典だけを大きく出す。 */
export function adviceCard(a: Advice, opts: { compact?: boolean; label?: string } = {}): HTMLElement {
  const link = el("a", { href: a.source.url, target: "_blank", rel: "noopener noreferrer", class: "btn link" }, "出典を見る ↗");
  const src = el("div", { class: "advice-src" }, `${a.source.author}｜${a.source.title}`);
  const card = el("div", { class: `advice${opts.compact ? " compact" : ""}${opts.label === "今日のポイント" ? " daily" : ""}` });
  if (opts.label) append(card, el("div", { class: "advice-label" }, opts.label));
  append(card, el("div", { class: "advice-cue" }, a.cue), el("div", { class: "advice-title" }, a.title));
  if (opts.compact) {
    append(card, el("details", {}, el("summary", {}, "くわしく"), el("p", {}, a.detail), a.quote ? el("blockquote", {}, a.quote) : null, src));
  } else {
    append(card, el("p", {}, a.detail), a.quote ? el("blockquote", {}, a.quote) : null, src);
  }
  append(card, link);
  return card;
}

/** 起きた出来事に合わせて「次はこうする」を 1〜2 枚出す。該当がなければ null。 */
export function coachingBlock(triggers: Trigger[], topic: Topic, limit = 1): HTMLElement | null {
  const seen = new Set<string>();
  const picked: Advice[] = [];
  for (const t of triggers) {
    for (const a of adviceFor(t, topic, 2)) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      picked.push(a);
      if (picked.length >= limit) break;
    }
    if (picked.length >= limit) break;
  }
  if (picked.length === 0) return null;
  const box = el("div", { class: "coach" });
  picked.forEach((a, i) => box.appendChild(adviceCard(a, { compact: true, label: i === 0 ? "次はこうする" : undefined })));
  return box;
}

/** アドバイス集のページ */
export function advicePage(initialTopic: Topic | "all" = "all"): HTMLElement {
  const root = el("div", { class: "advice-page" });
  const list = el("div", { class: "advice-list" });
  const chips = el("div", { class: "chip-row" });
  let current: Topic | "all" = initialTopic;
  const render = () => {
    list.replaceChildren();
    for (const a of ADVICE) if (current === "all" || a.topics.includes(current)) list.appendChild(adviceCard(a));
    chips.querySelectorAll<HTMLElement>(".chip").forEach((c) => c.classList.toggle("on", c.dataset.topic === current));
  };
  const mk = (t: Topic | "all", label: string) => {
    const b = el("button", { type: "button", class: "chip", "data-topic": t }, label);
    b.addEventListener("click", () => {
      current = t;
      render();
    });
    return b;
  };
  append(chips, mk("all", "すべて"), ...(Object.keys(TOPIC_LABELS) as Topic[]).map((t) => mk(t, TOPIC_LABELS[t])));
  append(
    root,
    el("p", { class: "muted" }, "プロ奏者・指導者が公開しているアドバイスの要約です。各カードの「出典を見る」から元の記事を読めます。練習中は状況に合ったものが自動で表示されます。"),
    chips,
    list,
  );
  render();
  return root;
}
