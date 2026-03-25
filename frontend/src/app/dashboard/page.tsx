"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { Profile, ReportHistoryItem, JobRole, Topic } from "@/types";
import {
  FileText,
  AlertCircle,
  Clock,
  ChevronRight,
} from "lucide-react";
import { PageSkeleton } from "@/components/Skeleton";

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedRoleInput, setSelectedRoleInput] = useState("");
  const [interviewMode, setInterviewMode] = useState<"resume" | "topic">("resume");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [profileRes, historyRes, rolesRes, topicsRes] = await Promise.all([
        api.get("/profile"),
        api.get("/reports/history"),
        api.get("/admin/roles"),
        api.get("/admin/topics"),
      ]);
      setProfile(profileRes.data);
      setHistory(historyRes.data.reports || []);
      
      const availableRoles = rolesRes.data.roles || [];
      setRoles(availableRoles);
      const availableTopics = topicsRes.data.topics || [];
      setTopics(availableTopics);
      if (availableTopics.length > 0) {
        setSelectedTopicId(availableTopics[0].id);
      }
      
      // Auto-populate input if there are recommended roles
      const recRoles = profileRes.data?.resume?.parsed_data?.recommended_roles;
      if (recRoles && recRoles.length > 0) {
        setSelectedRoleInput(recRoles[0]);
      } else if (availableRoles.length > 0) {
        setSelectedRoleInput(availableRoles[0].title);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data", err);
    } finally {
      setLoading(false);
    }
  };

  const startInterview = async () => {
    if (interviewMode === "resume" && (!selectedRoleInput.trim() || !profile?.resume)) {
      alert("Please upload your resume first and select or type a job role.");
      return;
    }
    if (interviewMode === "topic" && !selectedTopicId) {
      alert("Please select a topic for topic-wise interview.");
      return;
    }
    
    try {
      const payload: any = {
        interview_type: interviewMode,
      };

      if (interviewMode === "topic") {
        payload.topic_id = selectedTopicId;
      } else {
        const matchingAdminRole = roles.find(
          (r) => r.title.toLowerCase() === selectedRoleInput.trim().toLowerCase()
        );
        if (matchingAdminRole) {
          payload.role_id = matchingAdminRole.id;
        } else {
          payload.custom_role = selectedRoleInput.trim();
        }
      }

      const { data } = await api.post("/interview/start", payload);
      const timerEnabled = !!data?.timer?.enabled;
      const timerSeconds = Number(data?.timer?.seconds || 0);
      const timerQuery =
        timerEnabled && timerSeconds > 0
          ? `&timerEnabled=1&timerSeconds=${timerSeconds}`
          : "";

      router.push(
        `/interview?session=${data.session_id}&q=${encodeURIComponent(
          data.question.question
        )}&qid=${data.question.question_id}&num=${data.question.question_number}&diff=${
          data.question.difficulty
        }&total=${data.question.total_questions || 5}${timerQuery}`
      );
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to start interview");
    }
  };

  if (loading) {
    return (
      <ProtectedRoute requiredRole="student">
        <Navbar />
        <PageSkeleton />
      </ProtectedRoute>
    );
  }

  const avgScore =
    history.length > 0
      ? Math.round(history.reduce((acc, h) => acc + h.overall_score, 0) / history.length)
      : 0;

  return (
    <ProtectedRoute requiredRole="student">
      <Navbar />
      <main className="pt-20 pb-12 px-4 max-w-7xl mx-auto">
        <div className="animate-fade-in">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              Welcome, {profile?.name?.split(" ")[0]}
            </h1>
            <p className="text-muted">Here's an overview of your interview progress.</p>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="p-6 rounded-xl bg-card border border-border flex items-center gap-4">
              <div className="p-3 bg-white/5 rounded-lg text-muted">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted mb-1">Total Interviews</p>
                <p className="text-2xl font-bold">{history.length}</p>
              </div>
            </div>
            <div className="p-6 rounded-xl bg-card border border-border flex items-center gap-4">
              <div className="w-1 h-14 rounded-full bg-amber-400/80" />
              <div className="flex-1">
                <p className="text-sm text-muted mb-1">Average Score</p>
                <p className="text-2xl font-bold tracking-tight">{avgScore}%</p>
              </div>
            </div>
            <div className="p-6 rounded-xl bg-card border border-border flex items-center gap-4">
              <div className={`w-1 h-14 rounded-full ${profile?.resume ? "bg-green-400/80" : "bg-rose-400/80"}`} />
              <div className="flex-1">
                <p className="text-sm text-muted mb-1">Resume Status</p>
                <p className={`text-xl font-bold ${profile?.resume ? "text-green-400" : "text-rose-400"}`}>
                  {profile?.resume ? "Uploaded" : "Missing"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-8">
              {/* Action Banner */}
              {!profile?.resume ? (
                <div className="p-6 rounded-xl bg-blue-500/10 border border-blue-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-6 h-6 text-blue-400 shrink-0" />
                    <div>
                      <h3 className="font-semibold text-blue-400">Upload Your Resume</h3>
                      <p className="text-sm text-blue-400/80">
                        We use your resume to personalize your interview questions.
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/settings"
                    className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
                  >
                    Go to Settings
                  </Link>
                </div>
              ) : (
                <div className="p-6 rounded-xl border border-border bg-gradient-to-br from-card to-white/5">
                  <h2 className="text-xl font-bold mb-2">Ready for a mock interview?</h2>
                  <p className="text-muted mb-6">
                    Choose Resume Interview or Topic Interview and start practicing.
                  </p>
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      onClick={() => setInterviewMode("resume")}
                      className={`px-3 py-1.5 rounded-lg text-sm border ${
                        interviewMode === "resume"
                          ? "bg-black text-white border-black"
                          : "bg-transparent text-muted border-border"
                      } cursor-pointer`}
                    >
                      Resume Interview
                    </button>
                    <button
                      onClick={() => setInterviewMode("topic")}
                      className={`px-3 py-1.5 rounded-lg text-sm border ${
                        interviewMode === "topic"
                          ? "bg-black text-white border-black"
                          : "bg-transparent text-muted border-border"
                      } cursor-pointer`}
                    >
                      Topic Interview
                    </button>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    {interviewMode === "resume" ? (
                      <div className="relative flex-1 w-full">
                        <input
                          type="text"
                          list="roles-suggestions"
                          value={selectedRoleInput}
                          onChange={(e) => setSelectedRoleInput(e.target.value)}
                          placeholder="e.g. Frontend Developer"
                          className="w-full px-4 py-2.5 rounded-lg bg-background border border-border focus:outline-none focus:border-white transition-colors"
                        />
                        <datalist id="roles-suggestions">
                          {profile?.resume?.parsed_data?.recommended_roles?.map((role, i) => (
                            <option key={`rec-${i}`} value={role}>
                              Recommended by AI
                            </option>
                          ))}
                          {roles.map((r) => (
                            <option key={`admin-${r.id}`} value={r.title}>
                              Standard Role
                            </option>
                          ))}
                        </datalist>
                      </div>
                    ) : (
                      <select
                        value={selectedTopicId}
                        onChange={(e) => setSelectedTopicId(e.target.value)}
                        className="flex-1 w-full"
                      >
                        {topics.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={startInterview}
                      className="w-full sm:w-auto px-6 py-2.5 bg-white text-black hover:bg-gray-200 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      Start Practice
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: History */}
            <div className="space-y-4">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Recent Reports
              </h2>
              {history.length === 0 ? (
                <div className="p-6 rounded-xl border border-border border-dashed text-center">
                  <p className="text-sm text-muted">No interviews completed yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.slice(0, 5).map((r) => (
                    <Link
                      href={`/report/${r.session_id}`}
                      key={r.session_id}
                      className="block p-4 rounded-xl bg-card border border-border hover:border-border-light transition-colors group"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-medium text-sm group-hover:text-white transition-colors truncate pr-4">
                          {r.role_title || "Mock Interview"}
                        </h3>
                        <span
                          className={`text-sm font-bold shrink-0 ${
                            r.overall_score >= 70
                              ? "text-green-400"
                              : r.overall_score >= 40
                              ? "text-yellow-400"
                              : "text-red-400"
                          }`}
                        >
                          {r.overall_score}%
                        </span>
                      </div>
                      <p className="text-xs text-muted">
                        {new Date(r.completed_at).toLocaleDateString()}
                      </p>
                    </Link>
                  ))}
                  {history.length > 5 && (
                    <Link
                      href="/reports"
                      className="block text-center text-sm text-muted hover:text-white py-2"
                    >
                      View all reports →
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
