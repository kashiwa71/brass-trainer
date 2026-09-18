"""疑似マイク入力用の合成チューバ音を生成する（標準ライブラリのみ）。

  python3 e2e/make-wavs.py            # e2e/*.wav を生成
"""
import math, os, struct, wave

SR = 48000
OUT = os.path.dirname(os.path.abspath(__file__))


def midi_hz(m, a4=442):
    return a4 * 2 ** ((m - 69) / 12)


def tone(hz, sec, amp=0.3, attack=0.01, release=0.03, harmonics=(1, 0.7, 0.5, 0.3, 0.2)):
    n = int(sec * SR)
    out = []
    for i in range(n):
        t = i / SR
        env = min(1.0, t / attack) * (1.0 if t < sec - release else max(0.0, (sec - t) / release))
        v = sum(a * math.sin(2 * math.pi * hz * (k + 1) * t) for k, a in enumerate(harmonics))
        out.append(amp * env * v / sum(harmonics))
    return out


def scoop(hz, sec, cents0=-80, dur=0.12, amp=0.3):
    """下からしゃくり上げる出だし"""
    n = int(sec * SR)
    out = []
    ph = 0.0
    for i in range(n):
        t = i / SR
        f = hz * 2 ** (cents0 * (1 - min(1, t / dur)) / 1200)
        ph += 2 * math.pi * f / SR
        env = min(1.0, t / 0.01) * (1.0 if t < sec - 0.03 else max(0, (sec - t) / 0.03))
        v = sum(a * math.sin(ph * (k + 1)) for k, a in enumerate((1, 0.7, 0.5, 0.3)))
        out.append(amp * env * v / 2.5)
    return out


def slur(midis, sec_each, amp=0.3, glide=0.03):
    """途切れずに倍音を移動する"""
    total = sec_each * len(midis)
    n = int(total * SR)
    out = []
    ph = 0.0
    for i in range(n):
        t = i / SR
        k = min(len(midis) - 1, int(t / sec_each))
        frac = t - k * sec_each
        f0 = midi_hz(midis[k])
        if k > 0 and frac < glide:
            fprev = midi_hz(midis[k - 1])
            f = fprev + (f0 - fprev) * (frac / glide)
        else:
            f = f0
        ph += 2 * math.pi * f / SR
        env = min(1.0, t / 0.02) * (1.0 if t < total - 0.05 else max(0, (total - t) / 0.05))
        v = sum(a * math.sin(ph * (m + 1)) for m, a in enumerate((1, 0.7, 0.5, 0.3)))
        out.append(amp * env * v / 2.5)
    return out


def silence(sec):
    return [0.0] * int(sec * SR)


def save(name, sig):
    with wave.open(os.path.join(OUT, name), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32767)) for s in sig))
    print("wrote", name)


# 音当て: H2（命中）→ G3（外れ）→ H2（命中）
save("note-attack.wav", silence(2.0) + tone(midi_hz(47), 1.0) + silence(1.5) + tone(midi_hz(55), 1.0) + silence(1.5) + tone(midi_hz(47), 1.0) + silence(1.5))
# 出だし: きれいな出だし → しゃくり上げ
save("attack-quality.wav", silence(2.0) + tone(midi_hz(47), 1.0) + silence(1.5) + scoop(midi_hz(47), 1.0) + silence(1.5))
# リップスラー: B2→B3→B2 を 1 拍 1 秒でスラー
save("lip-slur.wav", silence(2.0) + (slur([46, 58, 46], 1.0) + silence(1.0)) * 6)
# タンギング: ♩=60 の 16 分音符で B2 を刻む
notes = []
for _ in range(120):
    notes += tone(midi_hz(46), 0.2) + silence(0.05)
save("tonguing.wav", silence(2.0) + notes)
