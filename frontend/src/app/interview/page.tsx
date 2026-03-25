"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import {
  speak,
  stopSpeaking,
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  SpeechVoiceGender,
  warmupSpeechVoices,
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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [isQuitting, setIsQuitting] = useState(false);
  const [voiceGender, setVoiceGender] = useState<SpeechVoiceGender>("female");
  const [voiceReady, setVoiceReady] = useState(false);

  const recognitionRef = useRef<any>(null);
  const hasSpokenRef = useRef(false);
  const sttSupported = isSpeechRecognitionSupported();
  const [isSpeechStepComplete, setIsSpeechStepComplete] = useState(!sttSupported);

  useEffect(() => {
    if (currentQuestion && voiceReady && !hasSpokenRef.current) {
      hasSpokenRef.current = true;
      playQuestion();
    }
  }, [currentQuestion, voiceReady]);

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
    setIsSpeaking(true);
    speak(currentQuestion, () => setIsSpeaking(false), {
      voiceGender,
      style: "assistant",
    });
  };

  const stopQuestion = () => {
    stopSpeaking();
    setIsSpeaking(false);
  };

  const startRecording = () => {
    if (!sttSupported) return;
    const recognition = createSpeechRecognition(
      (text, finalText) => {
        setAnswer(text);
        setSpeechFinalTranscript(finalText);
      },
      () => setIsRecording(false),
      (error) => {
        console.error("STT error:", error);
        setIsRecording(false);
      }
    );
    if (recognition) {
      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
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
        hasSpokenRef.current = false;
        setCurrentQuestion(data.next_question.question);
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
    if (!speechFinalTranscript.trim()) {
      alert("Please speak your answer before continuing to editor.");
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
                onClick={isSpeaking ? stopQuestion : playQuestion}
                className={`p-3 rounded-lg shrink-0 transition-colors ${
                  isSpeaking
                    ? "bg-white text-black"
                    : "bg-white/5 text-muted hover:text-white hover:bg-white/10"
                }`}
                title={isSpeaking ? "Stop audio" : "Play audio"}
              >
                {isSpeaking ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
            </div>
            <button
              onClick={playQuestion}
              className="mt-4 px-3 py-2 rounded-lg border border-border bg-white/5 text-sm text-muted hover:text-white hover:bg-white/10 transition-colors inline-flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Repeat Question Speech
            </button>
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
                  disabled={isTimeUp}
                  className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                    isRecording
                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "bg-white/5 text-muted hover:text-white border border-border"
                  }`}
                >
                  {isRecording ? (
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
                disabled={!speechFinalTranscript.trim() || isTimeUp}
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
                disabled={!answer.trim() || isSubmitting || (sttSupported && !isSpeechStepComplete) || isTimeUp}
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
