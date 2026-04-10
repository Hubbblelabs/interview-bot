import asyncio
import os
import tempfile
from typing import Tuple
from collections import OrderedDict
from functools import wraps

_MODEL_CACHE = {}
_MODEL_LOCK = asyncio.Lock()
_AUDIO_CACHE = OrderedDict()
_AUDIO_CACHE_LOCK = asyncio.Lock()
_SYNTHESIZE_LOCK = asyncio.Lock()
_TORCH_LOAD_PATCHED = False

XTTS_MODEL = "tts_models/multilingual/multi-dataset/xtts_v2"
XTTS_LANGUAGE = "en"
XTTS_SPEED = 1.2
_XTTS_WARM = False
_XTTS_LAST_ERROR: str | None = None
AUDIO_CACHE_MAX_ITEMS = 300


def _resolve_xtts_max_text_length() -> int:
    """0 disables truncation so full question text is spoken."""
    try:
        return max(0, int(os.getenv("XTTS_MAX_TEXT_LENGTH", "0")))
    except Exception:
        return 0


XTTS_MAX_TEXT_LENGTH = _resolve_xtts_max_text_length()

# User-approved stable voices:
# - Female: index 45 => Alexandra Hisakawa
# - Male: index 21 => Abrahan Mack
XTTS_SPEAKER_BY_GENDER = {
    "female": "Alexandra Hisakawa",
    "male": "Abrahan Mack",
    "auto": "Alexandra Hisakawa",
}


def _resolve_xtts_checkpoint_trust() -> bool:
    """Enable trusted local checkpoint loading compatibility by default."""
    value = os.getenv("XTTS_TRUSTED_CHECKPOINTS", "1").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _ensure_torch_load_compat_for_xtts() -> None:
    """Patch torch.load default for PyTorch 2.6+ when loading trusted XTTS checkpoints."""
    global _TORCH_LOAD_PATCHED
    if _TORCH_LOAD_PATCHED or not _resolve_xtts_checkpoint_trust():
        return

    try:
        import torch
    except Exception:
        return

    original_load = getattr(torch, "load", None)
    if not callable(original_load):
        return

    @wraps(original_load)
    def _torch_load_compat(*args, **kwargs):
        # Coqui XTTS checkpoints require full object unpickling on newer PyTorch.
        kwargs.setdefault("weights_only", False)
        return original_load(*args, **kwargs)

    torch.load = _torch_load_compat
    _TORCH_LOAD_PATCHED = True


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
            _ensure_torch_load_compat_for_xtts()

            try:
                from TTS.api import TTS
            except Exception as exc:
                raise RuntimeError(
                    "Coqui TTS is not installed in the active Python environment"
                ) from exc

            gpu_pref = os.getenv("XTTS_USE_GPU", "auto").strip().lower()
            use_gpu = False
            if gpu_pref in {"1", "true", "yes", "on"}:
                use_gpu = True
            elif gpu_pref in {"0", "false", "no", "off"}:
                use_gpu = False
            else:
                try:
                    import torch

                    use_gpu = bool(torch.cuda.is_available())
                except Exception:
                    use_gpu = False

            # TTS(..., gpu=...) is deprecated upstream. Load once, then move model.
            tts = TTS(model_name=model_name, progress_bar=False)

            if use_gpu:
                try:
                    tts.to("cuda")
                    return tts
                except Exception:
                    # Graceful CPU fallback when CUDA runtime is unavailable/mismatched.
                    try:
                        tts.to("cpu")
                    except Exception:
                        pass
                    return tts

            try:
                tts.to("cpu")
            except Exception:
                pass
            return tts

        model = await asyncio.to_thread(_load_model)
        _MODEL_CACHE[model_name] = model
        return model


def _resolve_xtts_speaker(voice_gender: str) -> str:
    gender = (voice_gender or "female").strip().lower()
    if gender not in XTTS_SPEAKER_BY_GENDER:
        gender = "female"
    return XTTS_SPEAKER_BY_GENDER[gender]


