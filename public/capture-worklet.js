// マイク入力をまとまった長さで主スレッドに送る AudioWorklet。
// 重い解析はここでは行わない（音声スレッドを止めないため）。
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunkSize = 1024;
    this.buffer = new Float32Array(this.chunkSize);
    this.filled = 0;
    this.chunkStart = currentTime;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch = input[0];
    for (let i = 0; i < ch.length; i++) {
      if (this.filled === 0) this.chunkStart = currentTime + i / sampleRate;
      this.buffer[this.filled++] = ch[i];
      if (this.filled === this.chunkSize) {
        const out = this.buffer;
        this.port.postMessage({ t: this.chunkStart, samples: out }, [out.buffer]);
        this.buffer = new Float32Array(this.chunkSize);
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor("capture-processor", CaptureProcessor);
