"use client";

import { useState, useCallback } from "react";

import { interviewService } from "@/services/interview.service";
import { toast } from "sonner";
import { PracticeStep, InterviewQuestion, InterviewReport } from "@/types";

export const usePracticeFlow = (initialSessionId?: string | null, initialQuestion?: InterviewQuestion | null) => {
  // Always start at intro so the user must click START SESSION (this bypasses browser audio autoplay blocks)
  const [currentStep, setCurrentStep] = useState<PracticeStep>("intro");
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null);
  const [currentQuestion, setCurrentQuestion] = useState<InterviewQuestion | null>(initialQuestion || null);
  const [answers, setAnswers] = useState<{ questionId: string; time: number; transcript: string }[]>([]);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const startSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await interviewService.startInterview();
      setSessionId(data.session_id);
      setCurrentQuestion(data.question);
      setCurrentStep("playing");
    } catch (error) {
      toast.error("Failed to start session", { description: "Please try again later." });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resumeSession = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      // In a real app, we might fetch the latest state. 
      // For now, if we have the question from searchParams, we are good.
      setSessionId(id);
      setCurrentStep("playing");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const submitSessionAnswer = useCallback(async (transcript: string, timeTaken: number) => {
    if (!sessionId || !currentQuestion) return;

    setIsLoading(true);
    try {
      const data = await interviewService.submitAnswer(sessionId, currentQuestion.question_id, transcript);
      
      setAnswers(prev => [...prev, { questionId: currentQuestion.question_id, time: timeTaken, transcript }]);

      if (data.is_complete) {
        const reportData = await interviewService.getReport(sessionId);
        setReport(reportData);
        setCurrentStep("report");
      } else if (data.next_question) {
        setCurrentQuestion(data.next_question);
        setCurrentStep("playing");
      }
    } catch (error) {
      toast.error("Failed to submit answer", { description: "Please check your connection." });
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, currentQuestion]);

  return {
    currentStep,
    setCurrentStep,
    sessionId,
    currentQuestion,
    answers,
    report,
    isLoading,
    startSession,
    resumeSession,
    submitSessionAnswer,
    totalQuestions: currentQuestion?.total_questions || 10,
    questionIndex: (currentQuestion?.question_number || 1) - 1,
  };
};
