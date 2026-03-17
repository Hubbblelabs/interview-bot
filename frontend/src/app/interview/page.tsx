"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { speak, stopSpeaking, createSpeechRecognition, isSpeechRecognitionSupported } from "@/lib/speech";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  CheckCircle,
  Loader2,
  Edit3,
  ChevronRight,
} from "lucide-react";

function InterviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sessionId, setSessionId] = useState(searchParams.get("session") || "");
  const [currentQuestion, setCurrentQuestion] = useState(searchParams.get("q") || "");
  const [questionId, setQuestionId] = useState(searchParams.get("qid") || "");
  const [questionNumber, setQuestionNumber] = useState(parseInt(searchParams.get("num") || "1"));
  const [totalQuestions, setTotalQuestions] = useState(parseInt(searchParams.get("total") || "10"));
  const [difficulty, setDifficulty] = useState(searchParams.get("diff") || "medium");

  const [answer, setAnswer] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);

  const recognitionRef = useRef<any>(null);
  const hasSpokenRef = useRef(false);
  const sttSupported = isSpeechRecognitionSupported();

  useEffect(() => {
    if (currentQuestion && !hasSpokenRef.current) {
      hasSpokenRef.current = true;
      playQuestion();
    }
  }, [currentQuestion]);

  const playQuestion = () => {
    setIsSpeaking(true);
    speak(currentQuestion, () => setIsSpeaking(false));
  };

  const stopQuestion = () => {
    stopSpeaking();
    setIsSpeaking(false);
  };

  const startRecording = () => {
    if (!sttSupported) return;
    const recognition = createSpeechRecognition(
      (text) => setAnswer(text),
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
            </div>
            <div className="w-32 h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${(questionNumber / totalQuestions) * 100}%` }}
              />
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
          </div>

          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Edit3 className="w-4 h-4" />
                <span>Your Answer</span>
              </div>
              {sttSupported && (
                <button
                  onClick={isRecording ? stopRecording : startRecording}
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

            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer here, or use the microphone to speak..."
              rows={6}
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
                disabled={!answer.trim() || isSubmitting}
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
