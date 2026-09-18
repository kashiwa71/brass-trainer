/** 小さな DOM 生成ヘルパー。フレームワークなしで UI を組む。 */
export type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | ((ev: Event) => void)> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === "function") node.addEventListener(k.replace(/^on/, "").toLowerCase(), v);
    else if (k === "class") node.className = String(v);
    else if (typeof v === "boolean") {
      if (v) node.setAttribute(k, "");
    } else node.setAttribute(k, String(v));
  }
  append(node, ...children);
  return node;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function fmtCents(c: number): string {
  const r = Math.round(c);
  return r > 0 ? `+${r}` : `${r}`;
}

export function fmtMs(sec: number): string {
  return `${Math.round(sec * 1000)} ms`;
}

export function fmtPct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function replaceChildren(node: HTMLElement, ...children: Child[]): void {
  clear(node);
  append(node, ...children);
}
