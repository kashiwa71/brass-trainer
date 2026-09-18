/** 譜面台に置いたスマホの画面が消えないようにする。対応していないブラウザーでは何もしない。 */
export class WakeLock {
  private sentinel: WakeLockSentinel | null = null;

  async acquire(): Promise<void> {
    try {
      if (!("wakeLock" in navigator) || this.sentinel) return;
      this.sentinel = await navigator.wakeLock.request("screen");
      this.sentinel.addEventListener("release", () => (this.sentinel = null));
    } catch {
      this.sentinel = null;
    }
  }

  async release(): Promise<void> {
    try {
      await this.sentinel?.release();
    } finally {
      this.sentinel = null;
    }
  }
}
