import asyncio
import os
import tempfile
from typing import Tuple

_MODEL_CACHE = {}
_MODEL_LOCK = asyncio.Lock()


def _select_model(voice_gender: str) -> Tuple[str, str | None]:
    gender = (voice_gender or "female").strip().lower()
    if gender == "male":
        # Multi-speaker model; use a male VCTK speaker token.
        return "tts_models/en/vctk/vits", "p226"
    # Default female-like English voice model.
    return "tts_models/en/ljspeech/tacotron2-DDC", None


async def _get_tts_model(model_name: str):
    async with _MODEL_LOCK:
        if model_name in _MODEL_CACHE:
            return _MODEL_CACHE[model_name]

        def _load_model():
            try:
                from TTS.api import TTS
            except Exception as exc:
                raise RuntimeError(
                    "Coqui TTS is not installed in the active Python environment"
                ) from exc

            # Use CPU by default for compatibility.
            return TTS(model_name=model_name, progress_bar=False, gpu=False)

        model = await asyncio.to_thread(_load_model)
        _MODEL_CACHE[model_name] = model
        return model


async def synthesize_wav(text: str, voice_gender: str = "female") -> bytes:
    content = (text or "").strip()
    if not content:
        raise ValueError("text is required")

    model_name, speaker = _select_model(voice_gender)
    tts = await _get_tts_model(model_name)

    fd, tmp_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    try:
        def _synthesize():
            kwargs = {
                "text": content,
                "file_path": tmp_path,
            }
            if speaker:
                kwargs["speaker"] = speaker
            tts.tts_to_file(**kwargs)

        await asyncio.to_thread(_synthesize)
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
