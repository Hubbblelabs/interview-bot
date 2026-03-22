"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import { PracticeLayout } from "@/components/practice/PracticeLayout";
import { UserAvatar } from "@/components/practice/UserAvatar";
import { RecordButton } from "@/components/practice/AudioInterface";
import { AnswerPopup } from "@/components/practice/AnswerPopup";
import { TimeStats } from "@/components/practice/report/TimeStats";
import { Heatmap } from "@/components/practice/report/Heatmap";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useTimer } from "@/hooks/useTimer";
import { usePracticeFlow } from "@/hooks/usePracticeFlow";
import { Loader2, RefreshCcw, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { SmokeBackground } from "@/components/ui/spooky-smoke-animation";

function InterviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Extracts initial state from URL if available
  const initialSessionId = searchParams.get("session");
  const initialQuestion = initialSessionId ? {
    question_id: searchParams.get("qid") || "",
    question: searchParams.get("q") || "",
    difficulty: searchParams.get("diff") || "medium",
    question_number: parseInt(searchParams.get("num") || "1"),
    total_questions: parseInt(searchParams.get("total") || "10")
  } : null;

  const {
    currentStep,
    setCurrentStep,
    sessionId,
    currentQuestion,
    answers,
    report,
    isLoading,
    startSession,
    submitSessionAnswer,
    totalQuestions,
    questionIndex,
  } = usePracticeFlow(initialSessionId, initialQuestion);

  const { speak, isSpeaking, cancel: stopSpeech } = useSpeechSynthesis();
  const { isListening, transcript, startListening, stopListening } = useSpeechRecognition();
  const { seconds, startTimer, stopTimer, resetTimer } = useTimer();

  const [showPopup, setShowPopup] = useState(false);

  const [isAudioMuted, setIsAudioMuted] = useState(false);

  // Auto-start question playback
  useEffect(() => {
    if (currentStep === "playing" && currentQuestion && !isAudioMuted) {
      speak(currentQuestion.question);
    }
  }, [currentStep, currentQuestion, speak, isAudioMuted]);

  const handleStartInterview = () => {
    if (initialSessionId) {
      setCurrentStep("playing");
    } else {
      startSession();
    }
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
    resetTimer();
  };

  const handleRetry = () => {
    setShowPopup(false);
    resetTimer();
    setCurrentStep("playing");
  };

  const handleQuit = () => {
    if (window.confirm("Are you sure you want to quit?")) {
      router.push("/dashboard");
    }
  };

  // Reusable Sidebar Content (Left Half)
  const SidebarContent = (
    <div className="flex flex-col h-full items-center justify-center p-12 relative bg-white font-sans overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute top-12 left-12 opacity-5 pointer-events-none">
        <span className="text-[12rem] font-black uppercase tracking-tighter leading-none select-none">
          Live<br/>Prep
        </span>
      </div>

      <div className="space-y-4 w-full max-w-sm relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-morphism p-10 rounded-[3rem] flex flex-col items-center justify-center gap-10 text-center border border-primary/10 shadow-[0_50px_100px_rgba(0,0,0,0.05)] backdrop-blur-3xl bg-white/40"
        >
          {/* Question Progress */}
          <div className="space-y-2">
            <span className="text-[12px] font-black uppercase tracking-[0.3em] text-primary/30">Current Question</span>
            <div className="text-6xl font-black text-primary tracking-tighter tabular-nums">
              {questionIndex + 1}<span className="text-primary/20">/{totalQuestions}</span>
            </div>
          </div>
          
          <div className="h-px w-20 bg-primary/5" />
          
          {/* Difficulty */}
          <div className="space-y-3">
            <span className="text-[12px] font-black uppercase tracking-[0.3em] text-primary/30">Difficulty</span>
            <div className="px-6 py-2 bg-primary text-white text-[12px] font-black rounded-full uppercase tracking-[0.2em] shadow-xl shadow-primary/20">
              {currentQuestion?.difficulty || "Medium"}
            </div>
          </div>

          <div className="h-px w-20 bg-primary/5" />

          {/* TIMER */}
          <div className="space-y-2">
            <span className="text-[12px] font-black uppercase tracking-[0.3em] text-primary/30">Session Clock</span>
            <div className="text-7xl font-mono font-black text-primary tracking-tight tabular-nums">
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Red Quit Button at Bottom Right of Left Panel */}
      <div className="absolute bottom-12 right-12 z-20">
        <button
          onClick={handleQuit}
          className="flex items-center gap-3 py-4 px-8 rounded-2xl border-2 border-red-50 to-red-500/10 text-red-500 font-black text-sm uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-xl hover:shadow-red-500/20 group"
        >
          <XCircle className="w-5 h-5 group-hover:rotate-90 transition-transform" />
          Quit Interview
        </button>
      </div>
    </div>
  );

  if (isLoading && currentStep !== "playing") {
    return (
      <PracticeLayout>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-muted font-medium">Initialising Session...</p>
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
          <div className="w-24 h-24 bg-primary/10 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 text-primary shadow-2xl">
            <div className="w-4 h-4 bg-primary rounded-full animate-ping" />
          </div>
          <h1 className="text-6xl font-black mb-6 tracking-tighter text-primary leading-none">Ready to <br/>Succeed?</h1>
          <p className="text-muted-foreground mb-12 text-2xl font-medium tracking-tight">
            Our AI is ready to evaluate your response.
          </p>
          <button
            onClick={handleStartInterview}
            className="px-14 py-7 bg-primary text-white rounded-4xl font-black text-2xl hover:bg-black transition-all shadow-[0_30px_60px_rgba(23,77,56,0.3)] hover:scale-105 active:scale-95"
          >
            {initialSessionId ? "RESUME SESSION" : "START SESSION"}
          </button>
        </motion.div>
      </PracticeLayout>
    );
  }

  if (currentStep === "report" && report) {
    return (
      <ProtectedRoute requiredRole="student">
        <Navbar />
        <PracticeLayout sideContent={SidebarContent}>
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-full max-w-4xl animate-fade-in p-8 lg:p-16">
              <div className="flex items-center justify-between mb-20">
                <div>
                  <h1 className="text-7xl font-black tracking-tighter mb-4 text-primary leading-none">Session <br/>Report</h1>
                  <p className="text-muted-foreground text-2xl font-black uppercase tracking-widest opacity-20">Score: {report.overall_score}%</p>
                </div>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="w-20 h-20 rounded-4xl bg-primary text-white flex items-center justify-center hover:bg-black transition-all shadow-2xl hover:rotate-180 duration-700"
                >
                  <RefreshCcw className="w-10 h-10" />
                </button>
              </div>

              <div className="space-y-20">
                <TimeStats answers={answers} />
                <div className="p-16 rounded-[4rem] bg-white border border-primary/5 shadow-[0_40px_100px_rgba(0,0,0,0.03)] text-center">
                  <Heatmap total={report.total_questions} answeredCount={report.detailed_scores.length} />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="p-12 rounded-[3.5rem] bg-primary/5 border border-primary/10 shadow-sm">
                    <h3 className="text-2xl font-black mb-8 text-primary uppercase tracking-tight">Key Strengths</h3>
                    <ul className="space-y-5">
                      {report.strengths.map((s, i) => (
                        <li key={i} className="flex gap-5 text-foreground/80 font-bold leading-relaxed">
                          <div className="w-2.5 h-2.5 rounded-full bg-primary mt-2.5 shrink-0 animate-pulse" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-12 rounded-[3.5rem] bg-secondary/5 border border-secondary/10 shadow-sm">
                    <h3 className="text-2xl font-black mb-8 text-secondary uppercase tracking-tight">Areas to Improve</h3>
                    <ul className="space-y-5">
                      {report.recommendations.map((r, i) => (
                        <li key={i} className="flex gap-5 text-foreground/80 font-bold leading-relaxed">
                          <div className="w-2.5 h-2.5 rounded-full bg-secondary mt-2.5 shrink-0 animate-pulse" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </PracticeLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requiredRole="student">
      <Navbar />
      <PracticeLayout sideContent={SidebarContent}>
        <div className="w-full max-w-5xl flex flex-col items-center h-full justify-between py-24 relative overflow-hidden">
          {/* Full Page Smoke Background (Right Side Only) */}
          <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
            <SmokeBackground smokeColor="#BAE6FD" baseColor="transparent" brightness={0.05} />
            </div>
          {/* </div>Header w Mute Toggle & Question */} 
          <div className="w-full text-center px-12 relative z-10 flex flex-col items-center">
            <button
              onClick={() => {
                if (isSpeaking) {
                  stopSpeech();
                }
                setIsAudioMuted(!isAudioMuted);
              }}
              className={`mb-8 p-4 rounded-full border-2 transition-all shadow-xl flex items-center justify-center gap-3 ${
                isAudioMuted 
                  ? 'border-red-500 bg-red-50 text-red-500' 
                  : 'border-primary/20 bg-primary/5 text-primary hover:bg-primary hover:text-white'
              }`}
            >
               {isAudioMuted ? (
                 <>
                   <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                     <line x1="1" y1="1" x2="23" y2="23"></line>
                     <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                     <line x1="23" y1="9" x2="17" y2="15"></line>
                     <line x1="17" y1="9" x2="23" y2="15"></line>
                   </svg>
                   <span className="font-bold uppercase tracking-wider text-sm">Audio Muted</span>
                 </>
               ) : (
                 <>
                   <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                     <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                     <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                     <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                   </svg>
                   <span className="font-bold uppercase tracking-wider text-sm">Audio Enabled</span>
                 </>
               )}
            </button>
          {/* Top: Question */}
          <div className="w-full text-center px-12 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="inline-flex items-center gap-3 px-4 py-2 bg-primary/5 rounded-full">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/40">Current Enquiry</span>
              </div>
              <h2 
                className="text-5xl md:text-6xl font-black text-primary leading-tight tracking-tighter cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  if (currentQuestion?.question && !isAudioMuted) {
                    speak(currentQuestion.question);
                  }
                }}
                title={isAudioMuted ? "Unmute to hear audio" : "Click to replay audio"}
              >
                {currentQuestion?.question || "Synthesizing next prompt..."}
              </h2>
            </motion.div>
          </div>

          {/* Middle: Interaction Zone */}
          <div className="flex items-center justify-center gap-32 relative w-full px-20 z-10">
            {/* Concentric Circle Mimic (Faint Rings) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <div className="w-112.5 h-112.5 rounded-full border border-primary/5 opacity-40" />
              <div className="absolute inset-0 m-12 rounded-full border border-primary/5 opacity-20" />
              <div className="absolute inset-0 -m-12 rounded-full border border-primary/5 opacity-10" />
            </div>

            {/* User Side - Mic Circle */}
            <div className="relative group">
              <button
                onClick={handleToggleRecording}
                disabled={isSpeaking && !isAudioMuted}
                className={`relative w-64 h-64 rounded-full bg-transparent flex flex-col items-center justify-center border-8 border-transparent transition-all overflow-visible active:scale-95 disabled:opacity-30 ${
                  isListening ? 'border-secondary scale-110 shadow-secondary/20' : ''
                }`}
              >
                <div className={`w-24 h-24 rounded-full bg-transparent flex items-center justify-center transition-all shadow-xl border border-primary/5 ${
                  isListening ? 'text-secondary' : 'text-primary'
                }`}>
                  <RecordButton 
                    isRecording={isListening} 
                    onToggle={() => {}} 
                    disabled={isSpeaking}
                    className="w-full! h-full! shadow-none bg-transparent"
                  />
                </div>
                <span className="mt-8 text-[12px] font-black uppercase tracking-[0.3em] text-primary/40 group-hover:text-primary transition-colors">You</span>
                {isListening && (
                  <div className="absolute -bottom-12 flex gap-1.5 items-end h-8">
                    {[1,2,3,4,5].map(i => (
                      <motion.div 
                        key={i}
                        animate={{ height: [4, 24, 4] }}
                        transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                        className="w-1.5 bg-secondary rounded-full shadow-[0_0_10px_rgba(239,68,68,0.3)]"
                      />
                    ))}
                  </div>
                )}
              </button>
            </div>

            {/* AI Side - Avatar/AI Text Circle */}
            <div className="relative group">
              <div className={`relative w-64 h-64 rounded-full bg-transparent flex flex-col items-center justify-center border-8 border-transparent transition-all ${
                isSpeaking ? 'border-primary' : ''
              }`}>
                <div className={`w-24 h-24 rounded-full bg-white text-primary flex items-center justify-center shadow-xl border border-primary/5 transition-all ${
                  isSpeaking ? 'scale-110 shadow-primary/20' : ''
                }`}>
                  <span className="font-black text-4xl tracking-tighter">AI</span>
                </div>
                <span className="mt-8 text-[12px] font-black uppercase tracking-[0.3em] text-primary/20">Coach</span>
                {isSpeaking && (
                  <div className="absolute -bottom-16">
                    <UserAvatar isVibrating={true} className="w-16! h-16! opacity-10 grayscale brightness-200" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom: Status Guidance */}
          <div className="text-center relative z-10">
            <motion.div
              animate={isListening || isSpeaking ? { y: [0, -5, 0] } : {}}
              transition={{ repeat: Infinity, duration: 2 }}
              className="px-8 py-3 rounded-2xl bg-primary/5 backdrop-blur-sm border border-primary/10"
            >
              <p className="text-[12px] font-black uppercase tracking-[0.6em] text-primary/60">
                {isListening ? "Processing Voice Feed" : isSpeaking ? "Transmitting Insights" : "Waiting for Transmission"}
              </p>
            </motion.div>
          </div>
        </div>

        <AnswerPopup 
          isOpen={showPopup}
          transcript={transcript}
          onConfirm={handleConfirmAnswer}
          onRetry={handleRetry}
        />
        </div>
      </PracticeLayout>
    </ProtectedRoute>
  );
}

export default function InterviewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-6">
          <Loader2 className="w-16 h-16 animate-spin text-primary" />
          <p className="text-primary/40 font-black text-sm uppercase tracking-widest">Syndicating Environment</p>
        </div>
      </div>
    }>
      <InterviewContent />
    </Suspense>
  );
}