def _normalize_text_for_speech(value: str, max_length: int = XTTS_MAX_TEXT_LENGTH) -> str:
    content = " ".join((value or "").strip().split())
    if max_length <= 0:
        return content
    if len(content) <= max_length:
        return content
    trimmed = content[:max_length].rstrip()
    # Keep sentence boundaries cleaner when truncating.
    for marker in ("?", "!", "."):
        if marker in trimmed:
            head = trimmed.rsplit(marker, 1)[0].strip()
            if len(head) >= max_length // 2:
                return f"{head}{marker}"
    return trimmed


async def warmup_xtts_model() -> bool:
    """Preload XTTS to avoid long cold-start on first interview question."""
    global _XTTS_WARM, _XTTS_LAST_ERROR
    if _XTTS_WARM:
        return True
    try:
        await _get_tts_model(XTTS_MODEL)
        _XTTS_WARM = True
        _XTTS_LAST_ERROR = None
        return True
    except Exception as exc:
        # Keep API startup resilient; routes decide whether to surface this.
        _XTTS_LAST_ERROR = str(exc)
        return False


def get_xtts_warmup_state() -> dict:
    return {
        "is_warm": _XTTS_WARM,
        "last_error": _XTTS_LAST_ERROR,
    }


def _synthesize_xtts_to_file(tts, text: str, speaker: str, file_path: str) -> None:
    kwargs = {
        "text": text,
        "file_path": file_path,
        "speaker": speaker,
        "language": XTTS_LANGUAGE,
    }
    try:
        # Faster delivery for interview prompts.
        tts.tts_to_file(**kwargs, speed=XTTS_SPEED)
    except TypeError:
        # Some model/runtime combinations may not expose speed arg.
        tts.tts_to_file(**kwargs)


def _build_audio_cache_key(text: str, voice_gender: str) -> str:
    return f"{(voice_gender or 'female').strip().lower()}::{text.strip()}"


async def _get_cached_audio(cache_key: str) -> bytes | None:
    async with _AUDIO_CACHE_LOCK:
        value = _AUDIO_CACHE.get(cache_key)
        if value is None:
            return None
        # LRU touch.
        _AUDIO_CACHE.move_to_end(cache_key)
        return value


async def _set_cached_audio(cache_key: str, data: bytes) -> None:
    async with _AUDIO_CACHE_LOCK:
        _AUDIO_CACHE[cache_key] = data
        _AUDIO_CACHE.move_to_end(cache_key)
        while len(_AUDIO_CACHE) > AUDIO_CACHE_MAX_ITEMS:
            _AUDIO_CACHE.popitem(last=False)


async def _synthesize_fallback_wav(text: str, voice_gender: str) -> bytes:
    model_name, speaker = _select_model(voice_gender)
    tts = await _get_tts_model(model_name)

    fd, tmp_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    try:
        def _synthesize():
            kwargs = {
                "text": text,
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


async def prefetch_wav(text: str, voice_gender: str = "female") -> None:
    """Best-effort speech prefetch to warm audio cache."""
    try:
        await synthesize_wav(text, voice_gender)
    except Exception:
        # Silent prefetch failure; runtime synth may still succeed later.
        pass


async def synthesize_wav(text: str, voice_gender: str = "female") -> bytes:
    content = _normalize_text_for_speech(text)
    if not content:
        raise ValueError("text is required")

    normalized_gender = (voice_gender or "female").strip().lower()
    if normalized_gender not in {"male", "female", "auto"}:
        normalized_gender = "female"

    cache_key = _build_audio_cache_key(content, normalized_gender)
    cached = await _get_cached_audio(cache_key)
    if cached:
        return cached

    async with _SYNTHESIZE_LOCK:
        # Recheck cache after waiting for lock in case another request already synthesized it.
        cached = await _get_cached_audio(cache_key)
        if cached:
            return cached

        speaker = _resolve_xtts_speaker(normalized_gender)
        tts = await _get_tts_model(XTTS_MODEL)

        fd, tmp_path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        try:
            def _synthesize():
                _synthesize_xtts_to_file(tts, text=content, speaker=speaker, file_path=tmp_path)

            try:
                await asyncio.to_thread(_synthesize)
                with open(tmp_path, "rb") as f:
                    wav = f.read()
                await _set_cached_audio(cache_key, wav)
                return wav
            except Exception:
                # Keep speech available even if XTTS runtime has temporary issues.
                wav = await _synthesize_fallback_wav(content, normalized_gender)
                await _set_cached_audio(cache_key, wav)
                return wav
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
