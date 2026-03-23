from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from auth.jwt import get_current_user
from services.tts_service import synthesize_wav

router = APIRouter()


class SpeechSynthesisRequest(BaseModel):
    text: str
    voice_gender: str = "female"


@router.get("/health")
async def speech_health(current_user: dict = Depends(get_current_user)):
    """Check whether speech route is available for authenticated users."""
    return {"status": "ok", "service": "speech"}


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
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speech synthesis failed: {str(e)}")
