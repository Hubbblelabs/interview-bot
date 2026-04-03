import asyncio
import os
import tempfile
import time

CANDIDATES = [
    ("tts_models/en/ljspeech/speedy-speech", None),
    ("tts_models/en/ljspeech/vits", None),
    ("tts_models/en/ljspeech/glow-tts", None),
    ("tts_models/en/ljspeech/tacotron2-DDC", None),
    ("tts_models/en/ljspeech/fast_pitch", None),
    ("tts_models/en/vctk/vits", "AUTO_SPEAKERS"),
    ("tts_models/en/sam/tacotron-DDC", None),
    ("tts_models/en/blizzard2013/capacitron-t2-c50", None),
    ("tts_models/en/jenny/jenny", None),
]

TEST_TEXT = "Hello, this is a short interview voice quality sample."

async def synth_once(tts, speaker=None):
    fd, path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    t0 = time.perf_counter()
    try:
        kwargs = {"text": TEST_TEXT, "file_path": path}
        if speaker:
            kwargs["speaker"] = speaker
        await asyncio.to_thread(lambda: tts.tts_to_file(**kwargs))
        elapsed = time.perf_counter() - t0
        size = os.path.getsize(path)
        return True, elapsed, size, None
    except Exception as e:
        return False, 0.0, 0, str(e)
    finally:
        if os.path.exists(path):
            os.remove(path)


async def run():
    from TTS.api import TTS

    for model_name, speaker_mode in CANDIDATES:
        print(f"MODEL {model_name}")
        try:
            t_load = time.perf_counter()
            tts = await asyncio.to_thread(lambda: TTS(model_name=model_name, progress_bar=False, gpu=False))
            print(f"  LOAD_OK {time.perf_counter() - t_load:.2f}s")

            if speaker_mode == "AUTO_SPEAKERS":
                speakers = list(getattr(tts, "speakers", []) or [])
                if not speakers:
                    print("  NO_SPEAKERS_FOUND")
                    ok, elapsed, size, err = await synth_once(tts)
                    if ok:
                        print(f"  SYNTH_OK elapsed={elapsed:.2f}s bytes={size}")
                    else:
                        print(f"  SYNTH_FAIL {err}")
                else:
                    print(f"  SPEAKER_COUNT {len(speakers)}")
                    test_speakers = speakers[:12]
                    for spk in test_speakers:
                        ok, elapsed, size, err = await synth_once(tts, speaker=spk)
                        if ok:
                            print(f"  SPEAKER_OK {spk} elapsed={elapsed:.2f}s bytes={size}")
                        else:
                            print(f"  SPEAKER_FAIL {spk} err={err}")
            else:
                ok, elapsed, size, err = await synth_once(tts)
                if ok:
                    print(f"  SYNTH_OK elapsed={elapsed:.2f}s bytes={size}")
                else:
                    print(f"  SYNTH_FAIL {err}")
        except Exception as e:
            print(f"  LOAD_FAIL {e}")

asyncio.run(run())
