/**
 * 音声解析ワーカー。主スレッドから受け取った音声を FrameAnalyzer に通し、Frame として返す。
 */
import { FrameAnalyzer } from "../analysis/analyzer";

interface InitMsg {
  type: "init";
  sampleRate: number;
  minHz: number;
  maxHz: number;
}
interface ChunkMsg {
  type: "chunk";
  t: number;
  samples: Float32Array;
}
export type WorkerInMsg = InitMsg | ChunkMsg;

let analyzer: FrameAnalyzer | null = null;

self.onmessage = (ev: MessageEvent<WorkerInMsg>) => {
  const msg = ev.data;
  if (msg.type === "init") {
    analyzer = new FrameAnalyzer({ sampleRate: msg.sampleRate, minHz: msg.minHz, maxHz: msg.maxHz });
    return;
  }
  if (!analyzer) return;
  for (const frame of analyzer.push(msg.t, msg.samples)) (self as unknown as Worker).postMessage(frame);
};
