"""Does Edge TTS actually parallelize? The pipelining fix assumes it does."""
import asyncio, time, sys
sys.path.insert(0, r"c:\Users\veera\AICA-aruvi")
from backend.settings import TtsSettings
from backend.tts import create_tts

tts = create_tts(TtsSettings())
tts.load()

C = ["கண்டிப்பா மேடம்.", "என்னென்ன test-னு சொல்லுங்க?", "ஒரு நிமிஷம் சார்."]


async def one(t):
    s = time.perf_counter()
    r = await asyncio.to_thread(tts.synthesize, t, "ta")
    d = time.perf_counter() - s
    audio_s = r.samples.size / r.sample_rate if r.samples.size else 0
    return d, audio_s


async def main():
    await one("warm up")  # pay one-off cost outside the measurement

    print("SEQUENTIAL (what the old code did):")
    t0 = time.perf_counter()
    for c in C:
        d, a = await one(c)
        print(f"   synth {d:5.2f}s  -> {a:4.2f}s of audio")
    seq = time.perf_counter() - t0
    print(f"   TOTAL {seq:.2f}s")

    print("\nCONCURRENT (what pipelining relies on):")
    t0 = time.perf_counter()
    res = await asyncio.gather(*(one(c) for c in C))
    con = time.perf_counter() - t0
    for d, a in res:
        print(f"   synth {d:5.2f}s  -> {a:4.2f}s of audio")
    print(f"   TOTAL {con:.2f}s")

    total_audio = sum(a for _, a in res)
    print(f"\nspeech produced: {total_audio:.2f}s")
    print(f"sequential {seq:.2f}s -> concurrent {con:.2f}s")
    if con < seq * 0.7:
        print("=> Edge DOES parallelize. Pipelining is the right fix.")
    else:
        print("=> Edge does NOT parallelize. Pipelining cannot help; must cut round-trips.")
    if seq > total_audio:
        print(f"!! synthesis is SLOWER than realtime ({seq:.2f}s to make {total_audio:.2f}s of speech)")


asyncio.run(main())
