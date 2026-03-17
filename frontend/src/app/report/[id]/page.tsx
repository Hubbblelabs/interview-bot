"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { InterviewReport } from "@/types";
import {
  TrendingUp,
  TrendingDown,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  BarChart3,
} from "lucide-react";

export default function ReportPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);

  useEffect(() => {
    fetchReport();
  }, [sessionId]);

  const fetchReport = async () => {
    try {
      const { data } = await api.get(`/interview/report?session_id=${sessionId}`);
      setReport(data);
    } catch (err) {
      console.error("Failed to fetch report:", err);
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (score: number) =>
    score >= 70 ? "text-green-400" : score >= 40 ? "text-yellow-400" : "text-red-400";

  const scoreBg = (score: number) =>
    score >= 70 ? "bg-green-500/10 border-green-500/20" : score >= 40 ? "bg-yellow-500/10 border-yellow-500/20" : "bg-red-500/10 border-red-500/20";

  if (loading) {
    return (
      <ProtectedRoute requiredRole="student">
        <Navbar />
        <main className="pt-20 pb-12 px-4 max-w-4xl mx-auto">
          <div className="animate-pulse-slow text-center text-muted mt-20">
            Loading report...
          </div>
        </main>
      </ProtectedRoute>
    );
  }

  if (!report) {
    return (
      <ProtectedRoute requiredRole="student">
        <Navbar />
        <main className="pt-20 pb-12 px-4 max-w-4xl mx-auto">
          <div className="text-center text-muted mt-20">Report not found.</div>
        </main>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requiredRole="student">
      <Navbar />
      <main className="pt-20 pb-12 px-4 max-w-4xl mx-auto">
        <div className="animate-fade-in">
          <div className="text-center mb-8">
            <p className="text-sm text-muted mb-2">
              {report.role_title || "Interview"} • {new Date(report.completed_at).toLocaleDateString()}
            </p>
            <div className={`inline-flex items-center justify-center w-28 h-28 rounded-full border-4 ${scoreBg(report.overall_score)} mb-3`}>
              <span className={`text-4xl font-bold ${scoreColor(report.overall_score)}`}>
                {report.overall_score}
              </span>
            </div>
            <p className="text-lg font-semibold">Overall Score</p>
            <p className="text-sm text-muted">{report.total_questions} questions answered</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="p-5 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-green-400" />
                <h3 className="font-semibold text-green-400">Strengths</h3>
              </div>
              <ul className="space-y-2">
                {report.strengths.map((s, i) => (
                  <li key={i} className="text-sm text-muted flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-5 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-5 h-5 text-red-400" />
                <h3 className="font-semibold text-red-400">Areas to Improve</h3>
              </div>
              <ul className="space-y-2">
                {report.weaknesses.map((w, i) => (
                  <li key={i} className="text-sm text-muted flex items-start gap-2">
                    <span className="text-red-400 mt-0.5">•</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {report.recommendations?.length > 0 && (
            <div className="p-5 rounded-xl bg-card border border-border mb-8">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-5 h-5 text-yellow-400" />
                <h3 className="font-semibold">Recommendations</h3>
              </div>
              <ul className="space-y-2">
                {report.recommendations.map((r, i) => (
                  <li key={i} className="text-sm text-muted flex items-start gap-2">
                    <span className="text-yellow-400 mt-0.5">{i + 1}.</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-5 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-muted" />
              <h3 className="font-semibold">Question Breakdown</h3>
            </div>
            <div className="space-y-3">
              {report.detailed_scores.map((qs, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-background border border-border overflow-hidden"
                >
                  <button
                    className="w-full p-4 text-left flex items-center justify-between"
                    onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                  >
                    <div className="flex-1 pr-4">
                      <p className="text-sm font-medium truncate">{qs.question}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`font-bold ${scoreColor(qs.score)}`}>
                        {qs.score}%
                      </span>
                      {expandedQ === i ? (
                        <ChevronUp className="w-4 h-4 text-muted" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted" />
                      )}
                    </div>
                  </button>
                  {expandedQ === i && (
                    <div className="px-4 pb-4 border-t border-border pt-3 animate-fade-in">
                      <div className="mb-3">
                        <p className="text-xs text-muted mb-1">Your Answer</p>
                        <p className="text-sm bg-white/5 p-3 rounded-lg">{qs.answer}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted mb-1">Feedback</p>
                        <p className="text-sm text-muted">{qs.feedback}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
