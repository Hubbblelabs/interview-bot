import asyncio
import os
import tempfile

# On Windows, ctranslate2 and torch can load separate OpenMP runtimes.
# Allowing duplicates avoids process aborts during model initialization.
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

_WHISPER_MODEL_CACHE = {}
_WHISPER_MODEL_LOCK = asyncio.Lock()


def _resolve_device() -> str:
    pref = os.getenv("WHISPER_DEVICE", "auto").strip().lower()
    if pref in {"cpu", "cuda"}:
        return pref

    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def _resolve_compute_type(device: str) -> str:
    pref = os.getenv("WHISPER_COMPUTE_TYPE", "auto").strip().lower()
    if pref and pref != "auto":
        return pref
    return "float16" if device == "cuda" else "int8"


def _resolve_model_size() -> str:
    # Prefer medium for better interview transcription quality.
    return os.getenv("WHISPER_MODEL_SIZE", "medium").strip() or "medium"


async def _get_whisper_model():
    model_size = _resolve_model_size()
    device = _resolve_device()
    compute_type = _resolve_compute_type(device)
    cache_key = f"{model_size}|{device}|{compute_type}"

    async with _WHISPER_MODEL_LOCK:
        if cache_key in _WHISPER_MODEL_CACHE:
            return _WHISPER_MODEL_CACHE[cache_key]

        def _load_model():
            try:
                from faster_whisper import WhisperModel
            except Exception as exc:
                raise RuntimeError(
                    "faster-whisper is not installed in the active Python environment"
                ) from exc

            try:
                return WhisperModel(model_size, device=device, compute_type=compute_type)
            except Exception:
                # Keep service resilient if GPU config mismatches runtime.
                return WhisperModel(model_size, device="cpu", compute_type="int8")

        model = await asyncio.to_thread(_load_model)
        _WHISPER_MODEL_CACHE[cache_key] = model
        return model


async def warmup_whisper_model() -> None:
    try:
        await _get_whisper_model()
    except Exception:
        # Best-effort warmup only.
        pass


async def transcribe_audio_bytes(audio_bytes: bytes, filename: str = "speech.webm", language: str = "en") -> str:
    if not audio_bytes:
        raise ValueError("audio file is required")

    model = await _get_whisper_model()
    ext = os.path.splitext(filename or "speech.webm")[1] or ".webm"
    target_language = (language or "en").strip().lower() or "en"

    fd, tmp_path = tempfile.mkstemp(suffix=ext)
    os.close(fd)

    try:
        with open(tmp_path, "wb") as f:
            f.write(audio_bytes)

        def _transcribe() -> str:
            segments, _ = model.transcribe(
                tmp_path,
                language=target_language,
                beam_size=1,
                best_of=1,
                vad_filter=True,
                condition_on_previous_text=False,
                temperature=0.0,
            )
            parts = []
            for seg in segments:
                text = (seg.text or "").strip()
                if text:
                    parts.append(text)
            return " ".join(parts).strip()

        text = await asyncio.to_thread(_transcribe)
        return text
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
