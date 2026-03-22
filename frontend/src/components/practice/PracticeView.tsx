"use client";

import { useEffect, useState } from "react";
import { PracticeLayout } from "./PracticeLayout";
import { UserAvatar } from "./UserAvatar";
import { AudioIndicator, RecordButton } from "./AudioInterface";
import { QuestionDisplay } from "./QuestionDisplay";
import { AnswerPopup } from "./AnswerPopup";
import { TimeStats } from "./report/TimeStats";
import { Heatmap } from "./report/Heatmap";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useTimer } from "@/hooks/useTimer";
import { usePracticeFlow } from "@/hooks/usePracticeFlow";
import { Loader2, Play, RefreshCcw } from "lucide-react";
import { motion } from "framer-motion";

export function PracticeView() {
  const {
    currentStep,
    setCurrentStep,
    questionIndex,
    currentQuestion,
    answers,
    report,
    isLoading,
    startSession,
    submitSessionAnswer,
    totalQuestions,
  } = usePracticeFlow();

  const { speak, isSpeaking, cancel: stopSpeech } = useSpeechSynthesis();
  const { isListening, transcript, startListening, stopListening } = useSpeechRecognition();
  const { seconds, startTimer, stopTimer, resetTimer } = useTimer();

  const [showPopup, setShowPopup] = useState(false);

  // Auto-start question playback when step is 'playing'
  useEffect(() => {
    if (currentStep === "playing" && currentQuestion) {
      speak(currentQuestion.question);
    }
  }, [currentStep, currentQuestion, speak]);

  const handleStartPractice = () => {
    startSession();
  };

  const handleToggleRecording = () => {
    if (isListening) {
      stopListening();
      stopTimer();
      setShowPopup(true);
      setCurrentStep("review");
    } else {
      stopSpeech();
      startListening();
      startTimer();
      setCurrentStep("recording");
    }
  };

  const handleConfirmAnswer = () => {
    submitSessionAnswer(transcript, seconds);
    setShowPopup(false);
  };

  const handleRetry = () => {
    setShowPopup(false);
    resetTimer();
    setCurrentStep("playing");
  };

  if (isLoading && currentStep !== "playing") {
    return (
      <PracticeLayout>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-muted font-medium">Preparing your session...</p>
        </div>
      </PracticeLayout>
    );
  }

  if (currentStep === "intro") {
    return (
      <PracticeLayout>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-xl"
        >
          <div className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-8 text-primary">
            <Play className="w-12 h-12 fill-current" />
          </div>
          <h1 className="text-4xl font-bold mb-4">Ready to Practice?</h1>
          <p className="text-muted mb-10 text-lg">
            We'll read out interview questions. You'll record your answers, and we'll track your performance.
          </p>
          <button
            onClick={handleStartPractice}
            disabled={isLoading}
            className="px-10 py-5 bg-primary text-white rounded-full font-bold text-xl hover:scale-105 transition-all shadow-xl disabled:opacity-50"
          >
            {isLoading ? "Starting..." : "Start Session"}
          </button>
        </motion.div>
      </PracticeLayout>
    );
  }

  if (currentStep === "report" && report) {
    return (
      <PracticeLayout>
        <div className="w-full max-w-4xl animate-fade-in">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h1 className="text-4xl font-bold mb-2">Practice Report</h1>
              <p className="text-muted">Overall Score: {report.overall_score}%</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="p-4 rounded-2xl bg-bg-muted hover:bg-bg-muted/80 transition-colors"
            >
              <RefreshCcw className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-12">
            <TimeStats answers={answers} />
            <div className="p-8 rounded-[40px] bg-white border border-border">
              <Heatmap total={report.total_questions} answeredCount={report.detailed_scores.length} />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="p-8 rounded-[40px] bg-primary/5 border border-primary/10">
                <h3 className="text-xl font-bold mb-4 text-primary">Strengths</h3>
                <ul className="space-y-3">
                  {report.strengths.map((s: string, i: number) => (
                    <li key={i} className="flex gap-2 text-foreground/80">
                      <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-8 rounded-[40px] bg-secondary/5 border border-secondary/10">
                <h3 className="text-xl font-bold mb-4 text-secondary">Recommendations</h3>
                <ul className="space-y-3">
                  {report.recommendations.map((r: string, i: number) => (
                    <li key={i} className="flex gap-2 text-foreground/80">
                      <div className="w-2 h-2 rounded-full bg-secondary mt-2 shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </PracticeLayout>
    );
  }

  return (
    <PracticeLayout>
      <AudioIndicator isPlaying={isSpeaking} />
      
      <div className="w-full max-w-4xl flex flex-col items-center">
        <QuestionDisplay 
          question={currentQuestion?.question || "Next Question..."} 
          index={questionIndex} 
          total={totalQuestions} 
        />

        <div className="relative mb-16">
          <UserAvatar isVibrating={isSpeaking} />
          {isListening && (
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-secondary text-white rounded-full text-xs font-bold uppercase tracking-widest animate-pulse">
              Recording 
            </div>
          )}
        </div>

        <RecordButton 
          isRecording={isListening} 
          onToggle={handleToggleRecording} 
          disabled={isSpeaking}
        />
      </div>

      <AnswerPopup 
        isOpen={showPopup}
        transcript={transcript}
        onConfirm={handleConfirmAnswer}
        onRetry={handleRetry}
      />
    </PracticeLayout>
  );
}
