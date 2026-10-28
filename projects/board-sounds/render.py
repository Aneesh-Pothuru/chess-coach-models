"""Renders picks.json with earshot's sound bank into the MP3 files the app ships.

    python render.py <earshot repository> <output directory>

Each recipe mixes bank sounds (a part's id, pitch, length, seed, its tone knobs, a low-pass, where
it starts and how loud), levels the loudest 50 ms to the recipe's dB under a -1 dBFS peak, cuts
the tail where it falls 60 dB under the peak (plus 20 ms), fades the last 6 ms, and is encoded
by ffmpeg as 64 kbit/s mono MP3 at 44.1 kHz. results/render.json records each file's length,
size and SHA-256.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import warnings
from pathlib import Path

HERE = Path(__file__).resolve().parent
SR = 48000
TONAL = ("decay", "onset", "bright")


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    repo, out = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
    sys.path.insert(0, str(repo))
    warnings.filterwarnings("ignore")
    import numpy as np
    import soundfile as sf
    from scipy import signal
    from earshot.forge import bank, knobs

    def take(part: dict):
        sid, pitch, dur, seed = part["id"], part.get("pitch"), part.get("dur"), part.get("seed")
        tonal = {k: part[k] for k in TONAL if k in part}
        if tonal:
            entry = bank.get(sid)
            x, _ = knobs.apply(entry, bank.renderer(entry, seed), dur=dur, pitch=pitch, **tonal)
            y = bank.normalize(x, bank.level(bank.PEAK_DB, None))
        else:
            y, _ = bank.render(sid, pitch=pitch, dur=dur, seed=seed)
        y = np.asarray(y, np.float64)
        if y.ndim == 2:
            y = y.mean(axis=1)
        if part.get("lowpass_hz"):
            b, a = signal.butter(2, part["lowpass_hz"] / (SR / 2))
            y = signal.lfilter(b, a, y)
        return y

    def mix(parts: list[dict]):
        bufs = []
        for part in parts:
            y = take(part) * 10 ** (part.get("gain_db", 0) / 20)
            bufs.append((int(round(part.get("at_ms", 0) * SR / 1000)), y))
        z = np.zeros(max(off + len(y) for off, y in bufs))
        for off, y in bufs:
            z[off : off + len(y)] += y
        return z

    def level(y, target_db: float, peak_db: float = -1.0):
        win = int(0.05 * SR)
        sq = np.convolve(y**2, np.ones(win) / win, mode="valid") if len(y) > win else np.array([np.mean(y**2)])
        gain = 10 ** (target_db / 20) / max(np.sqrt(sq.max()), 1e-9)
        cap = 10 ** (peak_db / 20)
        if np.abs(y).max() * gain > cap:
            gain = cap / np.abs(y).max()
        return y * gain

    def trim_tail(y, floor_db: float = -60.0):
        loud = np.nonzero(np.abs(y) > np.abs(y).max() * 10 ** (floor_db / 20))[0]
        end = min(len(y), loud[-1] + int(0.02 * SR)) if len(loud) else len(y)
        return y[:end]

    def fade(y, ms: int = 6):
        n = int(ms * SR / 1000)
        y = y.copy()
        if len(y) > n:
            y[-n:] *= np.linspace(1, 0, n)
        return y

    picks = json.loads((HERE / "picks.json").read_text())
    out.mkdir(parents=True, exist_ok=True)
    report = []
    with tempfile.TemporaryDirectory() as tmp:
        for pick in picks:
            recipe = pick["recipe"]
            y = fade(trim_tail(level(mix(recipe["parts"]), recipe.get("level_db", -18.0))))
            wav = Path(tmp) / f"{pick['file']}.wav"
            sf.write(wav, y.astype(np.float32), SR, subtype="PCM_16")
            mp3 = out / f"{pick['file']}.mp3"
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "64k", str(mp3)],
                check=True,
            )
            data = mp3.read_bytes()
            report.append(
                {
                    "file": f"{pick['file']}.mp3",
                    "moment": pick["moment"],
                    "key": pick["key"],
                    "seconds": round(len(y) / SR, 3),
                    "bytes": len(data),
                    "sha256": hashlib.sha256(data).hexdigest(),
                }
            )
            print(report[-1]["file"], report[-1]["seconds"], report[-1]["bytes"])
    (HERE / "results").mkdir(exist_ok=True)
    (HERE / "results" / "render.json").write_text(json.dumps({"earshot": earshot_commit(repo), "ffmpeg": ffmpeg_version(), "files": report}, indent=1) + "\n")
    print(f"{len(report)} files, {sum(r['bytes'] for r in report)} bytes")


def earshot_commit(repo: Path) -> str | None:
    try:
        return subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def ffmpeg_version() -> str:
    line = subprocess.run(["ffmpeg", "-version"], check=True, capture_output=True, text=True).stdout.splitlines()[0]
    return line.split(" Copyright")[0]


if __name__ == "__main__":
    main()
