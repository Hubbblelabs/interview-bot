"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import {
  speak,
  stopSpeaking,
  SpeechVoiceGender,
  warmupSpeechVoices,
  prepareSpeech,
  unlockSpeechPlayback,
} from "@/lib/speech";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  RotateCcw,
  Send,
  CheckCircle,
  Loader2,
  Edit3,
  ChevronRight,
  XCircle,
  Timer,
  AlertTriangle,
  Lock,
} from "lucide-react";

const normalizeText = (value: string) =>
  (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

function InterviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sessionId, setSessionId] = useState(searchParams.get("session") || "");
  const [currentQuestion, setCurrentQuestion] = useState(searchParams.get("q") || "");
  const [questionId, setQuestionId] = useState(searchParams.get("qid") || "");
  const [questionNumber, setQuestionNumber] = useState(parseInt(searchParams.get("num") || "1"));
  const [totalQuestions, setTotalQuestions] = useState(parseInt(searchParams.get("total") || "10"));
  const [difficulty, setDifficulty] = useState(searchParams.get("diff") || "medium");
  const [timerEnabled] = useState(searchParams.get("timerEnabled") === "1");
  const [timeLeft, setTimeLeft] = useState(parseInt(searchParams.get("timerSeconds") || "0"));
  const [isTimeUp, setIsTimeUp] = useState(false);

  const [answer, setAnswer] = useState("");
  const [speechFinalTranscript, setSpeechFinalTranscript] = useState("");
  const [speechStageWarning, setSpeechStageWarning] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [isQuitting, setIsQuitting] = useState(false);
  const [isPreparingQuestionAudio, setIsPreparingQuestionAudio] = useState(false);
  const [voiceGender, setVoiceGender] = useState<SpeechVoiceGender>("female");
  const [voiceReady, setVoiceReady] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const hasSpokenRef = useRef(false);
  const preparedQuestionRef = useRef("");
  const currentQuestionToken = `${questionId || ""}::${currentQuestion || ""}`;
  const sttSupported =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;
  const [isSpeechStepComplete, setIsSpeechStepComplete] = useState(!sttSupported);

  useEffect(() => {
    if (!currentQuestion || !voiceReady || !isSpeakerEnabled || hasSpokenRef.current) return;

    let cancelled = false;
    const prepareAndPlay = async () => {
      setIsPreparingQuestionAudio(true);
      // Kick off prefetch, but do not block speaking on it.
      void (async () => {
        try {
          if (preparedQuestionRef.current !== currentQuestionToken) {
            await Promise.race([
              prepareSpeech(currentQuestion, { voiceGender, style: "assistant" }),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error("speech prepare timeout")), 12000)
              ),
            ]);
            preparedQuestionRef.current = currentQuestionToken;
          }
        } catch {
          preparedQuestionRef.current = "";
        } finally {
          if (!cancelled) {
            setIsPreparingQuestionAudio(false);
          }
        }
      })();

      if (cancelled) return;
      hasSpokenRef.current = true;
      await unlockSpeechPlayback().catch(() => undefined);
      if (cancelled) return;
      playQuestion();
    };

    void prepareAndPlay();
    return () => {
      cancelled = true;
    };
  }, [currentQuestionToken, voiceReady, voiceGender, isSpeakerEnabled]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const localVoice = localStorage.getItem("speech_voice_gender") as SpeechVoiceGender | null;
    if (localVoice === "male" || localVoice === "female" || localVoice === "auto") {
      setVoiceGender(localVoice);
    }

    const loadVoiceFromProfile = async () => {
      try {
        const { data } = await api.get("/profile");
        const serverVoice = (data?.speech_settings?.voice_gender || localVoice || "female") as SpeechVoiceGender;
        if (serverVoice === "male" || serverVoice === "female" || serverVoice === "auto") {
          setVoiceGender(serverVoice);
          localStorage.setItem("speech_voice_gender", serverVoice);
        }
      } catch {
        // Keep local/default voice if profile fetch fails.
      } finally {
        await warmupSpeechVoices();
        setVoiceReady(true);
      }
    };

    loadVoiceFromProfile();
  }, []);

  useEffect(() => {
    if (!timerEnabled || isComplete || isTimeUp) return;
    if (timeLeft <= 0) {
      setIsTimeUp(true);
      stopRecording();
      stopSpeaking();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsTimeUp(true);
          stopRecording();
          stopSpeaking();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timerEnabled, timeLeft, isComplete, isTimeUp]);

  const playQuestion = () => {
    if (!isSpeakerEnabled) return;
    setIsSpeaking(true);
    void unlockSpeechPlayback()
      .catch(() => undefined)
      .finally(() => {
        speak(currentQuestion, () => setIsSpeaking(false), {
          voiceGender,
          style: "assistant",
        });
      });
  };

  const stopQuestion = () => {
    stopSpeaking();
    setIsSpeaking(false);
  };

  const toggleSpeaker = () => {
    if (isSpeakerEnabled) {
      setIsSpeakerEnabled(false);
      stopQuestion();
      return;
    }

    setIsSpeakerEnabled(true);
    if (currentQuestion && voiceReady && !isPreparingQuestionAudio) {
      hasSpokenRef.current = false;
      playQuestion();
    }
  };

  const releaseRecorderResources = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
  };

  const startRecording = () => {
    if (!sttSupported || isTranscribing) return;

    const beginRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const preferredMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

        const recorder = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime })
          : new MediaRecorder(stream);

        audioChunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.onstop = async () => {
          setIsRecording(false);
          setIsTranscribing(true);
          try {
            const blob = new Blob(audioChunksRef.current, {
              type: recorder.mimeType || "audio/webm",
            });
            if (blob.size === 0) {
              throw new Error("No audio captured. Please record again.");
            }

            const formData = new FormData();
            formData.append("audio", blob, "speech.webm");
            formData.append("language", "en");

            const { data } = await api.post("/speech/transcribe", formData, {
              headers: { "Content-Type": "multipart/form-data" },
              timeout: 120000,
            });

            const transcribed = (data?.text || "").trim();
            if (!transcribed) {
              throw new Error("No speech detected. Please speak clearly and try again.");
            }

            setSpeechFinalTranscript(transcribed);
            setAnswer(transcribed);
            setSpeechStageWarning("");
          } catch (err: any) {
            alert(err.response?.data?.detail || err.message || "Failed to transcribe audio");
          } finally {
            setIsTranscribing(false);
            releaseRecorderResources();
          }
        };

        recorder.onerror = () => {
          setIsRecording(false);
          setIsTranscribing(false);
          releaseRecorderResources();
          alert("Microphone recording failed. Please try again.");
        };

        mediaRecorderRef.current = recorder;
        recorder.start(200);
        setSpeechStageWarning("");
        setSpeechFinalTranscript("");
        setAnswer("");
        setIsSpeechStepComplete(false);
        setIsRecording(true);
      } catch (err: any) {
        setIsRecording(false);
        releaseRecorderResources();
        alert(err.message || "Microphone access failed");
      }
    };

    void beginRecording();
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const submitAnswer = async () => {
    if (isTimeUp) {
      alert("Time is up. Please quit this interview.");
      return;
    }
    if (sttSupported && !isSpeechStepComplete) {
      alert("Complete speech first, then review in editor before submit.");
      return;
    }
    if (isTranscribing) {
      alert("Transcription is in progress. Please wait a moment.");
      return;
    }
    if (!answer.trim()) return;
    setIsSubmitting(true);
    stopRecording();
    stopSpeaking();

    try {
      const { data } = await api.post("/interview/answer", {
        session_id: sessionId,
        question_id: questionId,
        answer: answer.trim(),
      });

      if (data.is_complete) {
        setIsComplete(true);
      } else if (data.next_question) {
        const nextQuestionText = data.next_question.question || "";
        preparedQuestionRef.current = "";
        void prepareSpeech(nextQuestionText, { voiceGender, style: "assistant" })
          .then(() => {
            preparedQuestionRef.current = nextQuestionText;
          })
          .catch(() => {
            preparedQuestionRef.current = "";
          });

        hasSpokenRef.current = false;
        setCurrentQuestion(nextQuestionText);
        setQuestionId(data.next_question.question_id);
        setQuestionNumber(data.next_question.question_number);
        setDifficulty(data.next_question.difficulty);
        setAnswer("");
        setSpeechFinalTranscript("");
        setSpeechStageWarning("");
        setIsSpeechStepComplete(!sttSupported);
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to submit answer");
    } finally {
      setIsSubmitting(false);
    }
  };

  const viewReport = async () => {
    setGeneratingReport(true);
    try {
      await api.get(`/interview/report?session_id=${sessionId}`);
      router.push(`/report/${sessionId}`);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to generate report");
      setGeneratingReport(false);
    }
  };

  const quitInterview = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to quit? Your progress so far will be evaluated if you have submitted answers."
    );
    if (!confirmed) return;

    setIsQuitting(true);
    stopRecording();
    stopSpeaking();

    try {
      const { data } = await api.post("/interview/quit", {
        session_id: sessionId,
      });

      if (data.report_generated) {
        router.push(`/report/${sessionId}`);
        return;
      }

      alert("Interview quit successfully. No evaluated answers were found yet.");
      router.push("/dashboard");
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to quit interview");
    } finally {
      setIsQuitting(false);
    }
  };

  const markSpeechComplete = () => {
    if (!sttSupported) {
      setIsSpeechStepComplete(true);
      return;
    }

    stopRecording();
    if (isTranscribing) {
      alert("Please wait until transcription finishes.");
      return;
    }
    if (!speechFinalTranscript.trim()) {
      alert("Please record your answer first, then continue to editor.");
      return;
    }
    setSpeechStageWarning("");
    setAnswer(speechFinalTranscript.trim());
    setIsSpeechStepComplete(true);
  };

  const onEditorChange = (nextValue: string) => {
    if (sttSupported && !isSpeechStepComplete) return;

    if (sttSupported) {
      const spoken = normalizeText(speechFinalTranscript);
      const typed = normalizeText(nextValue);

      if (spoken && typed.length > spoken.length + 3) {
        alert("Extra typed content is not allowed. Please continue by speaking.");
        setSpeechStageWarning("You added extra typed content. Continue in speech mode.");
        setIsSpeechStepComplete(false);
        setAnswer(speechFinalTranscript.trim());
        return;
      }
    }

    setAnswer(nextValue);
  };

  if (isComplete) {
    return (
      <ProtectedRoute requiredRole="student">
        <Navbar />
        <main className="pt-20 pb-12 px-4 max-w-2xl mx-auto">
          <div className="animate-fade-in text-center mt-16">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
            <h1 className="text-3xl font-bold mb-3">Interview Complete!</h1>
            <p className="text-muted mb-8">
              Great job! Your responses are being evaluated by our AI.
            </p>
            <button
              onClick={viewReport}
              disabled={generatingReport}
              className="px-8 py-3 bg-white text-black rounded-lg font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
              {generatingReport ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating Report...
                </>
              ) : (
                <>
                  View Report
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </main>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requiredRole="student">
      <Navbar />
      <main className="pt-20 pb-12 px-4 max-w-3xl mx-auto">
        <div className="animate-fade-in">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <span className="text-sm text-muted">
                Question {questionNumber} of {totalQuestions}
              </span>
              <span className="ml-3 px-2 py-0.5 rounded-full text-xs bg-white/5 border border-border text-muted capitalize">
                {difficulty}
              </span>
              {timerEnabled && (
                <span className={`ml-3 px-2 py-0.5 rounded-full text-xs border inline-flex items-center gap-1 ${
                  isTimeUp
                    ? "bg-red-500/10 border-red-500/30 text-red-300"
                    : "bg-white/5 border-border text-muted"
                }`}>
                  <Timer className="w-3 h-3" />
                  {isTimeUp ? "Time up" : formatTime(timeLeft)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={quitInterview}
                disabled={isSubmitting || isQuitting}
                className="px-3 py-1.5 rounded-lg text-xs border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {isQuitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                Quit Interview
              </button>
              <div className="w-32 h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-500"
                  style={{ width: `${(questionNumber / totalQuestions) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="p-6 rounded-xl bg-card border border-border mb-6">
            <div className="flex items-start justify-between gap-4">
              <p className="text-lg font-medium leading-relaxed flex-1">
                {currentQuestion}
              </p>
              <button
                onClick={toggleSpeaker}
                disabled={isPreparingQuestionAudio}
                className={`p-3 rounded-lg shrink-0 transition-colors ${
                  !isSpeakerEnabled
                    ? "bg-rose-500/15 text-rose-400"
                    : isSpeaking
                    ? "bg-white text-black"
                    : "bg-white/5 text-muted hover:text-white hover:bg-white/10"
                } disabled:opacity-60 disabled:cursor-not-allowed`}
                title={isSpeakerEnabled ? "Turn speaker off" : "Turn speaker on"}
              >
                {!isSpeakerEnabled ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
            </div>
            <button
              onClick={playQuestion}
              disabled={isPreparingQuestionAudio || !isSpeakerEnabled}
              className="mt-4 px-3 py-2 rounded-lg border border-border bg-white/5 text-sm text-muted hover:text-white hover:bg-white/10 transition-colors inline-flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              {isSpeakerEnabled ? "Repeat Question Speech" : "Speaker Off"}
            </button>

            {isPreparingQuestionAudio && (
              <div className="mt-3 inline-flex items-center gap-2 text-xs text-muted">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Preparing XTTS voice for this question...
              </div>
            )}
          </div>

          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Edit3 className="w-4 h-4" />
                <span>{sttSupported ? (isSpeechStepComplete ? "Review Answer" : "Speech Answer") : "Your Answer"}</span>
              </div>
              {sttSupported && (
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isTimeUp || isTranscribing}
                  className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                    isRecording
                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "bg-white/5 text-muted hover:text-white border border-border"
                  }`}
                >
                  {isTranscribing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Transcribing...
                    </>
                  ) : isRecording ? (
                    <>
                      <MicOff className="w-4 h-4" />
                      Stop Recording
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      Use Microphone
                    </>
                  )}
                </button>
              )}
            </div>

            {isRecording && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse-slow" />
                <span className="text-xs text-red-400">
                  Recording... Speak your answer
                </span>
              </div>
            )}

            {sttSupported && !isSpeechStepComplete && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-300" />
                <span className="text-xs text-amber-300">
                  Editor is locked. Speak your answer, then click Speech Complete.
                </span>
              </div>
            )}

            {speechStageWarning && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-300" />
                <span className="text-xs text-red-300">{speechStageWarning}</span>
              </div>
            )}

            {sttSupported && !isSpeechStepComplete && (
              <button
                onClick={markSpeechComplete}
                disabled={!speechFinalTranscript.trim() || isTimeUp || isTranscribing}
                className="mb-3 px-4 py-2 rounded-lg text-sm font-semibold border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Speech Complete
              </button>
            )}

            <textarea
              value={answer}
              onChange={(e) => onEditorChange(e.target.value)}
              placeholder={
                sttSupported && !isSpeechStepComplete
                  ? "Speak first using microphone. Editor unlocks after Speech Complete."
                  : "Review your spoken answer and fix small mistakes..."
              }
              rows={6}
              disabled={(sttSupported && !isSpeechStepComplete) || isTimeUp}
              className="resize-none mb-4"
            />

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">
                {answer.trim()
                  ? "Review your answer, then submit when ready."
                  : "Speech-to-text output appears here."}
              </p>
              <button
                onClick={submitAnswer}
                disabled={!answer.trim() || isSubmitting || isTranscribing || (sttSupported && !isSpeechStepComplete) || isTimeUp}
                className="px-6 py-2.5 bg-white text-black rounded-lg font-semibold text-sm hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Submit
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}

export default function InterviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-pulse-slow">Loading...</div></div>}>
      <InterviewContent />
    </Suspense>
  );
}
