from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel

from auth.jwt import get_current_user
from services.tts_service import synthesize_wav, warmup_xtts_model
from services.stt_service import transcribe_audio_bytes, warmup_whisper_model

router = APIRouter()


class SpeechSynthesisRequest(BaseModel):
    text: str
    voice_gender: str = "female"


@router.get("/health")
async def speech_health(current_user: dict = Depends(get_current_user)):
    """Check whether speech route is available for authenticated users."""
    return {"status": "ok", "service": "speech"}


@router.post("/warmup")
async def speech_warmup(current_user: dict = Depends(get_current_user)):
    """Warm XTTS model so first interview playback does not hit cold-start delay."""
    await warmup_xtts_model()
    await warmup_whisper_model()
    return {"status": "ok", "message": "speech model warmed"}


@router.post("/synthesize")
async def synthesize_speech(
    request: SpeechSynthesisRequest,
    current_user: dict = Depends(get_current_user),
):
    """Synthesize text to WAV bytes using Coqui TTS models."""
    try:
        wav_bytes = await synthesize_wav(request.text, request.voice_gender)
        return Response(content=wav_bytes, media_type="audio/wav")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        # XTTS may be in cold-start transition; warm once and retry before failing.
        try:
            await warmup_xtts_model()
            wav_bytes = await synthesize_wav(request.text, request.voice_gender)
            return Response(content=wav_bytes, media_type="audio/wav")
        except RuntimeError:
            raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speech synthesis failed: {str(e)}")


@router.post("/transcribe")
async def transcribe_speech(
    audio: UploadFile = File(...),
    language: str = Form("en"),
    current_user: dict = Depends(get_current_user),
):
    """Transcribe uploaded interview audio using Whisper model."""
    try:
        payload = await audio.read()
        text = await transcribe_audio_bytes(
            audio_bytes=payload,
            filename=audio.filename or "speech.webm",
            language=language,
        )
        return {"text": text}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speech transcription failed: {str(e)}")
